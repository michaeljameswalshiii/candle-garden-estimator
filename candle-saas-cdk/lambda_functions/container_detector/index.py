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

# Prefer models enabled on this account. Sonnet 5 / Grok 4.6 are listed in Bedrock
# but not entitled here (AccessDenied) — defaults use working Sonnet 4.6 / 4.5.
CLAUDE_MODEL_ID = os.environ.get(
    "CLAUDE_MODEL_ID",
    "us.anthropic.claude-sonnet-4-6",
)
CLAUDE_FALLBACK_MODEL_ID = os.environ.get(
    "CLAUDE_FALLBACK_MODEL_ID",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
)
NOVA_MODEL_ID = os.environ.get("NOVA_MODEL_ID", "us.amazon.nova-premier-v1:0")
GROK_MODEL_ID = os.environ.get("GROK_MODEL_ID", "").strip()
GROK_REASONING_EFFORT = os.environ.get("GROK_REASONING_EFFORT", "low").strip() or "low"
SKIP_GROK = os.environ.get("SKIP_GROK", "1").strip().lower() in ("1", "true", "yes")
MIN_CONFIDENCE = float(os.environ.get("MIN_CONFIDENCE", "0.5"))
RATE_LIMIT_TABLE = os.environ.get("RATE_LIMIT_TABLE", "candle-garden-detect-rate-limits")
GUEST_DETECT_LIMIT = int(os.environ.get("GUEST_DETECT_LIMIT", "20"))
AUTH_DETECT_LIMIT = int(os.environ.get("AUTH_DETECT_LIMIT", "80"))
RATE_WINDOW_SECONDS = int(os.environ.get("RATE_WINDOW_SECONDS", "3600"))

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)

# Bedrock vision accepts jpeg/png/gif/webp — not HEIC/HEIF (iPhone default).
SUPPORTED_FORMATS = {"jpeg", "jpg", "png", "gif", "webp"}

COUNT_PROMPT = """You are counting candle vessels for The Candle Garden refill studio.

Customers photograph one or more containers they want REFILLED. List EVERY refillable vessel. Do NOT estimate ounces yet.

## SCALE ONLY — never list as a vessel
Any aluminum beverage can used for size reference (standard **12 fl oz / 355 ml**): Athletic Brewing, Alani, seltzer, soda. Brand does not matter. Do NOT put the can in vessels[].

## INCLUDE as a candle vessel
- Wick, wick tab, or metal wick clip (even empty glass)
- Glass jar, tumbler, amber/apothecary jar, metal tin
- Ceramic mug staged for candles
- Votives, bowls used as candles
- Small short jars next to taller ones — count separately

## Do NOT include
- Beverage cans (scale)
- Boxes, bags, paper towels, furniture, food packaging
- Closed liquor/water bottles
- Background shelf candles unless in the refill group
- Wax melts / cubes

## Count rules
- If the photo shows N jars/mugs/glasses + 1 scale can → vessel_count = N
- Do NOT merge two similar tumblers
- Always include the smallest short jar if it has a wick
- vessel_count MUST equal vessels.length

<<EXPECTED_LINE>>

Return ONLY JSON:
{
  "success": true,
  "container_detected": true,
  "vessel_count": 2,
  "vessels": [
    {"id": "v1", "description": "Short clear jar with wick, left of can"},
    {"id": "v2", "description": "Tall tumbler with wick, right"}
  ],
  "scale_can_seen": true,
  "confidence": 0.85,
  "explanation": "2 glasses plus one 12 oz can used as scale"
}
If ZERO vessels: container_detected false, vessel_count 0, vessels [].
"""

ESTIMATE_PROMPT = """You are estimating soy wax refill ounces for The Candle Garden.

A 12 oz (355 ml) aluminum drink can may be in the photo for scale only — do not refill the can.

Estimate wax_needed_oz for EACH listed vessel separately. Use the can for relative diameter/height when present.
current_wax_percent: remaining usable wax 0–100; empty + wick only → 0.
wax_needed_oz ≈ full_capacity_oz * (1 - current_wax_percent/100).

Vessels to estimate (keep this exact count and order):
<<VESSEL_LIST>>

Return ONLY JSON:
{
  "success": true,
  "vessels": [
    {
      "id": "v1",
      "description": "copied from list",
      "full_capacity_oz": 8,
      "current_wax_percent": 0,
      "wax_needed_oz": 8,
      "wax_needed_grams": 227
    }
  ],
  "confidence": 0.8
}
Do not add or drop vessels. Do not include a total — we will sum wax_needed_oz in code.
"""

