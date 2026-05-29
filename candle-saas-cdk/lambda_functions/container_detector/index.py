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
        # Handle the case when body is None or not present
        body_raw = event.get("body")
        if body_raw is None:
            body = {}
        elif isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw

        # Validate image is present
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
    """MiniMax v3: Aggressive multi-vessel detection + strong residual wax ignore"""
    image_data = body.get("image", "")

    # Handle URL if image is passed as URL
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

    # Validate we have image data
    if not image_data:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "image data is empty"})
        }

    prompt = """You are an expert candle maker and refill volume estimator.

A standard 12 oz soda can is visible for scale. Use it ONLY for scale reference.

CRITICAL RULES:
- Identify EVERY candle vessel (jars, tumblers, glasses, bowls, mugs, etc.), even if they are close together or partially overlapping.
- Be HIGHLY AGGRESSIVE on multi-vessel detection.
- COMPLETELY IGNORE any residual wax, soot, or leftover material inside the vessels. Estimate the FULL clean/empty capacity as if the jar were brand new and empty.
- Residual wax is extremely common in used candles and must NOT reduce your volume estimate.

Tasks:
1. Locate the 12 oz soda can for accurate scaling.
2. Detect all candle vessels in the image.
3. Estimate realistic full fluid ounces for each vessel.
4. Return the sum as total_volume_oz.

Return ONLY valid JSON. No explanations outside the JSON.

{
  "success": true,
  "container_detected": true,
  "estimated_ounces": 22.5,
  "total_volume_oz": 22.5,
  "vessels": [
    {"type": "dark apothecary jar", "oz": 11.0, "notes": "full capacity estimated"},
    {"type": "clear glass tumbler", "oz": 11.5, "notes": "residual wax ignored"}
  ],
  "confidence": 0.85,
  "explanation": "Two vessels detected. Residual wax present but full usable volume used."
}
"""

    try:
        response = bedrock_runtime.invoke_model(
            modelId="amazon.nova-lite-v1:0",
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
                    "max_new_tokens": 600,
                    "temperature": 0.05,   # Very low for consistency
                    "topP": 0.95
                }
            })
        )

        response_body = json.loads(response.get('body').read())
        text = response_body.get('output', {}).get('message', {}).get('content', [{}])[0].get('text', '')

        # Robust JSON extraction
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

        # Safety bounds
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
        logger.error(f"Nova Lite error: {str(e)}")
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
