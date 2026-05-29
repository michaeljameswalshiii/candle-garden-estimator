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

prompt = """You are an expert candle refill estimator. Be accurate and never underestimate volume.

A blue 12 oz LUNY soda can is clearly visible for scale. Use it ONLY for scaling — ignore its volume.

CRITICAL INSTRUCTIONS — FOLLOW EXACTLY:
- There may be ANY number of candle vessels/containers in this photo (1, 2, 3, 4, or more). There is no limit.
- Detect EVERY vessel separately. Do not merge them.
- COMPLETELY IGNORE residual wax inside the jars. Measure the FULL internal capacity as if they were completely empty and clean.
- Be very precise with measurements using the soda can as reference.

Step-by-step (think internally, but output only JSON):
1. Confirm the soda can is present for scale.
2. Identify and measure each vessel individually.
3. Sum all vessels for the total.

Return ONLY valid JSON:
{
  "success": true,
  "container_detected": true,
  "estimated_ounces": 42,
  "total_volume_oz": 42,
  "vessels": [
    {"type": "dark apothecary jar", "oz": 12.5, "notes": "full capacity"},
    {"type": "clear glass tumbler", "oz": 16.0, "notes": "residual wax ignored"},
    {"type": "small tealight holder", "oz": 2.5, "notes": ""}
  ],
  "confidence": 0.88,
  "explanation": "Three vessels detected. Full clean capacities measured using soda can scale."
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
        conf = float(result.get("confidence", 0.6))
        vessels = result.get("vessels", [])

        if est_oz < 4 or est_oz > 80:
            est_oz = 16.0
            conf = 0.4

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "container_detected": bool(result.get("container_detected", True)),
                "estimated_ounces": round(est_oz, 1),
                "total_volume_oz": round(est_oz, 1),
                "vessels": vessels,
                "confidence": round(conf, 2),
                "container_type": "Candle vessel(s)",
                "explanation": result.get("explanation", "Multi-vessel estimate with residual wax ignored"),
                "tips": [
                    "Fully empty and wipe vessels clean for highest accuracy",
                    "Good lighting and clear view of all vessels helps",
                    "Include the soda can for best scaling"
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