VISION_PROMPT = """You are an expert candle refill estimator for The Candle Garden studio.

Customers photograph one or more containers they want REFILLED with soy wax. Your job is to estimate wax needed for EVERY refillable container in the photo, then SUM them.

## SCALE ONLY — never list as a vessel
Any aluminum beverage can used for size reference (standard **12 fl oz / 355 ml**):
- Athletic Brewing beer cans, Alani energy drinks, seltzer, soda, or similar
- Brand/color does not matter — if it is a drink can, it is scale only
- Do NOT put the can in vessels[] and do NOT add its volume to totals

## INCLUDE as a candle vessel if ANY of these are true
- Has a wick, wick tab, or metal wick clip (even when the glass is empty)
- Glass jar, tumbler, amber/apothecary jar, metal tin
- Ceramic/porcelain mug staged for candles (even with liquid/residue)
- Clear drinking-style glass / rocks glass / tumbler that is empty with a wick or Candle Garden branding
- Votives, bowls used as candles, novelty vessels
- Small short jars next to taller ones — still count them separately

When in doubt: if it is a jar/mug/glass in the main foreground group next to the scale can, INCLUDE it.

## Do NOT include
- Beverage cans (scale only — see above)
- Cardboard boxes, plastic storage bins, bags of wicks, paper towels, furniture, food packaging
- Closed liquor/water bottles with screw caps
- Finished candles sitting in the background/shelves unless clearly part of the refill group
- Wax melts / cubes of wax in trays (not vessels)

## Multi-container rules (critical — common failure: under-counting)
- If the photo shows N jars/mugs/glasses + 1 scale can → return N vessels (not N-1, not 1)
- Count EACH separate glass as its own vessel — do NOT merge two similar tall tumblers
- Always include the smallest short jar if it has a wick
- Before answering: count distinct glass bottoms/rims/wicks in the main cluster; vessels.length MUST match
- vessel_count MUST equal vessels.length
- Estimate each vessel separately with wax_needed_oz
- total_wax_needed_oz = SUM of all vessels' wax_needed_oz
- total_wax_needed_grams = SUM of all vessels' wax_needed_grams (or oz * 28.35)
- Use the 12 oz can for relative diameter/height of each vessel
- current_wax_percent: remaining usable wax (0–100); empty + wick only → 0
- wax_needed_oz ≈ full_capacity_oz * (1 - current_wax_percent/100)

## Output
Return ONLY valid JSON, no markdown, no other text:

{
  "success": true,
  "container_detected": true,
  "vessel_count": 5,
  "vessels": [
    {
      "description": "Small clear glass jar with wick (shortest)",
      "full_capacity_oz": 5,
      "current_wax_percent": 0,
      "wax_needed_oz": 5,
      "wax_needed_grams": 142,
      "notes": ""
    }
  ],
  "total_wax_needed_oz": 48,
  "total_wax_needed_grams": 1361,
  "confidence": 0.85,
  "explanation": "Counted 5 glass vessels with wicks; Alani/Athletic can used only as 12 oz scale; background clutter ignored",
  "recount_check": "I see 5 separate glasses with wicks in the foreground; listed 5 vessels",
  "refill_recommendations": {
    "soy_wax_grams": 1361,
    "fragrance_ml": "estimate 6-8% load",
    "suggested_price": "optional range",
    "priority": "notes"
  }
}

If ZERO vessels other than the scale can: set container_detected false, vessel_count 0, vessels [].
There is no min/max vessel size.
"""

# Extra text appended when we ask the model to recount (undercount guard)
RECOUNT_PROMPT_SUFFIX = """

## RECOUNT PASS (required)
You previously may have under-counted vessels in this same image.
Common mistakes on studio photos:
- Dropping the smallest short jar next to the scale can
- Merging two similar tall tumblers into one vessel
- Ignoring an empty glass that still has a wick

List EVERY separate glass candle vessel in the foreground group again.
Beverage cans = scale only. Background wax cubes / finished candles / wick bags = ignore.
vessel_count MUST equal vessels.length. Return JSON only.
"""

MEDIA_TYPES = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}

