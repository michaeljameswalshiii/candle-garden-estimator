import json
import os
import boto3
import base64
import logging
import re
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
bedrock_runtime = boto3.client("bedrock-runtime", region_name=AWS_REGION)

# Primary: Claude Sonnet 4.5 (best vision accuracy on Bedrock for this task)
# Use US inference profile when available (on-demand routing for newer Claude models).
CLAUDE_MODEL_ID = os.environ.get(
    "CLAUDE_MODEL_ID",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
)
# Fallback: Nova Pro (cheaper/faster if Claude fails or is unavailable)
NOVA_MODEL_ID = os.environ.get("NOVA_MODEL_ID", "amazon.nova-pro-v1:0")

# No min/max volume caps — accept any positive finite ounce estimate.
MIN_CONFIDENCE = float(os.environ.get("MIN_CONFIDENCE", "0.5"))

VISION_PROMPT = """You are an expert candle refill estimator for The Candle Garden studio.

Analyze the image and detect ALL possible candle vessels (jars, glasses, mugs, or any containers that appear to hold or have held candle wax).

Important rules:
- Use the blue Athletic Brewing beer can (standard 12 oz / 355 ml can) **only as a scale reference**. Do NOT count the beer can itself as a candle vessel.
- Ignore coffee mugs with liquid, drinking glasses, boxes, plastic containers, and other non-candle items unless they clearly contain candle wax.
- For each detected candle vessel, estimate:
  - Description (color, material, any visible brand/label)
  - Approximate full capacity in ounces
  - Current wax remaining (%)
  - Wax needed for a full refill (in oz and grams)
- Be conservative and realistic with estimates.
- If you cannot confidently detect a candle vessel, set container_detected to false and confidence low.
- There is no minimum or maximum vessel size — estimate the true volume for small tealights through large multi-wick vessels.

Return ONLY valid JSON, no other text:

{
  "success": true,
  "container_detected": true,
  "vessels": [
    {
      "description": "Brief description of the vessel and any visible brand",
      "full_capacity_oz": 9,
      "current_wax_percent": 20,
      "wax_needed_oz": 7.2,
      "wax_needed_grams": 205,
      "notes": "Any additional observations"
    }
  ],
  "total_wax_needed_oz": 7.2,
  "total_wax_needed_grams": 205,
  "confidence": 0.85,
  "explanation": "Brief summary of what was detected and scale used",
  "refill_recommendations": {
    "soy_wax_grams": 205,
    "fragrance_ml": "12-16 (6-8% load)",
    "suggested_price": "$20-26",
    "priority": "Any recommendations"
  }
}
"""

MEDIA_TYPES = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}


def _json_response(status_code, payload):
    return {
        "statusCode": status_code,
        "body": json.dumps(payload),
        "headers": {"Content-Type": "application/json"},
    }


def _fail_closed(tips=None, error=None, status_code=200):
    """Never invent a volume quote on failure — force manual entry on the client."""
    body = {
        "success": False,
        "container_detected": False,
        "confidence": 0.0,
        "tips": tips or [
            "Try better lighting or a cleaner photo",
            "Include a known-size object for scale if possible",
            "Or enter volume manually",
        ],
    }
    if error:
        body["error"] = error
    return _json_response(status_code, body)


def _detect_format_from_bytes(raw: bytes) -> str:
    """Detect image format from magic bytes."""
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a"):
        return "gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return "jpeg"


