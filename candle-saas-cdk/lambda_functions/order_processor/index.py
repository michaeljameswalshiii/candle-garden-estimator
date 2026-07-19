"""
Order processor for The Candle Garden App.

Primary store: DynamoDB (candle-garden-orders).
Push tokens: candle-garden-push-tokens.
Auth: Cognito JWT via API Gateway (customer_id = claims.sub).
"""
import json
import os
import uuid
import time
import urllib.request
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
ORDERS_TABLE = os.environ.get("ORDERS_TABLE", "candle-garden-orders")
PUSH_TABLE = os.environ.get("PUSH_TABLE", "candle-garden-push-tokens")
RATE_LIMIT_TABLE = os.environ.get("RATE_LIMIT_TABLE", "candle-garden-detect-rate-limits")
RATE_WINDOW_SECONDS = int(os.environ.get("RATE_WINDOW_SECONDS", "3600"))

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
orders_table = dynamodb.Table(ORDERS_TABLE)
push_table = dynamodb.Table(PUSH_TABLE)


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    }


def _json(status, body):
    return {
        "statusCode": status,
        "body": json.dumps(body, default=_json_default),
        "headers": _cors_headers(),
    }


def _json_default(obj):
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)


def _claims(event):
    ctx = event.get("requestContext") or {}
    auth = ctx.get("authorizer") or {}
    claims = auth.get("claims") or auth
    return claims if isinstance(claims, dict) else {}


def _customer_id(event, body=None):
    claims = _claims(event)
    sub = claims.get("sub") or claims.get("cognito:username")
    email = claims.get("email")
    if sub:
        return sub
    if email:
        return email
    return None


def _to_decimal(value):
    try:
        return Decimal(str(round(float(value), 2)))
    except Exception:
        return Decimal("0")


def save_push_token(customer_id, body):
    token = (body.get("token") or body.get("expo_push_token") or "").strip()
    if not token or not token.startswith("ExponentPushToken"):
        # Also allow ExpoPushToken[...] format variants
        if not token or "PushToken" not in token:
            return _json(400, {"error": "Valid Expo push token required"})

    platform = body.get("platform") or "unknown"
    push_table.put_item(
        Item={
            "customer_id": customer_id,
            "token": token,
            "platform": platform,
            "updated_at": _now_iso(),
            "enabled": True,
        }
    )
    return _json(200, {"success": True, "token_saved": True})


def delete_push_token(customer_id, body):
    token = (body.get("token") or "").strip()
    if token:
        try:
            push_table.delete_item(Key={"customer_id": customer_id, "token": token})
        except Exception as e:
            logger.warning(f"Push token delete failed: {e}")
    else:
        # delete all for user
        try:
            resp = push_table.query(
                KeyConditionExpression=Key("customer_id").eq(customer_id)
            )
            for item in resp.get("Items") or []:
                push_table.delete_item(
                    Key={"customer_id": customer_id, "token": item["token"]}
                )
        except Exception as e:
            logger.warning(f"Push token bulk delete failed: {e}")
    return _json(200, {"success": True})


def _list_push_tokens(customer_id):
    try:
        resp = push_table.query(
            KeyConditionExpression=Key("customer_id").eq(customer_id)
        )
        return [
            i["token"]
            for i in (resp.get("Items") or [])
            if i.get("enabled", True) and i.get("token")
        ]
    except Exception as e:
        logger.warning(f"List push tokens failed: {e}")
        return []