HEIF_BRANDS = {
    b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis",
    b"mif1", b"msf1", b"avic", b"hevm", b"hevs",
}


def _json_response(status_code, payload):
    return {
        "statusCode": status_code,
        "body": json.dumps(payload),
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
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


def _is_heif(raw: bytes) -> bool:
    """Detect HEIC/HEIF (iPhone photos) via ISO BMFF ftyp brands."""
    if len(raw) < 12 or raw[4:8] != b"ftyp":
        return False
    brands = {raw[8:12]}
    for i in range(16, min(len(raw), 64), 4):
        brands.add(raw[i : i + 4])
    return bool(brands & HEIF_BRANDS)


def _detect_format_from_bytes(raw: bytes) -> str:
    """Detect image format from magic bytes. Returns 'heic' for unsupported HEIF."""
    if not raw:
        return "unknown"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a"):
        return "gif"
    if raw[:4] == b"RIFF" and len(raw) >= 12 and raw[8:12] == b"WEBP":
        return "webp"
    if _is_heif(raw):
        return "heic"
    return "unknown"


def _normalize_image(body):
    """Return (base64_str, format, error_response_or_None)."""
    image_data = body.get("image", "")

    if image_data and isinstance(image_data, str) and image_data.startswith("http"):
        try:
            with urllib.request.urlopen(image_data) as resp:
                raw = resp.read()
                image_format = _detect_format_from_bytes(raw)
                image_data = base64.b64encode(raw).decode("utf-8")
                return _validate_format(image_data, image_format)
        except Exception as e:
            logger.error(f"Failed to fetch image from URL: {e}")
            return None, None, _json_response(400, {
                "success": False,
                "error": f"Failed to fetch image: {str(e)}",
            })

    if not image_data or not isinstance(image_data, str):
        return None, None, _json_response(400, {
            "success": False,
            "error": "image data is empty",
        })

    header_format = None
    if image_data.startswith("data:"):
        try:
            header, image_data = image_data.split(",", 1)
            header_l = header.lower()
            if "heic" in header_l or "heif" in header_l:
                header_format = "heic"
            elif "png" in header_l:
                header_format = "png"
            elif "webp" in header_l:
                header_format = "webp"
            elif "gif" in header_l:
                header_format = "gif"
            elif "jpeg" in header_l or "jpg" in header_l:
                header_format = "jpeg"
        except Exception:
            pass

    try:
        raw = base64.b64decode(image_data, validate=False)
    except Exception:
        return None, None, _json_response(400, {
            "success": False,
            "error": "image is not valid base64",
        })

    magic_format = _detect_format_from_bytes(raw)
    # Prefer magic bytes over header / defaults — HEIC often mislabeled as jpeg
    image_format = magic_format if magic_format != "unknown" else (header_format or "unknown")

    return _validate_format(image_data, image_format)


def _validate_format(image_data, image_format):
    logger.info(f"Normalized image format={image_format}")

    if image_format == "heic":
        return None, None, _fail_closed(
            error="unsupported_image_format_heic",
            tips=[
                "iPhone HEIC photos are not supported by the vision API",
                "The app should convert to JPEG automatically — update/reload the app",
                "Or export the photo as JPEG and try again",
                "Or enter volume manually",
            ],
        )

    if image_format not in SUPPORTED_FORMATS and image_format != "jpg":
        return None, None, _fail_closed(
            error=f"unsupported_image_format_{image_format}",
            tips=[
                "Unsupported image format — please use JPEG or PNG",
                "Or enter volume manually",
            ],
        )

    # Normalize alias
    if image_format == "jpg":
        image_format = "jpeg"

    return image_data, image_format, None


def _parse_model_json(text):
    """Extract JSON object from model text response."""
    if not text:
        return None

    # Strip markdown fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    json_match = re.search(r"\{[\s\S]*\}", cleaned, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    try:
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        return None


def _claude_model_ids():
    models = [CLAUDE_MODEL_ID]
    if CLAUDE_FALLBACK_MODEL_ID and CLAUDE_FALLBACK_MODEL_ID not in models:
        models.append(CLAUDE_FALLBACK_MODEL_ID)
    return models


def _is_model_unavailable(err):
    text = str(err or "")
    if "is not available for this account" in text:
        return True
    if "The provided model identifier is invalid" in text:
        return True
    if "AccessDeniedException" in text and ("model" in text.lower() or "bedrock" in text.lower()):
        return True
    return False


def _invoke_claude_model(model_id, body):
    payload = dict(body)
    # Only Sonnet 5-family needs explicit thinking:disabled; older Sonnets reject unknown fields.
    if "sonnet-5" not in str(model_id):
        payload.pop("thinking", None)
    try:
        response = bedrock_runtime.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
    except Exception as err:
        if _is_model_unavailable(err) and "Could not process image" not in str(err):
            raise
        if "thinking" not in payload:
            raise
        logger.warning("Claude %s failed (%s); retrying without thinking field", model_id, err)
        payload.pop("thinking", None)
        response = bedrock_runtime.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload),
        )
    return json.loads(response["body"].read())


