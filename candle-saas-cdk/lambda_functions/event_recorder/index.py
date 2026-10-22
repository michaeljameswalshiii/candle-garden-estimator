"""Records first-party mobile engagement events (POST /events).

Item schema matches candle-garden-web/src/app/events/route.ts (recordMobileEvent).
"""
import json
import os
import time
import uuid
from datetime import datetime, timezone

import boto3

TABLE = boto3.resource("dynamodb").Table(os.environ["EVENTS_TABLE"])
ALLOWED = {"app_open", "screen_view", "payment_success"}
TTL_SECONDS = 400 * 86400
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Device-Id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}


def _resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body)}


def handler(event, _context):
    try:
        body = json.loads(event.get("body") or "{}")
        if not isinstance(body, dict):
            raise ValueError
    except (ValueError, TypeError):
        return _resp(400, {"error": "Invalid JSON"})
    name = str(body.get("name") or "")
    if name not in ALLOWED:
        return _resp(400, {"error": "Unsupported event"})
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    now = datetime.now(timezone.utc)
    item = {
        "id": str(uuid.uuid4()),
        "name": name,
        "device_id": str(headers.get("x-device-id") or "unknown")[:100],
        "created_at": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "expires_at": int(time.time()) + TTL_SECONDS,
    }
    if body.get("screen"):
        item["screen"] = str(body["screen"])[:40]
    try:
        TABLE.put_item(Item=item)
    except Exception:  # noqa: BLE001
        return _resp(500, {"error": "Could not record event"})
    return _resp(200, {"ok": True})
