import json
import os
import boto3
import base64
import logging
import re
import urllib.request
from PIL import Image
import io

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

def handler(event, context):
    try:
        http_method = event.get("httpMethod", "").upper()
        body = event.get("body", "{}")
        
        if isinstance(body, str):
            try:
                body = json.loads(body) if body else {}
            except json.JSONDecodeError:
                body = {}

        if http_method != "POST":
            return {"statusCode": 405, "body": json.dumps({"error": "Only POST method allowed"})}

        if "image" not in body:
            return {"statusCode": 400, "body": json.dumps({"error": "image required (base64 encoded)"})}

        return detect_containers(body)
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

def detect_containers(body):
    """Detect multiple candle vessels using 12oz can as reference."""
    try:
        image_data = body.get("image", "")
        
        if image_data.startswith("http"):
            with urllib.request.urlopen(image_data) as response:
                image_data = base64.b64encode(response.read()).decode("utf-8")

        return analyze_with_nova(image_data)
    
    except Exception as e:
        logger.error(f"Detection error: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

def analyze_with_nova(image_base64):
    """Improved prompt for multiple vessels."""
    try:
        prompt = """You are an expert candle maker estimating vessel volumes.

A standard 12 oz soda/energy drink can is in the photo for scale.

Tasks:
1. Identify the 12 oz can (ignore it for volume).
2. Identify EVERY empty candle vessel (jars, glasses, mugs, bowls, etc.).
3. For EACH vessel, estimate volume in fluid ounces.
4. Return total volume of ALL candle vessels.

Respond with ONLY valid JSON in this exact format:
{
  "success": true,
  "container_detected": true,
  "estimated_ounces": 42.5,
  "total_volume_oz": 42.5,
  "vessels": [
    {"type": "tall glass jar", "estimated_oz": 18.0},
    {"type": "short wide jar", "estimated_oz": 24.5}
  ],
  "confidence": 0.85,
  "explanation": "One tall jar (~18oz) + one wide jar (~24.5oz)"
}
"""

        response = bedrock_runtime.invoke_model(
            modelId='amazon.nova-lite-v1:0',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                "messages": [{
                    "role": "user",
                    "content": [
                        {"image": {"format": "jpeg", "source": {"bytes": image_base64}}},
                        {"text": prompt}
                    ]
                }],
                "inferenceConfig": {
                    "max_new_tokens": 500,
                    "temperature": 0.1
                }
            })
        )

        # Parse response
        response_body = json.loads(response.get('body').read())
        text = response_body['output']['message']['content'][0]['text']

        # Extract JSON
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(0))
        else:
            result = json.loads(text)

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "container_detected": True,
                "estimated_ounces": result.get("total_volume_oz", result.get("estimated_ounces", 0)),
                "total_volume_oz": result.get("total_volume_oz", result.get("estimated_ounces", 0)),
                "vessels": result.get("vessels", []),
                "confidence": result.get("confidence", 0.7),
                "container_type": "Multiple vessels",
                "explanation": result.get("explanation", ""),
                "notes": result.get("explanation", "")
            }),
            "headers": {"Content-Type": "application/json"}
        }

    except Exception as e:
        logger.error(f"Nova analysis error: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