def _invoke_claude(image_data, image_format, prompt_text=None):
    """Call Claude on Bedrock (ounces + count fallback). Returns response text."""
    media_type = MEDIA_TYPES.get(image_format, "image/jpeg")
    prompt_text = prompt_text or VISION_PROMPT
    # Strip whitespace / data-URI prefixes that break Bedrock image validation.
    if isinstance(image_data, str):
        image_data = image_data.strip()
        if "," in image_data and image_data.lower().startswith("data:"):
            image_data = image_data.split(",", 1)[1]
        image_data = re.sub(r"\s+", "", image_data)

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
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
                    {"type": "text", "text": prompt_text},
                ],
            }
        ],
    }

    last_err = None
    response_body = None
    for model_id in _claude_model_ids():
        try:
            payload = dict(body)
            if "sonnet-5" in str(model_id):
                payload["thinking"] = {"type": "disabled"}
            response_body = _invoke_claude_model(model_id, payload)
            logger.info("Claude invoke succeeded model=%s", model_id)
            break
        except Exception as err:
            last_err = err
            logger.warning("Claude invoke failed model=%s: %s", model_id, err)
    if response_body is None:
        raise last_err
    content = response_body.get("content") or []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            return block.get("text", "")
    if content and isinstance(content[0], dict):
        return content[0].get("text", "")
    return ""


def _converse_text(response):
    content = (
        (response or {}).get("output", {}).get("message", {}).get("content") or []
    )
    parts = []
    for block in content:
        if isinstance(block, dict) and block.get("text"):
            parts.append(block["text"])
    return "\n".join(parts)


def _invoke_grok(image_data, image_format, prompt_text=None):
    """Count pass via Grok 4.6 on Bedrock (same IAM as Claude). No xAI API key."""
    prompt_text = prompt_text or COUNT_PROMPT.replace("<<EXPECTED_LINE>>", "")
    fmt = "jpeg" if image_format in ("jpg", "jpeg") else image_format
    image_bytes = base64.b64decode(image_data, validate=False)
    kwargs = {
        "modelId": GROK_MODEL_ID,
        "messages": [{
            "role": "user",
            "content": [
                {"image": {"format": fmt, "source": {"bytes": image_bytes}}},
                {"text": prompt_text},
            ],
        }],
        "inferenceConfig": {
            "maxTokens": 2000,
            "temperature": 0.0,
        },
        "additionalModelRequestFields": {
            "reasoning": {"effort": GROK_REASONING_EFFORT},
        },
    }
    try:
        response = bedrock_runtime.converse(**kwargs)
    except Exception as err:
        logger.warning("Grok converse with reasoning fields failed (%s); retrying without", err)
        kwargs.pop("additionalModelRequestFields", None)
        response = bedrock_runtime.converse(**kwargs)
    return _converse_text(response)


