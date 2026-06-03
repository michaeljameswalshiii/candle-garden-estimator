import json
import os
import boto3
import base64
import logging
import re
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

def handler(event, context):
    try:
        body_raw = event.get("body")
        
        # Robust body parsing: handle both string and dict inputs
        # API Gateway may pass body as string (real requests) or dict (test feature/Gateway v2)
        if body_raw is None:
            body = {}
        elif isinstance(body_raw, str):
            # Try parsing as JSON string
            try:
                body = json.loads(body_raw) if body_raw.strip() else {}
            except json.JSONDecodeError:
                # If string parsing fails, try treating as raw input
                # This handles edge cases where body might be incorrectly formatted
                body = body_raw
        else:
            # Already a dict/object - use directly
            body = body_raw
        
        # Ensure body is always a dictionary for .get() to work
        if not isinstance(body, dict):
            body = {"raw": str(body)}

        if "image" not in body or not body.get("image"):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "image (base64 or url) is required"})
            }

        return analyze_with_nova(body)
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

def analyze_with_nova(body):
    """Nova Pro v1: Maximum accuracy with refined prompt"""
    image_data = body.get("image", "")

    if image_data and image_data.startswith("http"):
        try:
            with urllib.request.urlopen(image_data) as resp:
                image_data = base64.b64encode(resp.read()).decode("utf-8")
        except Exception as e:
            logger.error(f"Failed to fetch image from URL: {e}")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Failed to fetch image: {str(e)}"})
            }

    if not image_data:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "image data is empty"})
        }

    prompt = """You are an expert candle refill estimator for The Candle Garden studio.

Analyze this photo and provide a detailed refill estimate.

CRITICAL RULES:
- Detect ALL candle vessels/jars in the image (ignore beer cans, mugs, glasses unless they are the candle container).
- For each vessel: estimate current wax remaining (as % or grams), full capacity, and wax needed for a full refill.
- Use common objects in the photo (e.g. beer can, mug, hand) for rough scale if no ruler.
- Identify brand/label if visible (e.g. "Malicious Women Candle Co.").
- Ignore residual wax for "full refill" calculation — estimate to the top of the jar.

Return ONLY valid JSON (no extra text):

{
  "success": true,
  "container_detected": true,
  "estimated_ounces": 12,
  "total_volume_oz": 14,
  "vessels": [
    {
      "type": "Amber glass jar (Malicious Women 'Hot Show')",
      "full_capacity_oz": 9,
      "current_wax_percent": 18,
      "wax_needed_grams": 210,
      "notes": "Very low wax, excellent refill candidate"
    }
  ],
  "confidence": 0.85,
  "explanation": "Single main candle jar detected. Low wax level. Athletic can used for rough scale.",
  "refill_recommendations": {
    "soy_wax_grams": 210,
    "fragrance_ml": "13-17 (6-8% load)",
    "suggested_scent": "Spicy, bold, or citrus to match 'Hot Show' vibe",
    "price_suggestion": "$20-24"
  }
}
"""

    try:
        response = bedrock_runtime.invoke_model(
            modelId="amazon.nova-pro-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "messages": [{
                    "role": "user",
                    "content": [
                        {"image": {"format": "jpeg", "source": {"bytes": image_data}}},
                        {"text": prompt}
                    ]
                }],
                "inferenceConfig": {
                    "max_new_tokens": 700,
                    "temperature": 0.0,
                    "topP": 0.95
                }
            })
        )

        response_body = json.loads(response.get('body').read())
        text = response_body.get('output', {}).get('message', {}).get('content', [{}])[0].get('text', '')

        json_match = re.search(r'\{[\s\S]*\}', text, re.DOTALL)
        result = None
        if json_match:
            try:
                result = json.loads(json_match.group(0))
            except:
                pass
        
        if not result:
            try:
                result = json.loads(text.strip())
            except:
                pass

        if not result or not isinstance(result, dict):
            result = {"success": False, "container_detected": False}

        est_oz = float(result.get("total_volume_oz") or result.get("estimated_ounces") or 12.0)
        conf = float(result.get("confidence", 0.65))
        vessels = result.get("vessels", [])

        # Better default when detection is weak
        if est_oz < 4 or est_oz > 80:
            est_oz = 12.0
            conf = 0.45

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "container_detected": True,
                "estimated_ounces": round(est_oz, 1),
                "total_volume_oz": round(est_oz + 2, 1),
                "vessels": vessels,
                "confidence": round(conf, 2),
                "container_type": "Candle vessel(s)",
                "explanation": result.get("explanation", "Refill estimate based on visual analysis"),
                "refill_recommendations": result.get("refill_recommendations", {}),
                "tips": [
                    "Fully clean vessel for best results",
                    "Good overhead lighting helps",
                    "Multiple vessels? We'll calculate total refill"
                ]
            }),
            "headers": {"Content-Type": "application/json"}
        }

    except Exception as e:
        logger.error(f"Nova Pro error: {str(e)}")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "container_detected": False,
                "estimated_ounces": 12.0,
                "total_volume_oz": 12.0,
                "confidence": 0.3,
                "tips": ["Try better lighting or a cleaner photo"]
            })
        }