def _normalize_image(body):
    """Return (base64_bytes_str, format, error_response_or_None)."""
    image_data = body.get("image", "")

    if image_data and isinstance(image_data, str) and image_data.startswith("http"):
        try:
            with urllib.request.urlopen(image_data) as resp:
                raw = resp.read()
                image_format = _detect_format_from_bytes(raw)
                image_data = base64.b64encode(raw).decode("utf-8")
                return image_data, image_format, None
        except Exception as e:
            logger.error(f"Failed to fetch image from URL: {e}")
            return None, None, _json_response(400, {
                "success": False,
                "error": f"Failed to fetch image: {str(e)}",
            })

    if not image_data:
        return None, None, _json_response(400, {
            "success": False,
            "error": "image data is empty",
        })

    image_format = None
    if isinstance(image_data, str) and image_data.startswith("data:"):
        try:
            header, image_data = image_data.split(",", 1)
            if "png" in header:
                image_format = "png"
            elif "webp" in header:
                image_format = "webp"
            elif "gif" in header:
                image_format = "gif"
            else:
                image_format = "jpeg"
        except Exception:
            pass

    # Detect from magic bytes when prefix is missing (mobile sends raw base64)
    if image_format is None:
        try:
            raw = base64.b64decode(image_data)
            image_format = _detect_format_from_bytes(raw)
        except Exception:
            image_format = "jpeg"

    logger.info(f"Normalized image format={image_format}")
    return image_data, image_format, None


def _parse_model_json(text):
    """Extract JSON object from model text response."""
    if not text:
        return None

    json_match = re.search(r"\{[\s\S]*\}", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


def _invoke_claude(image_data, image_format):
    """Call Claude (Anthropic Messages API on Bedrock). Returns response text."""
    media_type = MEDIA_TYPES.get(image_format, "image/jpeg")
    # Claude is pickier about formats; fall back jpeg media type for unknown
    if image_format == "webp":
        # Some Claude endpoints reject webp — still try; fallback path handles failure
        media_type = "image/webp"

    body = {
        # Required for Claude 3/4 on Bedrock (Sonnet 4.5 rejects bedrock-2023-06-01)
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "temperature": 0.0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": VISION_PROMPT,
                    },
                ],
            }
        ],
    }

    response = bedrock_runtime.invoke_model(
        modelId=CLAUDE_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    response_body = json.loads(response["body"].read())
    content = response_body.get("content") or []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            return block.get("text", "")
    # Older shapes
    if content and isinstance(content[0], dict):
        return content[0].get("text", "")
    return ""


def _invoke_nova(image_data, image_format):
    """Call Amazon Nova Pro. Returns response text."""
    response = bedrock_runtime.invoke_model(
        modelId=NOVA_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "messages": [{
                "role": "user",
                "content": [
                    {"image": {"format": image_format if image_format != "jpg" else "jpeg",
                               "source": {"bytes": image_data}}},
                    {"text": VISION_PROMPT},
                ],
            }],
            "inferenceConfig": {
                "max_new_tokens": 800,
                "temperature": 0.0,
                "topP": 0.95,
            },
        }),
    )
    response_body = json.loads(response["body"].read())
    return (
        response_body.get("output", {})
        .get("message", {})
        .get("content", [{}])[0]
        .get("text", "")
    )


def _build_success_response(result, model_used):
    """
    Validate parsed model JSON and build API response (fail-closed).

    Returns:
      - dict API response on success
      - ("not_detected", tips) when model clearly found no vessel
      - ("low_confidence", tips) when volume present but confidence too low
      - None when parse/shape is unusable (caller may try fallback model)
    """
    if not result or not isinstance(result, dict):
        return None

    vessels = result.get("vessels") or []
    container_detected = bool(result.get("container_detected", bool(vessels)))
    conf = float(result.get("confidence", 0.0) or 0.0)

    raw_oz = (
        result.get("total_wax_needed_oz")
        or result.get("total_volume_oz")
        or result.get("estimated_ounces")
    )
    if raw_oz is None and vessels:
        try:
            total = sum(float(v.get("wax_needed_oz") or 0) for v in vessels)
            raw_oz = total if total > 0 else None
        except (TypeError, ValueError):
            raw_oz = None

    if not container_detected or raw_oz is None:
        # Explicit no-vessel is a valid model answer — do not treat as parse failure
        tips = result.get("tips") or [
            "No candle vessel clearly detected",
            "Make sure the vessel is well-lit",
            "Take photo from above or side",
            "Or enter volume manually",
        ]
        if result.get("explanation"):
            tips = [result["explanation"]] + list(tips)
        return ("not_detected", tips)

    try:
        est_oz = float(raw_oz)
    except (TypeError, ValueError):
        return None

    # Accept any positive volume — no min/max cap; reject NaN
    if not (est_oz > 0) or est_oz != est_oz:
        return None

    if conf < MIN_CONFIDENCE:
        return (
            "low_confidence",
            [
                "Low confidence detection — please confirm volume manually",
                "Better lighting or a scale reference often helps",
            ],
        )

    est_grams = result.get("total_wax_needed_grams")
    try:
        est_grams = float(est_grams) if est_grams is not None else est_oz * 28.35
    except (TypeError, ValueError):
        est_grams = est_oz * 28.35

    if est_grams < 1:
        est_grams = est_oz * 28.35

    return _json_response(200, {
        "success": True,
        "container_detected": True,
        "estimated_ounces": round(est_oz, 1),
        "total_volume_oz": round(est_oz, 1),
        "estimated_grams": round(est_grams, 1),
        "vessels": vessels,
        "confidence": round(conf, 2),
        "container_type": "Candle vessel(s)",
        "explanation": result.get("explanation", "Refill estimate based on visual analysis"),
        "refill_recommendations": result.get("refill_recommendations") or {},
        "model_used": model_used,
        "tips": [
            "Fully clean vessel for best results",
            "Good overhead lighting helps",
            "Multiple vessels? We'll calculate total refill",
        ],
    })


