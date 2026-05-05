import json
import os
import boto3
import base64
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize Bedrock client
bedrock_client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def handler(event, context):
    """
    Handle container detection requests using Bedrock Claude Vision.
    
    Routes:
    - POST /detect - Analyze image for candle container
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
    """Detect if image contains a candle container using Bedrock Claude Vision."""
    try:
        image_data = body.get("image", "")
        
        # If image is a URL, fetch it first
        if image_data.startswith("http"):
            import urllib.request
            with urllib.request.urlopen(image_data) as response:
                image_data = base64.b64encode(response.read()).decode("utf-8")
        
        # Use Claude 3 Sonnet for vision analysis
        prompt = """You are a candle container detection expert. 
Analyze this image and determine if it shows a container suitable for pouring candle wax into.

Look for:
1. Empty containers (jars, votives, tumblers, tins, molds)
2. Containers that could hold melted wax
3. Common candle vessels like mason jars, apothecary jars, tea light holders
4. Empty space inside a container that could be filled

Respond with ONLY a JSON object with these fields:
- container_detected: true or false
- confidence: a number between 0 and 1
- container_type: description of the container if detected, or "none" if not
- estimated_ounces: estimated capacity in ounces if detected, or 0 if not
- reasoning: brief explanation of your decision

Do not include any other text in your response. Format as valid JSON only."""

        # Call Bedrock Claude with vision
        response = bedrock_client.invoke_model(
            modelId="anthropic.claude-3-sonnet-20240229-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-06-01",
                "max_tokens": 1024,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_data
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            })
        )
        
        # Parse response
        response_body = json.loads(response["body"].read().decode("utf-8"))
        content = response_body["content"][0]["text"]
        
        # Try to extract JSON from response
        try:
            # Find JSON in the response
            start_idx = content.find("{")
            end_idx = content.rfind("}") + 1
            if start_idx > -1 and end_idx > 0:
                result = json.loads(content[start_idx:end_idx])
            else:
                result = {
                    "container_detected": False,
                    "confidence": 0,
                    "container_type": "none",
                    "estimated_ounces": 0,
                    "reasoning": "Could not parse AI response"
                }
        except json.JSONDecodeError:
            result = {
                "container_detected": False,
                "confidence": 0,
                "container_type": "none",
                "estimated_ounces": 0,
                "reasoning": "Could not parse AI response"
            }
        
        # Only return results if container is detected with decent confidence
        if result.get("container_detected", False) and result.get("confidence", 0) > 0.5:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "container_detected": True,
                    "container_type": result.get("container_type", "unknown"),
                    "confidence": result.get("confidence", 0),
                    "estimated_ounces": result.get("estimated_ounces", 0),
                    "reasoning": result.get("reasoning", "")
                }),
                "headers": {"Content-Type": "application/json"},
            }
        else:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "container_detected": False,
                    "confidence": result.get("confidence", 0),
                    "container_type": "none",
                    "estimated_ounces": 0,
                    "reasoning": result.get("reasoning", "No candle container detected")
                }),
                "headers": {"Content-Type": "application/json"},
            }
    
    except Exception as e:
        logger.error(f"Detection error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
