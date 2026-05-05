import json
import os
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
    Handle product management requests.
    
    Routes:
    - GET /products - List all products
    - POST /products - Create new product
    - GET /products/{id} - Get product details
    - PUT /products/{id} - Update product
    - DELETE /products/{id} - Delete product
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_parameters = event.get("pathParameters", {}) or {}
        body = event.get("body", "{}")
        
        # Parse body if string
        if isinstance(body, str):
            try:
                body = json.loads(body) if body else {}
            except json.JSONDecodeError:
                body = {}
        
        product_id = path_parameters.get("id")
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            if http_method == "GET":
                if product_id:
                    response = get_product(cursor, product_id)
                else:
                    response = list_products(cursor, event.get("queryStringParameters", {}))
            
            elif http_method == "POST":
                response = create_product(cursor, conn, body)
            
            elif http_method == "PUT":
                if not product_id:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Product ID required"}),
                    }
                response = update_product(cursor, conn, product_id, body)
            
            elif http_method == "DELETE":
                if not product_id:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Product ID required"}),
                    }
                response = delete_product(cursor, conn, product_id)
            else:
                response = {
                    "statusCode": 405,
                    "body": json.dumps({"error": "Method not allowed"}),
                }
                
        finally:
            cursor.close()
            conn.close()
        
        return response
    
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Internal server error: {str(e)}"}),
            "headers": {"Content-Type": "application/json"},
        }


def list_products(cursor, query_params):
    """List all products with optional filtering."""
    try:
        limit = int(query_params.get("limit", [10])[0] if isinstance(query_params.get("limit"), list) else query_params.get("limit", 10))
        offset = int(query_params.get("offset", [0])[0] if isinstance(query_params.get("offset"), list) else query_params.get("offset", 0))
        
        limit = min(limit, 100)  # Max 100 items
        
        cursor.execute("""
            SELECT id, name, description, price, stock, image_url, created_at, updated_at
            FROM products
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        
        products = cursor.fetchall()
        
        return {
            "statusCode": 200,
            "body": json.dumps([dict(p) for p in products], default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def get_product(cursor, product_id):
    """Get a single product."""
    try:
        cursor.execute("""
            SELECT id, name, description, price, stock, image_url, created_at, updated_at
            FROM products
            WHERE id = %s
        """, (product_id,))
        
        product = cursor.fetchone()
        
        if not product:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Product not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps(dict(product), default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def create_product(cursor, conn, body):
    """Create a new product."""
    try:
        required_fields = ["name", "price", "description"]
        if not all(field in body for field in required_fields):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Missing required fields: {required_fields}"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        cursor.execute("""
            INSERT INTO products (name, description, price, stock, image_url, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, description, price, stock, image_url, created_at, updated_at
        """, (
            body["name"],
            body.get("description", ""),
            float(body["price"]),
            int(body.get("stock", 0)),
            body.get("image_url", ""),
            datetime.utcnow(),
            datetime.utcnow(),
        ))
        
        product = cursor.fetchone()
        conn.commit()
        
        return {
            "statusCode": 201,
            "body": json.dumps(dict(product), default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def update_product(cursor, conn, product_id, body):
    """Update a product."""
    try:
        # Build dynamic update query
        update_fields = []
        values = []
        
        for field in ["name", "description", "price", "stock", "image_url"]:
            if field in body:
                update_fields.append(f"{field} = %s")
                if field == "price":
                    values.append(float(body[field]))
                elif field == "stock":
                    values.append(int(body[field]))
                else:
                    values.append(body[field])
        
        if not update_fields:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No fields to update"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        update_fields.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(product_id)
        
        cursor.execute(f"""
            UPDATE products
            SET {", ".join(update_fields)}
            WHERE id = %s
            RETURNING id, name, description, price, stock, image_url, created_at, updated_at
        """, values)
        
        product = cursor.fetchone()
        conn.commit()
        
        if not product:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Product not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps(dict(product), default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def delete_product(cursor, conn, product_id):
    """Delete a product."""
    try:
        cursor.execute("DELETE FROM products WHERE id = %s", (product_id,))
        
        if cursor.rowcount == 0:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Product not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        conn.commit()
        
        return {
            "statusCode": 204,
            "body": "",
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
