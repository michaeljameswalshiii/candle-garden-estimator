import json
import os
import boto3
import base64
import logging
import re
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize Bedrock client
bedrock_runtime = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def handler(event, context):
    """
    Handle container detection requests using Amazon Nova Lite.
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        body = event.get("body", "{}")
        
        if isinstance(body, str):
            try:
                body = json.loads(body) if body else {}
            except json.JSONDecodeError:
                body = {}
        
        if http_method != "POST":
            return {
                "statusCode": 405,
                "body": json.dumps({"error": "Only POST method allowed"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Check for image data
        if "image" not in body:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "image required (base64 encoded)"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        response = detect_container(body)
        return response
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": {"Content-Type": "application/json"},
        }


def detect_container(body):
    """Detect if image contains a candle container using Amazon Nova Lite."""
    try:
        image_data = body.get("image", "")
        
        # If image is a URL, fetch it first
        if image_data.startswith("http"):
            with urllib.request.urlopen(image_data) as response:
                image_data = base64.b64encode(response.read()).decode("utf-8")
        
        # Analyze with Amazon Nova Lite
        return analyze_image_with_nova(image_data)
    
    except Exception as e:
        logger.error(f"Detection error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def analyze_image_with_nova(image_bytes):
    """Analyze candle container image using Amazon Nova Lite."""
    try:
        image_base64 = image_bytes
        
        prompt = """You are an expert at estimating candle vessel volumes.

A standard 12 oz soda can (4.83 inches tall, 2.6 inches diameter) is placed in the photo for scale reference.

Your task:
1. Identify the 12 oz soda can.
2. Identify ALL other containers/vessels meant for candles (mugs, jars, bowls, glasses, etc.).
3. Ignore the soda can.
4. Estimate the volume in fluid ounces for EACH candle vessel.
5. Return the TOTAL volume of all candle vessels combined.

Rules:
- Focus only on empty or mostly empty candle-appropriate vessels.
- Be reasonable with estimates. Typical candle containers are 4–24 oz each.
- If multiple vessels are present, sum their estimated volumes.
- Respond with ONLY a JSON object in this exact format:
{
  "success": true,
  "container_detected": true,
  "estimated_ounces": 18.5,
  "confidence": 0.82,
  "container_type": "Multiple vessels",
  "explanation": "One 8oz mug + one 10.5oz jar"
}
"""

        response = bedrock_runtime.invoke_model(
            modelId='amazon.nova-lite-v1:0',
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "image": {
                                    "format": "jpeg",
                                    "source": {"bytes": image_base64}
                                }
                            },
                            {"text": prompt}
                        ]
                    }
                ],
                "inferenceConfig": {
                    "max_new_tokens": 300,
                    "temperature": 0.1
                }
            })
        )
        
        # Parse Bedrock response with robust JSON handling
        response_body = json.loads(response.get('body').read())
        
        result = None
        if 'output' in response_body and 'message' in response_body['output']:
            content = response_body['output']['message']['content'][0]
            if 'text' in content:
                text = content['text'].strip()
                
                # Extract JSON from possible markdown or extra text
                json_match = re.search(r'\{.*\}', text, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group(0))
                    except:
                        pass
                
                # Fallback: try direct parse
                if not result:
                    try:
                        result = json.loads(text)
                    except:
                        pass
        
        # Default fallback if parsing fails
        if not result:
            result = {
                "success": False,
                "container_detected": False,
                "confidence": 0.0,
                "error": "Failed to parse AI response"
            }
        
        if result.get("success") and result.get("container_detected"):
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "container_detected": True,
                    "estimated_ounces": result.get("estimated_ounces", 12),
                    "confidence": result.get("confidence", 0.5),
                    "container_type": result.get("container_type", "Unknown"),
                    "total_volume_oz": result.get("estimated_ounces", 12),
                    "notes": result.get("explanation", ""),
                    "recommendation": result.get("explanation", "")
                }),
                "headers": {"Content-Type": "application/json"},
            }
        else:
            # No vessel detected
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "container_detected": False,
                    "confidence": 0.3,
                    "container_type": "none",
                    "estimated_ounces": 12,
                    "total_volume_oz": 0,
                    "vessels": [],
                    "reasoning": "Vessel not clearly detected. Try these tips: Make sure the vessel is well-lit, take photo from above or side, empty the vessel if possible.",
                    "tips": [
                        "Make sure the vessel is well-lit",
                        "Take photo from above or side",
                        "Empty the vessel if possible",
                        "Try a different angle"
                    ],
                    "allowManualEntry": True
                }),
                "headers": {"Content-Type": "application/json"},
            }
    
    except Exception as e:
        logger.error(f"Nova analysis error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