def send_expo_push(tokens, title, body, data=None):
    """Send via Expo Push API. Best-effort; never fails the order."""
    if not tokens:
        return {"sent": 0}
    messages = [
        {
            "to": t,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
        }
        for t in tokens
    ]
    try:
        req = urllib.request.Request(
            "https://exp.host/--/api/v2/push/send",
            data=json.dumps(messages).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read().decode("utf-8")
            logger.info(f"Expo push response: {raw[:300]}")
            return {"sent": len(messages), "response": raw[:500]}
    except Exception as e:
        logger.warning(f"Expo push send failed: {e}")
        return {"sent": 0, "error": str(e)}


def ddb_create_order(customer_id, body, claims):
    items = body.get("items") or []
    if not items:
        return _json(400, {"error": "Order must have at least one item"})

    total = Decimal("0")
    normalized = []
    for item in items:
        qty = int(item.get("quantity") or 1)
        price = _to_decimal(item.get("price") or 0)
        total += price * qty
        normalized.append({
            "product_id": str(item.get("product_id") or item.get("id") or ""),
            "name": item.get("name") or "",
            "size": item.get("size") or "",
            "quantity": qty,
            "price": price,
        })

    order_id = str(uuid.uuid4())
    created = _now_iso()
    item = {
        "id": order_id,
        "customer_id": customer_id,
        "customer_email": claims.get("email") or body.get("customer_email") or "",
        "total_amount": total,
        "status": "pending",
        "source": body.get("source") or "mobile",
        "items": normalized,
        "created_at": created,
        "updated_at": created,
    }
    orders_table.put_item(Item=item)

    # Notify devices
    tokens = _list_push_tokens(customer_id)
    push_result = send_expo_push(
        tokens,
        title="Order received",
        body=f"The Candle Garden got your order (${float(total):.2f}).",
        data={"orderId": order_id, "type": "order_received"},
    )

    out = {
        "id": order_id,
        "customer_id": customer_id,
        "total_amount": float(total),
        "status": "pending",
        "items": [{**i, "price": float(i["price"])} for i in normalized],
        "created_at": created,
        "message": "Order saved",
        "push": push_result,
    }
    return _json(201, out)


def ddb_list_orders(customer_id, query_params=None):
    query_params = query_params or {}
    try:
        limit = int(query_params.get("limit") or 50)
    except Exception:
        limit = 50
    limit = max(1, min(limit, 100))

    resp = orders_table.query(
        IndexName="customer_id-created_at-index",
        KeyConditionExpression=Key("customer_id").eq(customer_id),
        ScanIndexForward=False,
        Limit=limit,
    )
    items = resp.get("Items") or []
    items = [i for i in items if i.get("status") != "deleted"]
    out = []
    for i in items:
        row = dict(i)
        if "total_amount" in row:
            row["total_amount"] = float(row["total_amount"])
        if isinstance(row.get("items"), list):
            for it in row["items"]:
                if "price" in it:
                    it["price"] = float(it["price"])
        out.append(row)
    return _json(200, out)


def ddb_get_order(order_id, customer_id):
    resp = orders_table.get_item(Key={"id": order_id})
    item = resp.get("Item")
    if not item or item.get("customer_id") != customer_id:
        return _json(404, {"error": "Order not found"})
    if item.get("status") == "deleted":
        return _json(404, {"error": "Order not found"})
    row = dict(item)
    if "total_amount" in row:
        row["total_amount"] = float(row["total_amount"])
    if isinstance(row.get("items"), list):
        for it in row["items"]:
            if "price" in it:
                it["price"] = float(it["price"])
    return _json(200, row)


def ddb_update_order(order_id, customer_id, body):
    existing = orders_table.get_item(Key={"id": order_id}).get("Item")
    if not existing or existing.get("customer_id") != customer_id:
        return _json(404, {"error": "Order not found"})

    status = body.get("status")
    if not status:
        return _json(400, {"error": "status is required"})

    updated = _now_iso()
    orders_table.update_item(
        Key={"id": order_id},
        UpdateExpression="SET #s = :s, updated_at = :u",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": status, ":u": updated},
    )

    # Notify on status change
    tokens = _list_push_tokens(customer_id)
    send_expo_push(
        tokens,
        title="Order update",
        body=f"Your Candle Garden order is now: {status}",
        data={"orderId": order_id, "type": "order_status", "status": status},
    )

    return _json(200, {"id": order_id, "status": status, "updated_at": updated})


def purge_user_data(customer_id):
    purged = {"rate_limit_keys": 0, "orders": 0, "push_tokens": 0, "store": "dynamodb"}

    try:
        table = dynamodb.Table(RATE_LIMIT_TABLE)
        now = int(time.time())
        window_id = now // int(os.environ.get("RATE_WINDOW_SECONDS", "3600"))
        for wid in (window_id - 1, window_id, window_id + 1):
            pk = f"user:{customer_id}#{wid}"
            try:
                table.delete_item(Key={"pk": pk})
                purged["rate_limit_keys"] += 1
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Rate-limit purge failed: {e}")

    try:
        resp = orders_table.query(
            IndexName="customer_id-created_at-index",
            KeyConditionExpression=Key("customer_id").eq(customer_id),
        )
        for item in resp.get("Items") or []:
            orders_table.update_item(
                Key={"id": item["id"]},
                UpdateExpression="SET #s = :s, updated_at = :u",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":s": "deleted", ":u": _now_iso()},
            )
            purged["orders"] += 1
    except Exception as e:
        logger.warning(f"Order purge failed: {e}")

    try:
        resp = push_table.query(
            KeyConditionExpression=Key("customer_id").eq(customer_id)
        )
        for item in resp.get("Items") or []:
            push_table.delete_item(
                Key={"customer_id": customer_id, "token": item["token"]}
            )
            purged["push_tokens"] += 1
    except Exception as e:
        logger.warning(f"Push token purge failed: {e}")

    return purged


def handler(event, context):
    try:
        http_method = event.get("httpMethod", "").upper()
        path = (event.get("path") or event.get("resource") or "").rstrip("/")
        path_parameters = event.get("pathParameters", {}) or {}
        body = event.get("body", "{}")

        if isinstance(body, str):
            try:
                body = json.loads(body) if body else {}
            except json.JSONDecodeError:
                body = {}

        if http_method == "OPTIONS":
            return _json(200, {"ok": True})

        claims = _claims(event)
        customer_id = _customer_id(event, body)
        if not customer_id:
            return _json(401, {"error": "Unauthorized — sign in required"})

        if http_method == "POST" and path.endswith("/account/purge"):
            result = purge_user_data(customer_id)
            return _json(200, {
                "success": True,
                "customer_id": customer_id,
                "purged": result,
                "message": "Server-side user data purge complete",
            })

        if http_method == "POST" and path.endswith("/account/push-token"):
            return save_push_token(customer_id, body if isinstance(body, dict) else {})

        if http_method == "DELETE" and path.endswith("/account/push-token"):
            return delete_push_token(customer_id, body if isinstance(body, dict) else {})

        if isinstance(body, dict):
            body = {
                **body,
                "customer_id": customer_id,
                "customer_email": claims.get("email"),
            }

        order_id = path_parameters.get("id")
        proxy_path = path_parameters.get("proxy", "")

        if http_method == "GET":
            if order_id:
                return ddb_get_order(order_id, customer_id)
            return ddb_list_orders(
                customer_id,
                event.get("queryStringParameters") or {},
            )

        if http_method == "POST":
            if proxy_path == "confirm":
                return ddb_update_order(order_id, customer_id, {"status": "confirmed"})
            return ddb_create_order(customer_id, body, claims)

        if http_method == "PUT":
            if not order_id:
                return _json(400, {"error": "Order ID required"})
            return ddb_update_order(order_id, customer_id, body)

        return _json(405, {"error": "Method not allowed"})

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return _json(500, {"error": f"Internal server error: {str(e)}"})
