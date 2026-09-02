"""Stripe PaymentIntent endpoints for The Candle Garden mobile app.

The mobile app never receives a Stripe secret. Amounts come from
packages/catalog/products.json (copied beside this file as catalog.json).
Live keys are refused unless STRIPE_LIVE_ENABLED=true.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

_secret_cache = {"value": None, "expires": 0}
_catalog_cache = None


def _headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Device-Id,Stripe-Signature",
    }


def _response(status, body):
    return {"statusCode": status, "headers": _headers(), "body": json.dumps(body)}


def _claims(event):
    authorizer = ((event.get("requestContext") or {}).get("authorizer") or {})
    claims = authorizer.get("claims") or authorizer
    return claims if isinstance(claims, dict) else {}


def _load_catalog():
    global _catalog_cache
    if _catalog_cache is not None:
        return _catalog_cache
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "catalog.json"),
        os.path.join(here, "..", "..", "..", "packages", "catalog", "products.json"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
            if not isinstance(data, list):
                raise RuntimeError("Product catalog is invalid")
            _catalog_cache = {str(item.get("id")): item for item in data if item.get("id")}
            return _catalog_cache
    raise RuntimeError("Product catalog is missing")


def catalog_unit_cents(product, size):
    """10oz / default uses price; 18oz uses priceMax when present."""
    base = float(product.get("price") or 0)
    maximum = float(product.get("priceMax") or base)
    label = str(size or "").lower()
    dollars = maximum if ("18" in label and maximum > base) else base
    if dollars <= 0:
        raise ValueError(f"{product.get('name') or 'Item'} has no price")
    return int(round(dollars * 100))


def amount_from_catalog(items):
    """Price the cart from the server catalog. Client unitPrice is ignored."""
    if not isinstance(items, list) or not items:
        raise ValueError("Your cart is empty")
    catalog = _load_catalog()
    total = 0
    priced = []
    for item in items:
        product_id = str(item.get("productId") or item.get("id") or "")
        product = catalog.get(product_id)
        if not product:
            raise ValueError("One or more items are not in the shop catalog")
        if product.get("soldOut"):
            raise ValueError(f"{product.get('name') or 'An item'} is sold out")
        try:
            qty = int(item.get("quantity") or 0)
        except (TypeError, ValueError) as error:
            raise ValueError("One or more quantities are invalid") from error
        if qty < 1 or qty > 20:
            raise ValueError("One or more quantities are invalid")
        unit = catalog_unit_cents(product, item.get("size"))
        line = unit * qty
        total += line
        priced.append(
            {
                "productId": product_id,
                "name": product.get("name"),
                "size": item.get("size") or None,
                "quantity": qty,
                "unitCents": unit,
            }
        )
    if total < 50 or total > 100000:
        raise ValueError("Cart total is outside the allowed test range")
    return total, priced


def _stripe_secret():
    direct = os.environ.get("STRIPE_SECRET_KEY")
    if direct:
        return direct
    arn = os.environ.get("STRIPE_SECRET_ARN")
    if not arn:
        return None
    if _secret_cache["value"] and _secret_cache["expires"] > time.time():
        return _secret_cache["value"]
    import boto3

    raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString", "")
    try:
        value = json.loads(raw).get("STRIPE_SECRET_KEY")
    except json.JSONDecodeError:
        value = raw
    _secret_cache.update({"value": value, "expires": time.time() + 300})
    return value


def _stripe_request(path, values):
    key = _stripe_secret()
    if not key:
        raise RuntimeError("Stripe test key is not configured yet")
    if key.startswith("sk_live_") and os.environ.get("STRIPE_LIVE_ENABLED") != "true":
        raise RuntimeError("Live Stripe charges are disabled for this app")
    request = urllib.request.Request(
        f"https://api.stripe.com/v1/{path}",
        data=urllib.parse.urlencode(values).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": "Basic " + base64.b64encode(f"{key}:".encode()).decode(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        data = json.loads(error.read().decode("utf-8"))
        message = ((data.get("error") or {}).get("message")) or "Stripe could not create the payment."
        raise RuntimeError(message) from error


def _body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded") and isinstance(raw, str):
        raw = base64.b64decode(raw).decode("utf-8")
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("Checkout request was invalid") from error


def _create_payment_sheet(event):
    claims = _claims(event)
    customer_id = claims.get("sub") or claims.get("cognito:username")
    if not customer_id:
        return _response(401, {"error": "Please sign in before checkout"})
    try:
        amount, priced = amount_from_catalog(_body(event).get("items"))
        intent = _stripe_request("payment_intents", {
            "amount": amount,
            "currency": "usd",
            "automatic_payment_methods[enabled]": "true",
            "metadata[candle_garden_mode]": "test",
            "metadata[customer_id]": str(customer_id)[:80],
            "metadata[item_count]": str(len(priced)),
        })
        return _response(200, {
            "paymentIntentClientSecret": intent["client_secret"],
            "paymentIntentId": intent["id"],
            "amount": amount,
            "currency": "usd",
            "items": priced,
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not start Stripe checkout"})


def _verify_webhook(event):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    headers = event.get("headers") or {}
    signature = headers.get("Stripe-Signature") or headers.get("stripe-signature")
    raw = event.get("body") or ""
    if event.get("isBase64Encoded") and isinstance(raw, str):
        raw = base64.b64decode(raw).decode("utf-8")
    if not secret or not signature:
        return False
    try:
        parts = dict(p.split("=", 1) for p in signature.split(",") if "=" in p)
        timestamp, expected = parts.get("t"), parts.get("v1")
        if not timestamp or not expected or abs(time.time() - int(timestamp)) > 300:
            return False
        digest = hmac.new(secret.encode(), f"{timestamp}.{raw}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


def handler(event, context):
    method = (event.get("httpMethod") or "").upper()
    path = (event.get("path") or event.get("resource") or "").rstrip("/")
    if method == "OPTIONS":
        return _response(200, {"ok": True})
    if method == "POST" and path.endswith("/payments/payment-sheet"):
        return _create_payment_sheet(event)
    if method == "POST" and path.endswith("/payments/webhook"):
        if not os.environ.get("STRIPE_WEBHOOK_SECRET"):
            return _response(503, {"error": "Stripe webhook is not configured"})
        if not _verify_webhook(event):
            return _response(400, {"error": "Invalid Stripe signature"})
        return _response(200, {"received": True})
    return _response(404, {"error": "Not found"})
