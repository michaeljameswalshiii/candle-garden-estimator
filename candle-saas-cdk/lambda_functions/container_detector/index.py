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

CLAUDE_MODEL_ID = os.environ.get(
    "CLAUDE_MODEL_ID",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
)
NOVA_MODEL_ID = os.environ.get("NOVA_MODEL_ID", "amazon.nova-pro-v1:0")
MIN_CONFIDENCE = float(os.environ.get("MIN_CONFIDENCE", "0.5"))
RATE_LIMIT_TABLE = os.environ.get("RATE_LIMIT_TABLE", "candle-garden-detect-rate-limits")
GUEST_DETECT_LIMIT = int(os.environ.get("GUEST_DETECT_LIMIT", "20"))
AUTH_DETECT_LIMIT = int(os.environ.get("AUTH_DETECT_LIMIT", "80"))
RATE_WINDOW_SECONDS = int(os.environ.get("RATE_WINDOW_SECONDS", "3600"))

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)

# Bedrock vision accepts jpeg/png/gif/webp — not HEIC/HEIF (iPhone default).
SUPPORTED_FORMATS = {"jpeg", "jpg", "png", "gif", "webp"}

VISION_PROMPT = """You are an expert candle refill estimator for The Candle Garden studio.

Customers photograph one or more containers they want REFILLED with soy wax. Your job is to estimate wax needed for EVERY refillable container in the photo, then SUM them.

## ONLY exclude (never list as a vessel)
- The blue Athletic Brewing beer can (or any soda/beer aluminum can) used as a **scale reference only**
  - Treat it as a standard **12 fl oz / 355 ml** can for size comparison
  - Do NOT include it in vessels[] and do NOT add its volume to totals

## INCLUDE as candle vessels (always estimate when present)
Count EVERY other open container that can hold candle wax, including:
- Glass jars, amber/apothecary jars, metal tins
- Ceramic/porcelain mugs (even if they currently show liquid, latte foam, or residue — customers reuse mugs as candle vessels)
- Drinking glasses, tumblers, rocks glasses, stemless glasses (even if cloudy, frosted, sooty, or with ice-like residue — that is often spent wax)
- Votives, bowls used as candles, novelty vessels

When in doubt whether something is a candle vessel vs trash: if it is a jar, mug, or glass container next to the scale can, INCLUDE it.

## Do NOT include
- Cardboard boxes, plastic storage bins, bags, furniture, food packaging
- Closed bottles with screw caps of liquor/water (not candle jars)
- The scale can (see above)

## Multi-container rules (critical)
- If the photo shows N jars/mugs/glasses + 1 scale can → return N vessels (not 1)
- Estimate each vessel separately with wax_needed_oz
- total_wax_needed_oz = SUM of all vessels' wax_needed_oz
- total_wax_needed_grams = SUM of all vessels' wax_needed_grams (or oz * 28.35)
- Use the 12 oz can for relative diameter/height of each vessel
- current_wax_percent: remaining usable wax still in the vessel (0–100)
- wax_needed_oz ≈ full_capacity_oz * (1 - current_wax_percent/100)

## Output
Return ONLY valid JSON, no markdown, no other text:

{
  "success": true,
  "container_detected": true,
  "vessels": [
    {
      "description": "Brief description of vessel (color, material, label if any)",
      "full_capacity_oz": 9,
      "current_wax_percent": 15,
      "wax_needed_oz": 7.7,
      "wax_needed_grams": 218,
      "notes": "Any observations"
    }
  ],
  "total_wax_needed_oz": 22.5,
  "total_wax_needed_grams": 638,
  "confidence": 0.85,
  "explanation": "List each vessel counted and confirm the beer can was used only as scale",
  "refill_recommendations": {
    "soy_wax_grams": 638,
    "fragrance_ml": "estimate 6-8% load",
    "suggested_price": "optional range",
    "priority": "notes"
  }
}

If ZERO vessels other than the scale can: set container_detected false and vessels to [].
There is no min/max vessel size.
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


def _invoke_claude(image_data, image_format):
    """Call Claude (Anthropic Messages API on Bedrock). Returns response text."""
    media_type = MEDIA_TYPES.get(image_format, "image/jpeg")

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1200,
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
                    {"type": "text", "text": VISION_PROMPT},
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
    if content and isinstance(content[0], dict):
        return content[0].get("text", "")
    return ""


def _invoke_nova(image_data, image_format):
    """Call Amazon Nova Pro. Returns response text."""
    fmt = "jpeg" if image_format in ("jpg", "jpeg") else image_format
    response = bedrock_runtime.invoke_model(
        modelId=NOVA_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "messages": [{
                "role": "user",
                "content": [
                    {"image": {"format": fmt, "source": {"bytes": image_data}}},
                    {"text": VISION_PROMPT},
                ],
            }],
            "inferenceConfig": {
                "max_new_tokens": 1000,
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
    """Primary Claude; Nova fallback. Fail closed — no invented ounce defaults."""
    image_data, image_format, err = _normalize_image(body)
    if err:
        return err

    last_error = None
    models_tried = []

    def _handle_built(built, model_label, raw_text):
        if built is None:
            logger.warning(
                f"{model_label} unusable output (first 400 chars): {(raw_text or '')[:400]}"
            )
            return None
        if isinstance(built, tuple):
            reason, tips = built
            return _fail_closed(tips=tips, error=reason)
        if isinstance(built, dict):
            return built
        return None

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
        "Try a clearer JPEG photo or enter volume manually",
    ]
    if models_tried:
        tips.append(f"Models tried: {', '.join(models_tried)}")
    if last_error and "heic" in last_error.lower():
        tips.insert(0, "Photo may still be HEIC — reload the app so it converts to JPEG")

    return _fail_closed(
        error=last_error or "No usable vision result",
        tips=tips,
    )


def _client_ip(event):
    headers = event.get("headers") or {}
    # API Gateway may lowercase headers
    lower = {str(k).lower(): v for k, v in headers.items()}
    xff = lower.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",")[0].strip()
    req = event.get("requestContext") or {}
    identity = req.get("identity") or {}
    return identity.get("sourceIp") or "unknown"


def _optional_jwt_claims(event):
    """
    Best-effort decode of Bearer JWT payload (no signature verify).
    Used only for rate-limit bucket key + response attribution when API GW
    has no Cognito authorizer on /detect. Not a security boundary.
    """
    headers = event.get("headers") or {}
    lower = {str(k).lower(): v for k, v in headers.items()}
    auth = lower.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return {}
    token = auth.split(" ", 1)[1].strip()
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

        claims = _optional_jwt_claims(event)
        user_sub = claims.get("sub")
        user_email = claims.get("email")
        is_authenticated = bool(user_sub)

        ip = _client_ip(event)
        if is_authenticated:
            bucket = f"user:{user_sub}"
            limit = AUTH_DETECT_LIMIT
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
                    + (" or sign in for a higher limit." if not is_authenticated else ".")
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
                    }
                else:
                    payload["user"] = {"authenticated": False}
                result["body"] = json.dumps(payload)
        except Exception as meta_err:
            logger.warning(f"Could not attach rate metadata: {meta_err}")

        return result
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return _fail_closed(error=str(e), status_code=500)
