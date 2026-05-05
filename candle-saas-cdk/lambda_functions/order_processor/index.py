import json
import os
import uuid
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
    Handle order processing requests.
    
    Routes:
    - GET /orders - List all orders
    - POST /orders - Create new order
    - GET /orders/{id} - Get order details
    - PUT /orders/{id} - Update order
    - POST /orders/{id}/confirm - Confirm/process order
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
        
        order_id = path_parameters.get("id")
        proxy_path = path_parameters.get("proxy", "")
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            if http_method == "GET":
                if order_id:
                    response = get_order(cursor, order_id)
                else:
                    response = list_orders(cursor, event.get("queryStringParameters", {}))
            
            elif http_method == "POST":
                if proxy_path == "confirm":
                    response = confirm_order(cursor, conn, order_id, body)
                else:
                    response = create_order(cursor, conn, body)
            
            elif http_method == "PUT":
                if not order_id:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({"error": "Order ID required"}),
                    }
                response = update_order(cursor, conn, order_id, body)
            
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


def list_orders(cursor, query_params):
    """List all orders with optional filtering."""
    try:
        limit = int(query_params.get("limit", [10])[0] if isinstance(query_params.get("limit"), list) else query_params.get("limit", 10))
        offset = int(query_params.get("offset", [0])[0] if isinstance(query_params.get("offset"), list) else query_params.get("offset", 0))
        
        limit = min(limit, 100)
        
        status = query_params.get("status", [None])[0] if isinstance(query_params.get("status"), list) else query_params.get("status")
        
        sql = """
            SELECT id, customer_id, total_amount, status, created_at, updated_at
            FROM orders
        """
        params = []
        
        if status:
            sql += " WHERE status = %s"
            params.append(status)
        
        sql += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(sql, params)
        orders = cursor.fetchall()
        
        return {
            "statusCode": 200,
            "body": json.dumps([dict(o) for o in orders], default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def get_order(cursor, order_id):
    """Get a single order."""
    try:
        cursor.execute("""
            SELECT id, customer_id, total_amount, status, created_at, updated_at
            FROM orders
            WHERE id = %s
        """, (order_id,))
        
        order = cursor.fetchone()
        
        if not order:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Order not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Get order items
        cursor.execute("""
            SELECT product_id, quantity, price
            FROM order_items
            WHERE order_id = %s
        """, (order_id,))
        
        items = cursor.fetchall()
        order_dict = dict(order)
        order_dict["items"] = [dict(item) for item in items]
        
        return {
            "statusCode": 200,
            "body": json.dumps(order_dict, default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def create_order(cursor, conn, body):
    """Create a new order."""
    try:
        required_fields = ["customer_id", "items"]
        if not all(field in body for field in required_fields):
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Missing required fields: {required_fields}"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        items = body.get("items", [])
        if not items:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Order must have at least one item"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Calculate total
        total_amount = sum(float(item.get("price", 0)) * int(item.get("quantity", 1)) for item in items)
        
        order_id = str(uuid.uuid4())
        
        cursor.execute("""
            INSERT INTO orders (id, customer_id, total_amount, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            order_id,
            body["customer_id"],
            total_amount,
            "pending",
            datetime.utcnow(),
            datetime.utcnow(),
        ))
        
        # Add order items
        for item in items:
            cursor.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, price)
                VALUES (%s, %s, %s, %s)
            """, (
                order_id,
                item["product_id"],
                int(item.get("quantity", 1)),
                float(item.get("price", 0)),
            ))
        
        conn.commit()
        
        return {
            "statusCode": 201,
            "body": json.dumps({
                "id": order_id,
                "customer_id": body["customer_id"],
                "total_amount": total_amount,
                "status": "pending",
                "items": items,
            }),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def update_order(cursor, conn, order_id, body):
    """Update an order."""
    try:
        update_fields = []
        values = []
        
        if "status" in body:
            update_fields.append("status = %s")
            values.append(body["status"])
        
        if not update_fields:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No fields to update"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        update_fields.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(order_id)
        
        cursor.execute(f"""
            UPDATE orders
            SET {", ".join(update_fields)}
            WHERE id = %s
            RETURNING id, customer_id, total_amount, status, created_at, updated_at
        """, values)
        
        order = cursor.fetchone()
        conn.commit()
        
        if not order:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Order not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps(dict(order), default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }


def confirm_order(cursor, conn, order_id, body):
    """Confirm/process an order."""
    try:
        if not order_id:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Order ID required"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        # Update order status
        cursor.execute("""
            UPDATE orders
            SET status = %s, updated_at = %s
            WHERE id = %s
            RETURNING id, customer_id, total_amount, status, created_at, updated_at
        """, ("confirmed", datetime.utcnow(), order_id))
        
        order = cursor.fetchone()
        conn.commit()
        
        if not order:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Order not found"}),
                "headers": {"Content-Type": "application/json"},
            }
        
        logger.info(f"Order {order_id} confirmed")
        
        return {
            "statusCode": 200,
            "body": json.dumps(dict(order), default=str),
            "headers": {"Content-Type": "application/json"},
        }
    except Exception as e:
        conn.rollback()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
            "headers": {"Content-Type": "application/json"},
        }
