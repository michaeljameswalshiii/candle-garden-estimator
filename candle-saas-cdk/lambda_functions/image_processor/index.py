import json
import os
import boto3
import base64
import logging
import uuid
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize S3 client
s3_client = boto3.client("s3")

# Get bucket name from environment or context
S3_BUCKET = os.environ.get("S3_BUCKET", "candle-images")


def handler(event, context):
    """
    Handle image processing requests.
    
    Routes:
    - POST /images - Upload image
    - GET /images/{id} - Get image URL
    - DELETE /images/{id} - Delete image
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_parameters = event.get("pathParameters", {}) or {}
        body = event.get("body", "{}")
        
        if isinstance(body, str):
            try:
                body = json.loads(body) if body else {}
            except json.JSONDecodeError:
                body = {}
        
        image_id = path_parameters.get("id")
        
        if http_method == "POST":
            response = upload_image(body)
        
        elif http_method == "GET":
            if not image_id:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Image ID required"}),
                }
            response = get_image_url(image_id)
        
        elif http_method == "DELETE":
            if not image_id:
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": "Image ID required"}),
                }
            response = delete_image(image_id)
        
        else:
            response = {
                "statusCode": 405,
                "body": json.dumps({"error": "Method not allowed"}),
            }
        
        return response
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": {"Content-Type": "application/json"},
        }


def upload_image(body):
    """Upload image to S3."""
    try:
        if "image_data" not in body:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "image_data required (base64 encoded)"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Decode base64 image
        image_data = base64.b64decode(body["image_data"])
        image_id = str(uuid.uuid4())
        
        # Determine file extension
        content_type = body.get("content_type", "image/jpeg")
        extension = content_type.split("/")[1] if "/" in content_type else "jpg"
        
        key = f"products/{image_id}.{extension}"
        
        # Upload to S3
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=image_data,
            ContentType=content_type,
            Metadata={
                "product_name": body.get("product_name", ""),
                "uploaded_at": datetime.utcnow().isoformat(),
            },
        )
        
        logger.info(f"Image uploaded: {key}")
        
        return {
            "statusCode": 201,
            "body": json.dumps({
                "id": image_id,
                "url": f"s3://{S3_BUCKET}/{key}",
                "uploaded_at": datetime.utcnow().isoformat(),
            }),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def get_image_url(image_id):
    """Generate presigned URL for image."""
    try:
        # List objects matching the image ID
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET,
            Prefix=f"products/{image_id}",
        )
        
        if "Contents" not in response or len(response["Contents"]) == 0:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Image not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        key = response["Contents"][0]["Key"]
        
        # Generate presigned URL (valid for 1 hour)
        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "id": image_id,
                "url": presigned_url,
            }),
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Get URL error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def delete_image(image_id):
    """Delete image from S3."""
    try:
        # List and delete all objects matching the image ID
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET,
            Prefix=f"products/{image_id}",
        )
        
        if "Contents" not in response:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Image not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        for obj in response["Contents"]:
            s3_client.delete_object(Bucket=S3_BUCKET, Key=obj["Key"])
        
        logger.info(f"Image deleted: {image_id}")
        
        return {
            "statusCode": 204,
            "body": "",
            "headers": {"Content-Type": "application/json"},
        }
    
    except Exception as e:
        logger.error(f"Delete error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
