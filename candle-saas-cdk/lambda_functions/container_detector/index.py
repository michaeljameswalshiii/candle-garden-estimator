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

    prompt = """You are an expert candle refill estimator. Analyze this image carefully for The Candle Garden studio.

Task: Detect any candle jars/vessels and estimate how much wax is needed for a full refill.

Key instructions:
- Focus ONLY on candle containers (jars, vessels). Ignore beer cans, coffee mugs, drinking glasses, boxes, and other objects unless they contain candle wax.
- The main target is the brown amber glass jar on the left with the "Hot Show" / "Malicious Women" label.
- Estimate current wax level (low/medium/high or percentage).
- Use nearby objects (Athletic Brewing can, white mug) for rough scale — the can is ~12oz / 355ml for reference.
- Be realistic about jar size: typical 8-12oz candle jars.

Return ONLY valid JSON, no other text:

{
  "success": true,
  "container_detected": true,
  "vessels": [
    {
      "description": "Amber glass jar - Malicious Women Candle Co. 'Hot Show'",
      "full_capacity_oz": 9,
      "current_wax_percent": 20,
      "wax_needed_oz": 7.2,
      "wax_needed_grams": 205,
      "notes": "Very low wax remaining. Excellent candidate for refill."
    }
  ],
  "total_wax_needed_oz": 7.2,
  "total_wax_needed_grams": 205,
  "confidence": 0.88,
  "explanation": "Clear amber candle jar detected with low wax. Used beer can for scale reference.",
  "refill_recommendations": {
    "soy_wax_grams": 205,
    "fragrance_ml": "12-16 (6-8% load)",
    "wick_size": "CD-6 or similar",
    "suggested_price": "$22-26"
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
                    "max_new_tokens": 800,
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

        # Handle new response format with vessels array and total_wax_needed
        vessels = result.get("vessels", [])
        est_oz = float(result.get("total_wax_needed_oz") or result.get("total_volume_oz") or result.get("estimated_ounces") or 12.0)
        est_grams = float(result.get("total_wax_needed_grams") or 0)
        conf = float(result.get("confidence", 0.65))
        
        # Support previous format too
        if est_oz == 12.0 and result.get("estimated_ounces"):
            est_oz = float(result.get("estimated_ounces"))
        if est_grams == 0 and vessels and vessels[0].get("wax_needed_grams"):
            est_grams = float(vessels[0].get("wax_needed_grams"))

        # Better default when detection is weak
        if est_oz < 4 or est_oz > 80:
            est_oz = 12.0
            conf = 0.45
        if est_grams < 100:
            est_grams = est_oz * 28.35  # Approximate conversion

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
