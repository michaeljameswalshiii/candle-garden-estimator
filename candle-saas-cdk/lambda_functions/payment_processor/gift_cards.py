"""App-only stored value. Integer cents; transactional reservations and ledger.

Codes are bearer credentials and must never be logged. Test/live cards are isolated.
Reservations do not expire: release only after Stripe confirms cancellation.
"""
import hashlib
import html
import os
import secrets
import time

AMOUNTS = (25, 50, 75, 100, 250, 500)
TABLE = os.environ.get("GIFT_CARDS_TABLE", "candle-garden-gift-cards")


def table():
    import boto3
    return boto3.resource("dynamodb").Table(TABLE)


def transact(operations):
    import boto3
    from boto3.dynamodb.types import TypeSerializer
    serializer = TypeSerializer()
    for operation in operations:
        values = next(iter(operation.values()))
        for field in ("Key", "Item", "ExpressionAttributeValues"):
            if field in values:
                values[field] = {k: serializer.serialize(v) for k, v in values[field].items()}
    boto3.client("dynamodb").transact_write_items(TransactItems=operations)


def code_key(code):
    normalized = str(code or "").replace("-", "").replace(" ", "").upper()
    if len(normalized) != 32 or any(c not in "0123456789ABCDEF" for c in normalized):
        raise ValueError("Enter the gift card code from your email.")
    return "card:" + hashlib.sha256(normalized.encode()).hexdigest()


def get(code, live):
    card = table().get_item(Key={"id": code_key(code)}, ConsistentRead=True).get("Item")
    if not card or card.get("disabled") or bool(card.get("live")) != live:
        raise ValueError("This gift card is not available for this checkout.")
    return card


def price(item):
    raw = item.get("giftAmount")
    if isinstance(raw, bool) or raw not in AMOUNTS or item.get("quantity") != 1:
        raise ValueError("Choose a gift card amount: $25, $50, $75, $100, $250, or $500.")
    delivery = item.get("delivery") or {}
    if not isinstance(delivery, dict):
        raise ValueError("Gift card delivery details are invalid.")
    email = str(delivery.get("email") or "").strip()
    import re
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Enter a valid gift card delivery email.")
    cleaned = {"email": email}
    for key, limit in (("recipientName", 80), ("senderName", 80), ("message", 500)):
        cleaned[key] = str(delivery.get(key) or "").strip()[:limit]
    return int(raw * 100), {"type": "gift_card", "productId": "app-gift-card",
        "name": "Candle Garden digital gift card", "quantity": 1,
        "unitCents": int(raw * 100), "delivery": cleaned}


def reserve(code, order_id, total, live):
    card = get(code, live)
    amount = min(int(card.get("balanceCents", 0)), total)
    # Stripe requires at least 50 cents for the remainder.
    if 0 < total - amount < 50:
        amount = max(0, total - 50)
    if amount <= 0:
        raise ValueError("This gift card has no available balance for this order.")
    try:
        transact([
            {"Update": {"TableName": TABLE, "Key": {"id": card["id"]},
                "UpdateExpression": "SET balanceCents = balanceCents - :amount",
                "ConditionExpression": "balanceCents >= :amount AND disabled = :false",
                "ExpressionAttributeValues": {":amount": amount, ":false": False}}},
            {"Put": {"TableName": TABLE, "Item": {"id": "reservation:" + order_id,
                "cardId": card["id"], "amountCents": amount, "state": "reserved", "createdAt": int(time.time())},
                "ConditionExpression": "attribute_not_exists(id)"}},
        ])
    except Exception as error:
        raise ValueError("Gift card balance changed. Check the balance and try again.") from error
    return amount


def reservation(order_id):
    return table().get_item(Key={"id": "reservation:" + order_id}, ConsistentRead=True).get("Item")


def commit(order_id):
    row = reservation(order_id)
    if not row or row["state"] == "redeemed":
        return
    table().update_item(Key={"id": row["id"]}, UpdateExpression="SET #s = :paid",
        ConditionExpression="#s = :reserved", ExpressionAttributeNames={"#s": "state"},
        ExpressionAttributeValues={":paid": "redeemed", ":reserved": "reserved"})


def release(order_id):
    row = reservation(order_id)
    if not row or row["state"] == "released":
        return True
    if row["state"] != "reserved":
        return False
    try:
        transact([
        {"Update": {"TableName": TABLE, "Key": {"id": row["id"]},
            "UpdateExpression": "SET #s = :released", "ConditionExpression": "#s = :reserved",
            "ExpressionAttributeNames": {"#s": "state"},
            "ExpressionAttributeValues": {":released": "released", ":reserved": "reserved"}}},
        {"Update": {"TableName": TABLE, "Key": {"id": row["cardId"]},
            "UpdateExpression": "SET balanceCents = balanceCents + :amount",
            "ExpressionAttributeValues": {":amount": int(row["amountCents"])}}},
        ])
    except Exception:
        current = reservation(order_id)
        if current and current["state"] in ("redeemed", "released"):
            return current["state"] == "released"
        raise
    return True