def analyze_image(body):
    """
    Primary: Claude Sonnet vision.
    Fallback: Amazon Nova Pro if Claude errors or returns unusable output.
    Fail closed: never invent a default ounce quote.
    """
    image_data, image_format, err = _normalize_image(body)
    if err:
        return err

    last_error = None
    models_tried = []

    def _handle_built(built, model_label, raw_text):
        """Map _build_success_response outcome to response or None (continue)."""
        if built is None:
            logger.warning(
                f"{model_label} unusable output (first 300 chars): {(raw_text or '')[:300]}"
            )
            return None
        if isinstance(built, tuple):
            reason, tips = built
            return _fail_closed(tips=tips, error=reason)
        if isinstance(built, dict):
            return built
        return None

    # --- Primary: Claude ---
    try:
        logger.info(f"Invoking Claude model: {CLAUDE_MODEL_ID}")
        text = _invoke_claude(image_data, image_format)
        models_tried.append("claude")
        result = _parse_model_json(text)
        handled = _handle_built(
            _build_success_response(result, CLAUDE_MODEL_ID),
            "Claude",
            text,
        )
        if handled is not None:
            return handled
        logger.warning("Claude did not yield a quote; trying Nova fallback")
    except Exception as e:
        last_error = str(e)
        logger.error(f"Claude invoke failed: {e}")

    # --- Fallback: Nova Pro ---
    try:
        logger.info(f"Invoking Nova fallback: {NOVA_MODEL_ID}")
        text = _invoke_nova(image_data, image_format)
        models_tried.append("nova")
        result = _parse_model_json(text)
        handled = _handle_built(
            _build_success_response(result, NOVA_MODEL_ID),
            "Nova",
            text,
        )
        if handled is not None:
            return handled
        logger.warning("Nova did not yield a quote")
    except Exception as e:
        last_error = str(e)
        logger.error(f"Nova invoke failed: {e}")

    tips = [
        "Vision analysis could not produce a reliable estimate",
        "Try a clearer photo or enter volume manually",
    ]
    if models_tried:
        tips.append(f"Models tried: {', '.join(models_tried)}")

    return _fail_closed(
        error=last_error or "No usable vision result",
        tips=tips,
    )


def handler(event, context):
    try:
        body_raw = event.get("body")

        if body_raw is None:
            body = {}
        elif isinstance(body_raw, str):
            try:
                body = json.loads(body_raw) if body_raw.strip() else {}
            except json.JSONDecodeError:
                body = body_raw
        else:
            body = body_raw

        if not isinstance(body, dict):
            body = {"raw": str(body)}

        if "image" not in body or not body.get("image"):
            return _json_response(400, {
                "error": "image (base64 or url) is required",
                "success": False,
            })

        return analyze_image(body)
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return _fail_closed(error=str(e), status_code=500)
