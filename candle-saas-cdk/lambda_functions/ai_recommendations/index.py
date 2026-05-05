import json
import os
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Database configuration
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT", "5432")
DB_NAME = os.environ.get("DB_NAME", "candledb")
DB_USER = os.environ.get("DB_USER", "candleadmin")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# Initialize Bedrock client
bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)


def get_db_connection():
    """Get database connection."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=os.environ.get("DB_PASSWORD", ""),
        )
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise


def handler(event, context):
    """
    Handle AI recommendation requests using Claude (Bedrock).
    
    Routes:
    - POST /recommendations - Get product recommendations
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
        
        if "customer_id" not in body and "preferences" not in body:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "customer_id or preferences required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        response = get_recommendations(body)
        return response
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": {"Content-Type": "application/json"},
        }


def get_recommendations(request_body):
    """Get AI-powered recommendations for products."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            # Get customer preferences or use provided preferences
            preferences_text = ""
            
            if "customer_id" in request_body:
                customer_id = request_body["customer_id"]
                
                # Get customer order history
                cursor.execute("""
                    SELECT DISTINCT p.name, COUNT(p.name) as count
                    FROM orders o
                    JOIN order_items oi ON o.id = oi.order_id
                    JOIN products p ON oi.product_id = p.id
                    WHERE o.customer_id = %s
                    GROUP BY p.name
                    LIMIT 10
                """, (customer_id,))
                
                past_orders = cursor.fetchall()
                preferences_text += "Past purchases: " + ", ".join([p["name"] for p in past_orders]) + "\n"
            
            # Add explicit preferences if provided
            if "preferences" in request_body:
                preferences_text += "Customer preferences: " + request_body["preferences"] + "\n"
            
            # Get all available products
            cursor.execute("""
                SELECT id, name, description, price
                FROM products
                WHERE stock > 0
                ORDER BY created_at DESC
                LIMIT 50
            """)
            
            available_products = cursor.fetchall()
            products_text = "Available products:\n"
            for product in available_products:
                products_text += f"- {product['name']} (${product['price']}): {product['description']}\n"
            
            # Call Bedrock Claude model for recommendations
            prompt = f"""You are a helpful assistant for a candle refill SaaS platform. 
Based on the customer's preferences and purchase history, provide personalized product recommendations.

{preferences_text}

{products_text}

Please provide 3-5 specific product recommendations with brief explanations of why each would be suitable.
Format your response as a JSON array with objects containing: name, reason, and estimated_price fields."""
            
            response = bedrock_client.invoke_model(
                modelId="anthropic.claude-3-haiku-20240307-v1:0",
                contentType="application/json",
                accept="application/json",
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-06-01",
                    "max_tokens": 1024,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                })
            )
            
            # Parse response
            response_body = json.loads(response["body"].read().decode("utf-8"))
            recommendations_text = response_body["content"][0]["text"]
            
            # Try to extract JSON from response
            try:
                Start_idx = recommendations_text.find("[")
                end_idx = recommendations_text.rfind("]") + 1
                if start_idx > -1 and end_idx > 0:
                    recommendations = json.loads(recommendations_text[start_idx:end_idx])
                else:
                    recommendations = [{"text": recommendations_text}]
            except json.JSONDecodeError:
                recommendations = [{"text": recommendations_text}]
            
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "recommendations": recommendations,
                    "generated_at": datetime.utcnow().isoformat(),
                }),
                "headers": {"Content-Type": "application/json"},
            }
        
        finally:
            cursor.close()
            conn.close()
    
    except Exception as e:
        logger.error(f"Recommendation error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