def issue(order, live, orders_table):
    """One card per paid order, including across simultaneous webhook/finalize calls."""
    if not any(item.get("type") == "gift_card" for item in order.get("items", [])):
        return
    order_id = order["id"]
    existing = table().get_item(Key={"id": "delivery:" + order_id}, ConsistentRead=True).get("Item")
    if existing:
        return existing
    item = order["items"][0]
    code = secrets.token_hex(16).upper()
    code = "-".join(code[i:i + 4] for i in range(0, 32, 4))
    amount = int(round(float(item["price"]) * 100))
    delivery = {"id": "delivery:" + order_id, "code": code, "amountCents": amount,
        "live": live, "delivery": item["delivery"], "state": "pending", "orderId": order_id,
        "createdAt": int(time.time())}
    try:
        transact([
            {"Put": {"TableName": TABLE, "Item": {"id": code_key(code), "balanceCents": amount,
                "originalCents": amount, "live": live, "disabled": False, "orderId": order_id},
                "ConditionExpression": "attribute_not_exists(id)"}},
            {"Put": {"TableName": TABLE, "Item": delivery, "ConditionExpression": "attribute_not_exists(id)"}},
            {"Update": {"TableName": orders_table, "Key": {"id": order_id},
                "UpdateExpression": "SET gift_issued = :yes",
                "ConditionExpression": "attribute_exists(id) AND attribute_not_exists(gift_issued)",
                "ExpressionAttributeValues": {":yes": True}}},
        ])
    except Exception:
        existing = table().get_item(Key={"id": delivery["id"]}, ConsistentRead=True).get("Item")
        if not existing:
            raise
        return existing
    return delivery


def gift_card_html(row, text):
    """Table-based gift card remains usable when email images are blocked."""
    delivery = row["delivery"]
    amount = int(row["amountCents"]) / 100
    escape = lambda value: html.escape(str(value or ""))
    logo = "https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/f152dc96-196e-44c6-9eab-c51856309c22/Black+Piggie+Simple.png"
    test = "TEST CARD - NO CASH VALUE" if not row["live"] else "DIGITAL GIFT CARD"
    return f"""<!doctype html><html><body style="margin:0;background:#F5F3F7;color:#103831">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;font-family:Arial,sans-serif">
<tr><td style="padding:12px 8px 24px;text-align:center;font-family:Georgia,serif;font-size:27px">A little light, just for you.</td></tr>
<tr><td style="background:#103831;border-radius:20px;padding:8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #9EB9AE;border-radius:16px">
<tr><td style="padding:25px 24px 14px;text-align:center;color:#FFFFFF">
<img src="{logo}" width="64" height="64" alt="The Candle Garden logo" style="display:block;margin:0 auto 12px;background:#EEE9F2;border-radius:50%;padding:8px">
<div style="font-family:Georgia,serif;font-size:30px;line-height:1.2">The Candle Garden</div>
<div style="font-size:11px;letter-spacing:3px;margin-top:12px">{test}</div>
</td></tr><tr><td style="padding:8px 24px 20px;text-align:center;color:#FFFFFF;font-family:Georgia,serif;font-size:52px">${amount:,.2f}</td></tr>
<tr><td style="padding:0 24px 20px;text-align:center;color:#EEE9F2;font-size:14px;line-height:1.7">
To: {escape(delivery.get('recipientName')) or 'Someone special'}<br>From: {escape(delivery.get('senderName')) or 'Someone who cares'}</td></tr>
<tr><td style="padding:0 20px 24px"><div style="background:#EEE9F2;border-radius:10px;padding:16px 10px;text-align:center;color:#103831">
<div style="font-size:10px;letter-spacing:2px;margin-bottom:8px">YOUR REDEMPTION CODE</div>
<div style="font-family:monospace;font-size:20px;font-weight:bold;overflow-wrap:anywhere;word-break:break-all">{escape(row['code'])}</div>
</div></td></tr></table></td></tr>
<tr><td style="padding:24px 8px 8px;font-family:Georgia,serif;font-size:18px;line-height:1.6;white-space:pre-wrap">{escape(delivery.get('message'))}</td></tr>
<tr><td style="padding:12px 8px;font-size:14px;line-height:1.7">{escape(text).replace(chr(10), '<br>')}</td></tr>
<tr><td style="padding:20px 8px;text-align:center;font-size:12px;color:#55665F">Hand-poured candles &middot; Plants &middot; Candle classes<br>Atlantic Beach, Florida</td></tr>
</table></td></tr></table></body></html>"""