def _invoke_nova(image_data, image_format, prompt_text=None):
    """Call Amazon Nova Premier (ounce fallback). Returns response text."""
    fmt = "jpeg" if image_format in ("jpg", "jpeg") else image_format
    prompt_text = prompt_text or VISION_PROMPT
    response = bedrock_runtime.invoke_model(
        modelId=NOVA_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "messages": [{
                "role": "user",
                "content": [
                    {"image": {"format": fmt, "source": {"bytes": image_data}}},
                    {"text": prompt_text},
                ],
            }],
            "inferenceConfig": {
                "max_new_tokens": 1600,
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
      - ("not_detected", tips) when model found no vessel
      - ("low_confidence", tips) when confidence too low
      - None when parse/shape is unusable
    """
    if not result or not isinstance(result, dict):
        return None

    vessels = result.get("vessels") or []
    container_detected = bool(result.get("container_detected", bool(vessels)))
    conf = float(result.get("confidence", 0.0) or 0.0)

    # Prefer SUM of per-vessel wax_needed (multi-container photos) over a single total
    vessels_sum = None
    if vessels:
        try:
            vessels_sum = sum(float(v.get("wax_needed_oz") or 0) for v in vessels)
            if vessels_sum <= 0:
                vessels_sum = None
        except (TypeError, ValueError):
            vessels_sum = None

    model_total = (
        result.get("total_wax_needed_oz")
        or result.get("total_volume_oz")
        or result.get("estimated_ounces")
    )
    try:
        model_total = float(model_total) if model_total is not None else None
    except (TypeError, ValueError):
        model_total = None

    # If vessels present, use their sum (and re-sync total fields)
    if vessels_sum is not None:
        raw_oz = vessels_sum
        # If model total is way lower than vessel sum, vessel sum wins (missed multi-vessel total)
        if model_total is not None and model_total > vessels_sum * 1.15:
            # Model total higher — keep model total only if vessels look incomplete
            raw_oz = model_total
    else:
        raw_oz = model_total

    if not container_detected or raw_oz is None:
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

    vessel_count = len(vessels) if isinstance(vessels, list) else 0
    try:
        declared = int(result.get("vessel_count")) if result.get("vessel_count") is not None else vessel_count
    except (TypeError, ValueError):
        declared = vessel_count
    if declared != vessel_count:
        logger.warning(
            "vessel_count mismatch declared=%s actual=%s — using actual list length",
            declared,
            vessel_count,
        )

    container_type = (
        f"{vessel_count} candle vessel{'s' if vessel_count != 1 else ''}"
        if vessel_count
        else "Candle vessel(s)"
    )

    return _json_response(200, {
        "success": True,
        "container_detected": True,
        "estimated_ounces": round(est_oz, 1),
        "total_volume_oz": round(est_oz, 1),
        "estimated_grams": round(est_grams, 1),
        "vessel_count": vessel_count,
        "vessels": vessels,
        "confidence": round(conf, 2),
        "container_type": container_type,
        "explanation": result.get("explanation", "Refill estimate based on visual analysis"),
        "recount_check": result.get("recount_check"),
        "refill_recommendations": result.get("refill_recommendations") or {},
        "model_used": model_used,
        "tips": [
            "Fully clean vessel for best results",
            "Good overhead lighting helps",
            "Place a 12 oz drink can beside vessels for scale (not counted)",
            "Multiple vessels? We'll calculate total refill",
        ],
    })


def _expected_count(body):
    try:
        value = body.get("expected_vessel_count")
        if value is None:
            return None
        count = int(value)
        return count if count > 0 else None
    except (TypeError, ValueError):
        return None


def _count_prompt(expected):
    if expected:
        line = (
            f"The customer says there are exactly {expected} refillable vessel(s) "
            f"(not counting the scale can). vessels.length MUST be {expected}."
        )
    else:
        line = "Count every refillable vessel in the foreground group."
    return COUNT_PROMPT.replace("<<EXPECTED_LINE>>", line)


def _vessel_count(result):
    if not result or not isinstance(result, dict):
        return 0
    vessels = result.get("vessels") or []
    return len(vessels) if isinstance(vessels, list) else 0


def _count_matches(found, expected, count_is_min):
    if not expected:
        return found > 0
    if count_is_min:
        return found >= expected
    return found == expected


def _recount_prompt(prompt, expected):
    return prompt + RECOUNT_PROMPT_SUFFIX + f"\nThe customer counted {expected}. List that many."


def _run_one_count(invoke_fn, image_data, image_format, prompt, expected, count_is_min):
    text = invoke_fn(image_data, image_format, prompt)
    result = _parse_model_json(text)
    if expected and not _count_matches(_vessel_count(result), expected, count_is_min):
        try:
            retry_text = invoke_fn(
                image_data, image_format, _recount_prompt(prompt, expected)
            )
            retry = _parse_model_json(retry_text)
            if _vessel_count(retry) >= _vessel_count(result):
                result = retry
        except Exception as err:
            logger.warning("Recount failed: %s", err)
    return result


def _run_count_pass(image_data, image_format, expected, count_is_min=False):
    """Count vessels. Prefer Claude (entitled on this account); optional Grok when enabled."""
    prompt = _count_prompt(expected)
    models_tried = []
    grok_result = None
    claude_result = None

    use_grok = bool(GROK_MODEL_ID) and not SKIP_GROK
    if use_grok:
        try:
            grok_result = _run_one_count(
                _invoke_grok, image_data, image_format, prompt, expected, count_is_min
            )
            models_tried.append("grok-count")
        except Exception as err:
            logger.error("Grok count failed: %s", err)

    grok_n = _vessel_count(grok_result)
    need_claude = (not use_grok) or (not _count_matches(grok_n, expected, count_is_min))
    if need_claude:
        try:
            claude_result = _run_one_count(
                _invoke_claude, image_data, image_format, prompt, expected, count_is_min
            )
            models_tried.append("claude-count")
        except Exception as err:
            logger.error("Claude count failed: %s", err)
            if not grok_result:
                raise

    claude_n = _vessel_count(claude_result)
    logger.info(
        "Count pass grok=%s claude=%s expected=%s min=%s",
        grok_n,
        claude_n,
        expected,
        count_is_min,
    )

    if _count_matches(grok_n, expected, count_is_min):
        chosen = grok_result
    elif _count_matches(claude_n, expected, count_is_min):
        chosen = claude_result
    elif grok_n >= claude_n and grok_result:
        chosen = grok_result
    else:
        chosen = claude_result or grok_result

    return chosen, models_tried


def _run_estimate_pass(image_data, image_format, count_result):
    listed = count_result.get("vessels") or []
    lines = []
    for index, vessel in enumerate(listed, start=1):
        vid = vessel.get("id") or f"v{index}"
        desc = vessel.get("description") or f"Vessel {index}"
        lines.append(f"{index}. id={vid} — {desc}")
    prompt = ESTIMATE_PROMPT.replace(
        "<<VESSEL_LIST>>", "\n".join(lines) or "1. id=v1 — candle vessel"
    )
    try:
        text = _invoke_claude(image_data, image_format, prompt)
        parsed = _parse_model_json(text)
        if parsed:
            return parsed, "claude-estimate"
    except Exception as err:
        logger.error("Claude estimate failed: %s", err)
    try:
        text = _invoke_nova(image_data, image_format, prompt)
        parsed = _parse_model_json(text)
        if parsed:
            return parsed, "nova-premier-estimate"
    except Exception as err:
        logger.error("Nova estimate failed: %s", err)
    return None, None


def _merge_estimate(count_result, estimate_result):
    counted = list(count_result.get("vessels") or [])
    estimated = list((estimate_result or {}).get("vessels") or [])
    by_id = {}
    by_index = {}
    for index, vessel in enumerate(estimated):
        if vessel.get("id"):
            by_id[str(vessel["id"])] = vessel
        by_index[index] = vessel
    merged = []
    for index, listed in enumerate(counted):
        match = by_id.get(str(listed.get("id") or "")) or by_index.get(index) or {}
        row = {
            "id": listed.get("id") or match.get("id") or f"v{index + 1}",
            "description": listed.get("description") or match.get("description") or f"Vessel {index + 1}",
            "full_capacity_oz": match.get("full_capacity_oz"),
            "current_wax_percent": match.get("current_wax_percent"),
            "wax_needed_oz": match.get("wax_needed_oz"),
            "wax_needed_grams": match.get("wax_needed_grams"),
        }
        merged.append(row)
    total = 0.0
    for row in merged:
        try:
            total += float(row.get("wax_needed_oz") or 0)
        except (TypeError, ValueError):
            pass
    confidence = float(
        (estimate_result or {}).get("confidence")
        or count_result.get("confidence")
        or 0.7
    )
    return {
        "success": True,
        "container_detected": bool(merged),
        "vessel_count": len(merged),
        "vessels": merged,
        "total_wax_needed_oz": round(total, 1),
        "total_wax_needed_grams": round(total * 28.35, 1),
        "confidence": confidence,
        "explanation": count_result.get("explanation") or "Two-pass count then ounce estimate",
        "scale_can_seen": count_result.get("scale_can_seen"),
    }


def analyze_image(body):
    """Two-pass Bedrock: Grok count, Claude ounces. Fail closed on mismatch."""
    image_data, image_format, err = _normalize_image(body)
    if err:
        return err

    expected = _expected_count(body)
    count_is_min = bool(body.get("expected_count_is_minimum"))
    count_result, models_tried = _run_count_pass(
        image_data, image_format, expected, count_is_min
    )
    found = _vessel_count(count_result)

    mismatch = False
    if expected:
        mismatch = found < expected if count_is_min else found != expected
    if mismatch:
        return _fail_closed(
            error="vessel_count_mismatch",
            tips=[
                f"You said {expected}{'+' if count_is_min else ''} vessel{'s' if expected != 1 else ''}; we counted {found}.",
                "Photograph one jar at a time (plus a 12 oz can), then add the next.",
                "Or enter ounces manually",
            ],
        )
    if found < 1:
        return _fail_closed(
            error="not_detected",
            tips=[
                "No candle vessel clearly detected",
                "Include a 12 oz drink can for scale",
                "Or enter volume manually",
            ],
        )

    estimate_result, estimate_model = _run_estimate_pass(image_data, image_format, count_result)
    if estimate_model:
        models_tried.append(estimate_model)
    merged = _merge_estimate(count_result, estimate_result)
    if float(merged.get("total_wax_needed_oz") or 0) <= 0:
        return _fail_closed(
            error="no_ounce_estimate",
            tips=["Could not estimate ounces from the photo", "Enter volume manually"],
        )

    built = _build_success_response(merged, ",".join(models_tried) or CLAUDE_MODEL_ID)
    if isinstance(built, dict):
        try:
            payload = json.loads(built["body"])
            payload["pass"] = "count_then_estimate"
            payload["expected_vessel_count"] = expected
            built["body"] = json.dumps(payload)
        except Exception:
            pass
        return built
    if isinstance(built, tuple):
        reason, tips = built
        return _fail_closed(tips=tips, error=reason)
    return _fail_closed(error="No usable vision result", tips=["Try a clearer JPEG or enter ounces manually"])


def _headers_lower(event):
    headers = event.get("headers") or {}
    return {str(k).lower(): v for k, v in headers.items()}


def _client_ip(event):
    lower = _headers_lower(event)
    xff = lower.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",")[0].strip()
    req = event.get("requestContext") or {}
    identity = req.get("identity") or {}
    return identity.get("sourceIp") or "unknown"


def _device_id(event):
    """Optional stable guest device id from mobile SecureStore."""
    lower = _headers_lower(event)
    did = (lower.get("x-device-id") or "").strip()
    if did and 8 <= len(did) <= 128:
        return did
    return None


def _bearer_token(event):
    headers = event.get("headers") or {}
    lower = {str(k).lower(): v for k, v in headers.items()}
    auth = lower.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip() or None


def _optional_jwt_claims(event):
    """Decode JWT payload without verify (fallback only)."""
    token = _bearer_token(event)
    if not token:
        return {}
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    try:
        pad = "=" * (-len(parts[1]) % 4)
        raw = base64.urlsafe_b64decode(parts[1] + pad)
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _verify_access_token_user(access_token):
    """
    Cryptographically useful attribution: Cognito GetUser validates the access token.
    Returns {sub, email, username, verified: True} or {}.
    """
    if not access_token:
        return {}
    try:
        cognito = boto3.client("cognito-idp", region_name=AWS_REGION)
        resp = cognito.get_user(AccessToken=access_token)
        attrs = {a["Name"]: a["Value"] for a in resp.get("UserAttributes", [])}
        return {
            "sub": attrs.get("sub"),
            "email": attrs.get("email"),
            "username": resp.get("Username"),
            "verified": True,
            "token_use": "access",
        }
    except Exception as e:
        logger.info(f"Access token verify failed (guest or id token): {e}")
        return {}


def _resolve_user_context(event):
    """
    Prefer verified Cognito GetUser when Authorization is an access token.
    Fall back to unverified JWT claims (e.g. id token) for soft attribution.
    """
    token = _bearer_token(event)
    verified = _verify_access_token_user(token)
    if verified.get("sub"):
        return verified

    claims = _optional_jwt_claims(event)
    if claims.get("sub"):
        return {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "username": claims.get("cognito:username") or claims.get("username"),
            "verified": False,
            "token_use": claims.get("token_use") or "unknown",
        }
    return {"verified": False}


def _rate_limit_check(bucket_key, limit):
    """
    Sliding window counter in DynamoDB.
    Returns (allowed: bool, remaining: int, limit: int)
    """
    if not RATE_LIMIT_TABLE:
        return True, limit, limit

    now = int(__import__("time").time())
    window = RATE_WINDOW_SECONDS
    window_id = now // window
    pk = f"{bucket_key}#{window_id}"
    ttl = (window_id + 2) * window

    table = dynamodb.Table(RATE_LIMIT_TABLE)
    try:
        resp = table.update_item(
            Key={"pk": pk},
            UpdateExpression="ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)",
            ExpressionAttributeNames={"#c": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={":one": 1, ":ttl": ttl},
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp.get("Attributes", {}).get("count", 1))
        remaining = max(0, limit - count)
        return count <= limit, remaining, limit
    except Exception as e:
        # Fail open on rate-limit infra errors so refills keep working
        logger.warning(f"Rate limit check failed open: {e}")
        return True, limit, limit


def handler(event, context):
    try:
        # CORS preflight
        if (event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")).upper() == "OPTIONS":
            return _json_response(200, {"ok": True})

        user_ctx = _resolve_user_context(event)
        user_sub = user_ctx.get("sub")
        user_email = user_ctx.get("email")
        is_authenticated = bool(user_sub)
        token_verified = bool(user_ctx.get("verified"))

        ip = _client_ip(event)
        device_id = _device_id(event)
        # Only use user bucket when token was verified with Cognito GetUser
        if is_authenticated and token_verified:
            bucket = f"user:{user_sub}"
            limit = AUTH_DETECT_LIMIT
        elif device_id:
            bucket = f"device:{device_id}"
            limit = GUEST_DETECT_LIMIT
        else:
            bucket = f"ip:{ip}"
            limit = GUEST_DETECT_LIMIT

        allowed, remaining, lim = _rate_limit_check(bucket, limit)
        if not allowed:
            return _json_response(429, {
                "success": False,
                "error": "rate_limited",
                "message": (
                    "Too many estimate requests. Please try again later"
                    + (" or sign in for a higher limit." if not (is_authenticated and token_verified) else ".")
                ),
                "limit": lim,
                "remaining": 0,
                "window_seconds": RATE_WINDOW_SECONDS,
            })

        body_raw = event.get("body")
        if event.get("isBase64Encoded") and isinstance(body_raw, str):
            try:
                body_raw = base64.b64decode(body_raw).decode("utf-8")
            except Exception:
                pass

        if body_raw is None:
            body = {}
        elif isinstance(body_raw, str):
            try:
                body = json.loads(body_raw) if body_raw.strip() else {}
            except json.JSONDecodeError:
                body = {}
        else:
            body = body_raw

        if not isinstance(body, dict):
            body = {}

        if "image" not in body or not body.get("image"):
            return _json_response(400, {
                "error": "image (base64 or url) is required",
                "success": False,
            })

        result = analyze_image(body)
        # Attach attribution + rate-limit metadata when possible
        try:
            if isinstance(result, dict) and result.get("body"):
                payload = json.loads(result["body"])
                payload["rate_limit"] = {
                    "remaining": remaining,
                    "limit": lim,
                    "window_seconds": RATE_WINDOW_SECONDS,
                    "bucket": "user" if is_authenticated else "guest_ip",
                }
                if user_sub:
                    payload["user"] = {
                        "sub": user_sub,
                        "email": user_email,
                        "authenticated": True,
                        "token_verified": token_verified,
                    }
                else:
                    payload["user"] = {
                        "authenticated": False,
                        "token_verified": False,
                    }
                result["body"] = json.dumps(payload)
        except Exception as meta_err:
            logger.warning(f"Could not attach rate metadata: {meta_err}")

        return result
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        friendly = str(e)
        if _is_model_unavailable(e) or "Could not process image" in friendly:
            return _fail_closed(
                error="detect_unavailable",
                tips=[
                    "Photo estimate is temporarily unavailable",
                    "Try a brighter JPEG with a 12 oz can for scale",
                    "Or enter ounces manually",
                ],
                status_code=503,
            )
        return _fail_closed(
            error="detect_failed",
            tips=[
                "Could not auto-estimate from this photo",
                "Try again with a clearer photo, or enter ounces manually",
            ],
            status_code=500,
        )
