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
        prompt = """You are an expert candle refill estimator.

Analyze the uploaded photo and detect ALL possible vessels that could hold candle wax (mugs, cups, bowls, jars, glasses, etc.).

Rules:
- A vessel is valid even if it has some liquid or residue.
- Prefer empty or mostly empty vessels.
- If multiple vessels are present, describe the best one(s) for refilling.
- Estimate volume in ounces or ml if possible.
- Always return structured JSON.

Output format:
{
  "vessels_detected": true,
  "vessels": [
    {
      "type": "white ceramic mug",
      "estimated_volume_oz": 12,
      "confidence": 0.85,
      "notes": "Contains some liquid - still usable after cleaning"
    }
  ],
  "recommendation": "..."
}

If no vessel is found with high confidence, still return a helpful fallback instead of "No Vessel Detected"."""

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
        
        # Parse response - handle different response formats
        try:
            response_body = response.get("body")
            if response_body:
                if hasattr(response_body, 'read'):
                    content = response_body.read().decode("utf-8")
                else:
                    content = response_body.decode("utf-8") if isinstance(response_body, bytes) else str(response_body)
                response_body = json.loads(content)
            else:
                response_body = json.loads(response["body"].read().decode("utf-8")) if "body" in response else {}
        except Exception as e:
            logger.error(f"Failed to parse response: {str(e)}")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to parse AI response"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        content = response_body.get("content", [{}])[0].get("text", "")
        
        # Try to extract JSON from response
        try:
            # Find JSON in the response
            start_idx = content.find("{")
            end_idx = content.rfind("}") + 1
            if start_idx > -1 and end_idx > 0:
                result = json.loads(content[start_idx:end_idx])
            else:
                result = {
                    "vessels_detected": False,
                    "vessels": [],
                    "recommendation": "Could not parse AI response"
}
        except json.JSONDecodeError:
            result = {
                "vessels_detected": False,
                "vessels": [],
                "recommendation": "Could not parse AI response"
            }
        
        # Check for vessels_detected or legacy container_detected
        vessels_detected = result.get("vessels_detected", result.get("container_detected", False))
        vessels = result.get("vessels", [])
        
        # Filter out non-candle containers (soda cans, etc.) and calculate total volume
        # Specifically ignore "Alani" or similar beverage containers
        valid_vessels = []
        for v in vessels:
            vessel_type = v.get("type", "").lower()
            # Skip beverage cans, soda cans, etc.
            skip_phrases = ["alani", "soda can", "energy drink", "cola", "pepsi", "coke", "beverage can"]
            if any(phrase in vessel_type for phrase in skip_phrases):
                continue
            valid_vessels.append(v)
        
        if vessels_detected and len(valid_vessels) > 0:
            # Calculate total volume from all valid vessels
            total_volume_oz = sum(v.get("estimated_volume_oz", 12) for v in valid_vessels)
            
            # Use the first/best vessel as primary
            best_vessel = valid_vessels[0]
            vessel_type = best_vessel.get("type", "Unknown")
            estimated_ounces = best_vessel.get("estimated_volume_oz", 12)
            confidence = best_vessel.get("confidence", 0.7)
            notes = best_vessel.get("notes", "")
            
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "container_detected": True,
                    "container_type": vessel_type,
                    "confidence": confidence,
                    "estimated_ounces": estimated_ounces,
                    "total_volume_oz": total_volume_oz,
                    "vessels": valid_vessels,
                    "notes": notes,
                    "recommendation": result.get("recommendation", "")
                }),
                "headers": {"Content-Type": "application/json"},
            }
        else:
            # No vessel detected - provide helpful fallback
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
        logger.error(f"Detection error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