def deliver(row, ses, source, reply_to):
    if not row or row.get("state") == "sent":
        return
    now = int(time.time())
    try:
        table().update_item(Key={"id": row["id"]}, UpdateExpression="SET leaseUntil = :lease",
            ConditionExpression="#s = :pending AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":pending": "pending", ":lease": now + 120, ":now": now})
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return
        raise
    delivery = row["delivery"]
    amount = int(row["amountCents"]) / 100
    test = "TEST — " if not row["live"] else ""
    text = (f"{test}You received a ${amount:.2f} Candle Garden gift card!\n\n"
        f"To: {delivery.get('recipientName', '')}\nFrom: {delivery.get('senderName', '')}\n"
        f"{delivery.get('message', '')}\n\nGift card code: {row['code']}\n\n"
        "Open the Candle Garden app, shop for candles, refills, or classes, and enter this code in Cart. "
        "Unused value stays on your card. No account is needed. "
        "This card is for Candle Garden app checkout; it cannot be used at Squarespace website checkout.\n"
        + ("This is a test card with no cash value; it works only with test checkout.\n" if not row["live"] else ""))
    markup = gift_card_html(row, text)
    provider_options = {"IdempotencyKey": "gift-card:" + row["orderId"] + ":" + str(row.get("resendCount", 0))} if os.environ.get("EMAIL_PROVIDER") == "resend" else {}
    ses.send_email(Source=source, Destination={"ToAddresses": [delivery["email"]]},
        ReplyToAddresses=[reply_to], Message={"Subject": {"Data": test + "Your Candle Garden gift card", "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text, "Charset": "UTF-8"}, "Html": {"Data": markup, "Charset": "UTF-8"}}}, **provider_options)
    table().update_item(Key={"id": row["id"]}, UpdateExpression="SET #s = :sent, sentAt = :now REMOVE leaseUntil",
        ExpressionAttributeNames={"#s": "state"}, ExpressionAttributeValues={":sent": "sent", ":now": now})
    row["state"] = "sent"


def refund_redemption(order_id, cumulative_cents, order_total_cents):
    """Refund cash first, then gift value. Duplicate events cannot add value twice."""
    row = reservation(order_id)
    if not row or row["state"] != "redeemed":
        return
    gift_cents = int(row["amountCents"])
    cash_cents = order_total_cents - gift_cents
    target = gift_cents if cumulative_cents >= cash_cents else 0
    previous = int(row.get("refundedCents", 0))
    if target <= previous:
        return
    condition = "attribute_not_exists(refundedCents)" if not previous else "refundedCents = :previous"
    values = {":target": target}
    if previous:
        values[":previous"] = previous
    transact([
        {"Update": {"TableName": TABLE, "Key": {"id": row["id"]},
            "UpdateExpression": "SET refundedCents = :target", "ConditionExpression": condition,
            "ExpressionAttributeValues": values}},
        {"Update": {"TableName": TABLE, "Key": {"id": row["cardId"]},
            "UpdateExpression": "SET balanceCents = balanceCents + :delta",
            "ExpressionAttributeValues": {":delta": target - previous}}},
    ])


def disable_refunded_purchase(order_id):
    row = table().get_item(Key={"id": "delivery:" + order_id}, ConsistentRead=True).get("Item")
    if not row:
        raise RuntimeError("Gift card refund needs review: issuance has not completed.")
    table().update_item(Key={"id": code_key(row["code"])},
        UpdateExpression="SET disabled = :yes", ExpressionAttributeValues={":yes": True})
    table().update_item(Key={"id": row["id"]}, UpdateExpression="SET #s = :cancelled",
        ExpressionAttributeNames={"#s": "state"}, ExpressionAttributeValues={":cancelled": "cancelled"})


def retry_deliveries(ses, source, reply_to):
    cursor = None
    while True:
        args = {"FilterExpression": "begins_with(id, :prefix) AND #s = :pending",
            "ExpressionAttributeNames": {"#s": "state"},
            "ExpressionAttributeValues": {":prefix": "delivery:", ":pending": "pending"}}
        if cursor:
            args["ExclusiveStartKey"] = cursor
        result = table().scan(**args)
        for row in result.get("Items", []):
            try:
                deliver(row, ses, source, reply_to)
            except Exception:
                print("Gift card email will retry", row["orderId"])
        cursor = result.get("LastEvaluatedKey")
        if not cursor:
            break
