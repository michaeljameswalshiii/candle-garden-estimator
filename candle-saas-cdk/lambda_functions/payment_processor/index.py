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
import uuid
import secrets
import gift_cards
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal

from refill_shipping import (
    quote_refill_shipping,
    METHODS,
    ORIGIN_PARTY,
    LEG_TITLES,
    label_purchase_plan,
    normalize_speed,
)
import shippo_client
import ups_client

_secret_cache = {"value": None, "expires": 0}
_catalog_cache = None
_catalog_cache_expires = 0
_classes_cache = None
_classes_cache_expires = 0
_service_secret_cache = {"value": {}, "expires": 0}


def _service_secret(name):
    direct = os.environ.get(name)
    if direct:
        return direct
    arn = os.environ.get("GIFT_SERVICES_SECRET_ARN")
    if not arn:
        return ""
    if _service_secret_cache["expires"] <= time.time():
        import boto3
        raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString", "{}")
        _service_secret_cache.update({"value": json.loads(raw), "expires": time.time() + 300})
    return str(_service_secret_cache["value"].get(name) or "")


def _headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Device-Id,Stripe-Signature",
    }


def _response(status, body):
    return {"statusCode": status, "headers": _headers(), "body": json.dumps(body)}


def _claims(event):
    from cognito_identity import verified_claims
    return verified_claims(event)


def _guest_device(event):
    headers = {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}
    device = headers.get("x-device-id", "")
    if not 8 <= len(device) <= 128 or not device.isascii() or not device.replace("_", "").replace("-", "").isalnum():
        raise ValueError("A valid device identity is required for guest checkout.")
    return device


def _authorize_order(event, order):
    if not order or order.get("status") == "deleted":
        raise ValueError("Order not found")
    claims = _claims(event)
    customer = claims.get("sub") or f"guest:{_guest_device(event)}"
    if not customer or order.get("customer_id") != customer:
        raise ValueError("Order not found")


def _verify_order_payment(order, intent):
    if (intent.get("id") != order.get("payment_intent_id")
            or (intent.get("metadata") or {}).get("candle_garden_order_id") != order.get("id")):
        raise ValueError("Payment does not match this order.")
    amount = int(order.get("stripe_amount_cents", round(float(order.get("total_amount", 0)) * 100)))
    if intent.get("currency") != "usd" or int(intent.get("amount", -1)) != amount:
        raise ValueError("Payment amount does not match this order.")
    if intent.get("status") == "succeeded" and int(intent.get("amount_received", -1)) != amount:
        raise ValueError("Payment amount does not match this order.")
    if bool(intent.get("livemode")) != bool(str(_stripe_secret() or "").startswith("sk_live_")):
        raise ValueError("Payment mode does not match this checkout.")


def _load_catalog():
    global _catalog_cache, _catalog_cache_expires
    now = time.time()
    if _catalog_cache is not None and _catalog_cache_expires > now:
        return _catalog_cache
    live_url = os.environ.get("PRODUCT_CATALOG_URL")
    if live_url:
        request = urllib.request.Request(
            live_url,
            method="GET",
            headers={"Accept": "application/json", "User-Agent": "CandleGardenPayments/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
            data = payload.get("products") if isinstance(payload, dict) else None
            if not isinstance(data, list) or not data:
                raise RuntimeError("Live product catalog is invalid")
            _catalog_cache = {str(item.get("id")): item for item in data if item.get("id")}
            _catalog_cache_expires = now + 60
            return _catalog_cache
        except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError):
            pass
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
            _catalog_cache_expires = now + 60
            return _catalog_cache
    raise RuntimeError("Product catalog is missing")


def _load_classes():
    global _classes_cache, _classes_cache_expires
    now = time.time()
    if _classes_cache is not None and _classes_cache_expires > now:
        return _classes_cache
    live_url = os.environ.get("CLASS_CATALOG_URL")
    if live_url:
        request = urllib.request.Request(
            live_url,
            method="GET",
            headers={"Accept": "application/json", "User-Agent": "CandleGardenPayments/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
            data = payload.get("classes") if isinstance(payload, dict) else None
            if not isinstance(data, list) or not data:
                raise RuntimeError("Live class catalog is invalid")
            _classes_cache = {str(item.get("id")): item for item in data if item.get("id")}
            _classes_cache_expires = now + 60
            return _classes_cache
        except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError):
            # Keep checkout available from the packaged catalog during a brief
            # website outage. Unknown new class IDs still fail closed.
            pass
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "classes.json"),
        os.path.join(here, "..", "..", "..", "packages", "catalog", "classes.json"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
            if not isinstance(data, list):
                raise RuntimeError("Class catalog is invalid")
            _classes_cache = {str(item.get("id")): item for item in data if item.get("id")}
            _classes_cache_expires = now + 60
            return _classes_cache
    raise RuntimeError("Class catalog is missing")


def catalog_unit_cents(product, size):
    """10oz / default uses price; 18oz uses priceMax when present."""
    base = float(product.get("price") or 0)
    maximum = float(product.get("priceMax") or base)
    label = str(size or "").lower()
    dollars = maximum if ("18" in label and maximum > base) else base
    if dollars <= 0:
        raise ValueError(f"{product.get('name') or 'Item'} has no price")
    return int(round(dollars * 100))


def _qty(item):
    try:
        qty = int(item.get("quantity") or 0)
    except (TypeError, ValueError) as error:
        raise ValueError("One or more quantities are invalid") from error
    if qty < 1 or qty > 20:
        raise ValueError("One or more quantities are invalid")
    return qty


def _price_product(item):
    catalog = _load_catalog()
    product_id = str(item.get("productId") or item.get("id") or "")
    product = catalog.get(product_id)
    if not product:
        raise ValueError("One or more items are not in the shop catalog")
    qty = _qty(item)
    variants = product.get("variants") if isinstance(product.get("variants"), list) else []
    selected = None
    if variants:
        variant_id = str(item.get("variantId") or "")
        size = str(item.get("size") or "").strip().lower()
        if variant_id:
            selected = next((row for row in variants if str(row.get("id")) == variant_id), None)
        if selected is None and size:
            selected = next((row for row in variants if str(row.get("size") or "").strip().lower() == size), None)
        if selected is None and len(variants) == 1:
            selected = variants[0]
        if selected is None:
            raise ValueError(f"Choose an available size for {product.get('name') or 'this item'}")
        if selected.get("soldOut"):
            raise ValueError(f"{product.get('name') or 'An item'} {selected.get('size') or ''} is sold out".strip())
        dollars = float(selected.get("price") or 0)
        if dollars <= 0:
            raise ValueError(f"{product.get('name') or 'Item'} has no price")
        unit = int(round(dollars * 100))
    else:
        if product.get("soldOut"):
            raise ValueError(f"{product.get('name') or 'An item'} is sold out")
        unit = catalog_unit_cents(product, item.get("size"))
    return unit * qty, {
        "type": "product",
        "productId": product_id,
        "name": product.get("name"),
        "size": item.get("size") or None,
        "variantId": selected.get("id") if selected else None,
        "quantity": qty,
        "unitCents": unit,
    }


def _clean_scents(item):
    raw = item.get("scents") if isinstance(item, dict) else None
    if not isinstance(raw, list):
        return None
    cleaned = []
    for row in raw[:12]:
        if isinstance(row, str):
            name = row.strip()[:80]
            if name:
                cleaned.append({"scent": name})
            continue
        if not isinstance(row, dict):
            continue
        scent = str(row.get("scent") or "").strip()[:80]
        if not scent:
            continue
        vessel = str(row.get("vessel") or "").strip()[:80]
        entry = {"scent": scent}
        if vessel:
            entry["vessel"] = vessel
        cleaned.append(entry)
    return cleaned or None


def packing_acknowledged(body):
    """True only when this checkout explicitly accepted the vessel notice.

    Older app builds omit the flag. Checkout still proceeds.
    """
    if not isinstance(body, dict):
        return False
    return body.get("packingAcknowledged") is True or body.get("packing_acknowledged") is True


def _price_refill(item):
    try:
        ounces = float(item.get("ounces") or 0)
    except (TypeError, ValueError) as error:
        raise ValueError("Refill ounces are invalid") from error
    if ounces <= 0 or ounces > 80:
        raise ValueError("Refill ounces are outside the allowed range")
    qty = _qty(item)
    dest_zip = (
        item.get("destZip")
        or item.get("dest_zip")
        or item.get("zip")
        or item.get("_checkoutZip")
    )
    method = str(item.get("shippingMethod") or item.get("shipping_method") or "ship_own")
    box_key = item.get("boxKey") or item.get("box_key")
    size_hint = str(item.get("size") or "").strip().lower()
    speed = item.get("speed") or item.get("refillSpeed")
    if size_hint in ("standard", "expedited"):
        speed = size_hint
    speed = normalize_speed(speed)
    try:
        quote = quote_refill_shipping(
            ounces,
            quantity=qty,
            box_key=box_key,
            dest_zip=dest_zip,
            shipping_method=method,
            vessel_count=item.get("vesselCount") or item.get("vessel_count") or qty,
            dest=item.get("dest") or item.get("shipping"),
            speed=speed,
        )
    except ValueError as error:
        raise ValueError(str(error)) from error
    unit = int(round(quote["total_cents"] / qty))
    size = f"{quote['method_title']} · {quote['box_name']}"
    row = {
        "type": "refill",
        "productId": "refill",
        "name": f"Candle refill · {ounces:g} oz",
        "size": size,
        "quantity": qty,
        "unitCents": unit,
        "shippingCents": int(quote.get("shipping_cents") or 0),
        "waxCents": int(quote.get("wax_cents") or 0),
        "ounces": ounces,
        "boxKey": quote["box_key"],
        "destZip": _zip_or_none(dest_zip),
        "shippingMethod": quote["method"],
        "speed": quote.get("speed") or speed,
        "vesselCount": int(item.get("vesselCount") or item.get("vessel_count") or qty),
    }
    scents = _clean_scents(item)
    if scents:
        row["scents"] = scents
    return quote["total_cents"], row


def _zip_or_none(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[:5] if len(digits) >= 5 else None


def _price_class(item):
    classes = _load_classes()
    class_id = str(item.get("productId") or item.get("id") or "")
    course = classes.get(class_id)
    if not course:
        raise ValueError("One or more classes are not in the catalog")
    if course.get("soldOut"):
        raise ValueError(f"{course.get('title') or 'That class'} is sold out")
    qty = _qty(item)
    available = course.get("available")
    if available is not None and qty > int(available):
        raise ValueError("Not enough seats are left for that class")
    unit = int(round(float(course.get("price") or 0) * 100))
    if unit <= 0:
        raise ValueError("That class has no price")
    label = course.get("scheduleLabel") or course.get("dateDisplay") or course.get("date")
    return unit * qty, {
        "type": "class",
        "productId": class_id,
        "name": course.get("title") or "Candle class",
        "size": label,
        "quantity": qty,
        "unitCents": unit,
        "date": course.get("date"),
        "variantId": str(course.get("variantId") or "") or None,
    }


def amount_from_catalog(items):
    """Price the cart from server catalogs. Client unitPrice is ignored."""
    if not isinstance(items, list) or not items:
        raise ValueError("Your cart is empty")
    total = 0
    priced = []
    if any(str(item.get("type") or item.get("kind") or "").lower() == "gift_card" for item in items) and len(items) != 1:
        raise ValueError("Purchase gift cards separately from other items.")
    for item in items:
        kind = str(item.get("type") or item.get("kind") or "product").lower()
        if kind == "gift_card":
            line, row = gift_cards.price(item)
        elif kind == "refill":
            line, row = _price_refill(item)
        elif kind == "class":
            line, row = _price_class(item)
        else:
            line, row = _price_product(item)
        total += line
        priced.append(row)
    if total < 50 or total > 250000:
        raise ValueError("Cart total is outside the allowed range")
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

    try:
        raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString", "")
    except Exception as error:
        raise RuntimeError("Stripe test key is not configured yet") from error
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
            "Idempotency-Key": str(values.get("metadata[candle_garden_order_id]") or uuid.uuid4()),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        data = json.loads(error.read().decode("utf-8"))
        message = ((data.get("error") or {}).get("message")) or "Stripe could not create the payment."
        raise RuntimeError(message) from error


def _stripe_get(path):
    key = _stripe_secret()
    if not key:
        raise RuntimeError("Stripe test key is not configured yet")
    if key.startswith("sk_live_") and os.environ.get("STRIPE_LIVE_ENABLED") != "true":
        raise RuntimeError("Live Stripe charges are disabled for this app")
    request = urllib.request.Request(
        f"https://api.stripe.com/v1/{path}",
        method="GET",
        headers={
            "Authorization": "Basic " + base64.b64encode(f"{key}:".encode()).decode(),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        data = json.loads(error.read().decode("utf-8"))
        message = ((data.get("error") or {}).get("message")) or "Stripe could not verify the payment."
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


def _looks_like_email(value):
    text = str(value or "").strip()
    if "@" not in text or " " in text:
        return False
    local, _, domain = text.partition("@")
    return bool(local) and "." in domain


def _phone_digits(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def guest_contact_error(claims, body):
    """A checkout without an account must include a real email and a phone number."""
    claims = claims or {}
    if claims.get("sub") or claims.get("cognito:username"):
        return None
    body = body if isinstance(body, dict) else {}
    shipping = body.get("shipping") if isinstance(body.get("shipping"), dict) else {}
    email = str(body.get("email") or shipping.get("email") or "").strip()
    phone = _phone_digits(shipping.get("phone") or body.get("phone"))
    if not _looks_like_email(email):
        return "A guest checkout needs an email address."
    gift_only = isinstance(body.get("items"), list) and len(body["items"]) == 1 and str(body["items"][0].get("type") or body["items"][0].get("kind") or "").lower() == "gift_card"
    if len(phone) < 10 and not gift_only:
        return "A guest checkout needs a phone number."
    return None


ORDERS_TABLE = os.environ.get("ORDERS_TABLE", "candle-garden-orders")
_orders_table = None


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _ddb_value(value):
    if value is None:
        return None
    if isinstance(value, float):
        return Decimal(str(round(value, 4)))
    if isinstance(value, dict):
        return {key: _ddb_value(val) for key, val in value.items() if val is not None}
    if isinstance(value, list):
        return [_ddb_value(item) for item in value]
    return value


def _orders():
    global _orders_table
    if _orders_table is None:
        import boto3
        _orders_table = boto3.resource("dynamodb").Table(ORDERS_TABLE)
    return _orders_table


def _public_label(row):
    if not isinstance(row, dict):
        return row
    return {
        "key": row.get("key"),
        "title": row.get("title") or LEG_TITLES.get(row.get("key"), row.get("key")),
        "status": row.get("status") or "queued",
        "trackingNumber": row.get("trackingNumber"),
        "trackingUrl": row.get("trackingUrl"),
        "labelUrl": row.get("labelUrl"),
        "service": row.get("service"),
        "format": row.get("format") or "png",
        "purchasedAt": row.get("purchasedAt"),
        "error": row.get("error"),
        "imageBase64": row.get("imageBase64") or row.get("labelGifBase64"),
    }


def _stub_labels(method):
    plan = label_purchase_plan(method)
    return [
        {
            "key": key,
            "title": LEG_TITLES.get(key, key),
            "status": "queued",
        }
        for key in plan["legs"]
    ]


def _planned_labels_for_items(items):
    labels = []
    seen = set()
    for item in items or []:
        if str(item.get("type") or "").lower() != "refill":
            continue
        method = item.get("shippingMethod") or item.get("shipping_method") or "ship_own"
        for row in _stub_labels(method):
            if row["key"] in seen:
                continue
            seen.add(row["key"])
            labels.append(row)
    return labels


def _order_items_for_store(priced, amount):
    rows = []
    for row in priced or []:
        qty = int(row.get("quantity") or 1)
        unit = int(row.get("unitCents") or 0)
        stored = {
            "type": row.get("type"),
            "productId": row.get("productId"),
            "name": row.get("name"),
            "size": row.get("size"),
            "quantity": qty,
            "price": round(unit / 100.0, 2),
            "shippingCents": row.get("shippingCents"),
            "waxCents": row.get("waxCents"),
            "ounces": row.get("ounces"),
            "boxKey": row.get("boxKey"),
            "shippingMethod": row.get("shippingMethod"),
            "speed": row.get("speed"),
            "vesselCount": row.get("vesselCount"),
            "variantId": row.get("variantId"),
            "scents": row.get("scents"),
            "delivery": row.get("delivery"),
            "vesselScents": row.get("vesselScents"),
        }
        rows.append({key: value for key, value in stored.items() if value is not None})
    return rows


def _put_checkout_order(order):
    _orders().put_item(Item=_ddb_value(order))


def _get_order(order_id):
    if not order_id:
        return None
    resp = _orders().get_item(Key={"id": order_id}, ConsistentRead=True)
    return resp.get("Item")


def _find_order_by_payment_intent(payment_intent_id):
    if not payment_intent_id:
        return None
    resp = _orders().scan(
        FilterExpression="payment_intent_id = :pi",
        ExpressionAttributeValues={":pi": payment_intent_id},
        Limit=1,
    )
    items = resp.get("Items") or []
    return items[0] if items else None


def _update_order(order_id, patch):
    names = {"#updated": "updated_at"}
    values = {":updated": _now_iso()}
    sets = ["#updated = :updated"]
    for key, value in patch.items():
        if value is None:
            continue
        names[f"#{key}"] = key
        values[f":{key}"] = _ddb_value(value)
        sets.append(f"#{key} = :{key}")
    conditions = {}
    if patch.get("status") in ("paid", "paid_test", "processing", "shipped", "completed", "ready_for_pickup", "refilling", "refill_returning", "refill_received", "ready_for_fulfillment"):
        values[":refunded"] = "refunded"
        values[":partial"] = "partially_refunded"
        conditions["ConditionExpression"] = "attribute_exists(id) AND #status <> :refunded AND #status <> :partial"
    _orders().update_item(
        Key={"id": order_id},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        **conditions,
    )


def _customer_party(dest):
    dest = dest if isinstance(dest, dict) else {}
    return {
        "name": dest.get("name") or "Customer",
        "attention": dest.get("name") or "Customer",
        "phone": dest.get("phone") or "9043167608",
        "email": dest.get("email") or "jordan@thecandlegarden.co",
        "address": dest.get("address"),
        "address2": dest.get("address2") or dest.get("street2") or "",
        "city": dest.get("city") or "City",
        "state": str(dest.get("state") or "FL")[:2].upper(),
        "zip": "".join(ch for ch in str(dest.get("zip")) if ch.isdigit())[:5],
        "country": "US",
        "residential": True,
    }


def _quote_for_item(item, dest):
    ounces = float(item.get("ounces") or 0)
    return quote_refill_shipping(
        ounces,
        quantity=int(item.get("quantity") or 1),
        box_key=item.get("boxKey") or item.get("box_key"),
        dest_zip=(dest or {}).get("zip") or item.get("destZip"),
        shipping_method=item.get("shippingMethod") or item.get("shipping_method") or "ship_own",
        vessel_count=item.get("vesselCount") or item.get("vessel_count"),
        dest=dest,
        speed=item.get("speed"),
    )


def _print_one_leg(quote, dest, key):
    box = quote["box"]
    weights = quote["weights"]
    customer = _customer_party(dest)
    origin = dict(ORIGIN_PARTY)
    speed = quote.get("speed")
    if key == "kit_out":
        printed = _print_label(
            origin, customer, weights["kit_billed"], 12, 10, 2,
            description="Candle Garden packing kit", speed=speed,
        )
    elif key == "empties_in":
        printed = _print_label(
            customer, origin, weights["empties_billed"], box["l"], box["w"], box["h"],
            description="Empty vessels to Candle Garden", return_label=True, speed=speed,
        )
    elif key == "refills_out":
        printed = _print_label(
            origin, customer, weights["refills_billed"], box["l"], box["w"], box["h"],
            description="Candle Garden refill return", speed=speed,
        )
    else:
        raise ValueError(f"Unknown shipping leg: {key}")
    return {
        "key": key,
        "title": LEG_TITLES.get(key, key),
        "status": "purchased",
        "trackingNumber": printed.get("trackingNumber"),
        "trackingUrl": printed.get("trackingUrl"),
        "labelUrl": printed.get("labelUrl"),
        "service": printed.get("service"),
        "format": printed.get("format") or "png",
        "imageBase64": printed.get("imageBase64") or printed.get("labelGifBase64"),
        "purchasedAt": _now_iso(),
    }


def _merge_labels(existing, updates):
    by_key = {}
    for row in existing or []:
        if isinstance(row, dict) and row.get("key"):
            by_key[row["key"]] = dict(row)
    for row in updates or []:
        if isinstance(row, dict) and row.get("key"):
            by_key[row["key"]] = {**by_key.get(row["key"], {}), **row}
    return list(by_key.values())


def _purchase_item_legs(item, dest, keys, existing):
    purchased = []
    errors = []
    already = {
        row.get("key"): row
        for row in (existing or [])
        if isinstance(row, dict) and row.get("status") == "purchased"
    }
    quote = None
    for key in keys:
        if key in already and already[key].get("labelUrl"):
            purchased.append(already[key])
            continue
        try:
            if quote is None:
                quote = _quote_for_item(item, dest)
            purchased.append(_print_one_leg(quote, dest, key))
        except Exception as error:
            errors.append({"key": key, "title": LEG_TITLES.get(key, key), "status": "queued", "error": str(error)})
    return purchased, errors


def _apply_paid_labels(order):
    dest = order.get("shipping") if isinstance(order.get("shipping"), dict) else {}
    existing = list(order.get("shipping_labels") or [])
    purchased = []
    queued = list(existing)
    for item in order.get("items") or []:
        if str(item.get("type") or "").lower() != "refill":
            continue
        method = item.get("shippingMethod") or item.get("shipping_method") or "ship_own"
        if method in ("store_dropoff", "local_dropoff"):
            continue
        plan = label_purchase_plan(method)
        stubs = _stub_labels(method)
        queued = _merge_labels(queued, stubs)
        now_rows, errors = _purchase_item_legs(item, dest, plan["legs"], queued)
        purchased.extend(now_rows)
        queued = _merge_labels(queued, now_rows + errors)
    tracking = [row.get("trackingNumber") for row in queued if row.get("trackingNumber")]
    has_purchased = any(row.get("status") == "purchased" for row in queued)
    has_queued = any(row.get("status") != "purchased" for row in queued)
    if has_purchased and has_queued:
        label_status = "partial"
    elif has_purchased:
        label_status = "created"
    else:
        label_status = "queued"
    return queued, tracking, label_status, purchased


def _create_payment_sheet(event):
    try:
        claims = _claims(event)
    except ValueError as error:
        return _response(401, {"error": str(error)})
    headers = event.get("headers") or {}
    body = _body(event)
    if body.get("giftCardCode") or any(str(item.get("type") or item.get("kind") or "").lower() == "gift_card" for item in (body.get("items") or []) if isinstance(item, dict)):
        return _gift_checkout(event, body)
    shipping_form = body.get("shipping") if isinstance(body.get("shipping"), dict) else {}
    email = body.get("email") or shipping_form.get("email") or claims.get("email")
    name = body.get("name") or shipping_form.get("name") or claims.get("name")
    try:
        customer_id = claims.get("sub") or f"guest:{_guest_device(event)}"
        contact_error = guest_contact_error(claims, body)
        if contact_error:
            return _response(400, {"error": contact_error})
        checkout_zip = body.get("destZip") or body.get("zip")
        dest = body.get("shipping") or body.get("dest")
        items = body.get("items")
        if (checkout_zip or dest) and isinstance(items, list):
            z = _zip_or_none((dest or {}).get("zip") if isinstance(dest, dict) else None) or _zip_or_none(checkout_zip)
            patched = []
            for item in items:
                row = dict(item)
                kind = str(row.get("type") or row.get("kind") or "").lower()
                if kind == "refill" and z:
                    row["destZip"] = z
                    if isinstance(dest, dict):
                        row["dest"] = dest
                patched.append(row)
            items = patched
        amount, priced = amount_from_catalog(items)
        order_id = str(uuid.uuid4())
        payload = {
            "amount": amount,
            "currency": "usd",
            "automatic_payment_methods[enabled]": "true",
            "metadata[candle_garden_mode]": "test",
            "metadata[candle_garden_order_id]": order_id,
            "metadata[customer_id]": str(customer_id)[:80],
            "metadata[guest]": "false" if claims.get("sub") else "true",
            "metadata[item_count]": str(len(priced)),
        }
        if _looks_like_email(email):
            payload["receipt_email"] = str(email).strip()[:254]
            payload["metadata[email]"] = str(email).strip()[:80]
        if name:
            payload["metadata[name]"] = str(name).strip()[:80]
        intent = _stripe_request("payment_intents", payload)
        shipping = dest if isinstance(dest, dict) else {}
        if checkout_zip and not shipping.get("zip"):
            shipping = {**shipping, "zip": checkout_zip}
        now = _now_iso()
        stored_items = _order_items_for_store(priced, amount)
        order = {
            "id": order_id,
            "customer_id": customer_id,
            "customer_email": email or "",
            "total_amount": round(amount / 100.0, 2),
            "status": "payment_pending",
            "source": "mobile",
            "payment_provider": "stripe",
            "payment_intent_id": intent["id"],
            "items": stored_items,
            "shipping": shipping,
            "label_status": "queued" if _planned_labels_for_items(stored_items) else "none",
            "shipping_labels": _planned_labels_for_items(stored_items),
            "created_at": now,
            "updated_at": now,
        }
        if packing_acknowledged(body):
            order["packing_acknowledged"] = True
        try:
            _put_checkout_order(order)
        except Exception as error:
            print(f"checkout order persist failed: {error}")
        return _response(200, {
            "paymentIntentClientSecret": intent["client_secret"],
            "paymentIntentId": intent["id"],
            "orderId": order_id,
            "amount": amount,
            "currency": "usd",
            "items": priced,
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not start Stripe checkout"})


def _verify_webhook(event):
    secret = _service_secret("STRIPE_WEBHOOK_SECRET")
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


def _shipping_quote(event):
    body = _body(event)
    try:
        ounces = float(body.get("ounces") or 0)
        if ounces <= 0:
            raise ValueError("Ounces are required")
        dest = body.get("dest") or body.get("shipping") or {}
        dest_zip = body.get("destZip") or dest.get("zip")
        quotes = []
        methods = body.get("methods") or list(METHODS.keys())
        for method in methods:
            q = quote_refill_shipping(
                ounces,
                quantity=int(body.get("quantity") or 1),
                box_key=body.get("boxKey"),
                dest_zip=dest_zip,
                shipping_method=method,
                vessel_count=body.get("vesselCount"),
                dest=dest,
                speed=body.get("speed"),
            )
            quotes.append(q)
        return _response(200, {
            "ok": True,
            "shippoConfigured": shippo_client.configured(),
            "upsConfigured": ups_client.configured(),
            "upsEnabled": ups_client.enabled(),
            "quotes": quotes,
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not quote shipping"})


def _print_label(ship_from, ship_to, weight_lb, length, width, height, description, return_label=False, speed="standard"):
    expedited = normalize_speed(speed) == "expedited"
    if expedited and ups_client.configured():
        return ups_client.create_label(
            ship_from, ship_to, weight_lb, length, width, height,
            description=description, return_label=return_label,
            service_code=ups_client.SERVICE_2ND_DAY_AIR,
        )
    if shippo_client.configured():
        try:
            return shippo_client.create_label(
                ship_from, ship_to, weight_lb, length, width, height,
                description=description, return_label=return_label,
                prefer_2nd_day=expedited,
            )
        except Exception:
            if not expedited:
                raise
            return shippo_client.create_label(
                ship_from, ship_to, weight_lb, length, width, height,
                description=description, return_label=return_label,
            )
    if ups_client.configured():
        return ups_client.create_ground_saver_label(
            ship_from, ship_to, weight_lb, length, width, height,
            description=description, return_label=return_label,
        )
    raise RuntimeError("Shipping labels are not configured yet")


def _refill_labels(event):
    """Retry labels for an owned, provider-verified checkout.

    Destination, items and allowed legs always come from the saved checkout.
    Client-supplied leg selections cannot change the saved checkout's plan.
    """
    try:
        body = _body(event)
        order = _get_order(str(body.get("orderId") or body.get("order_id") or ""))
        if order and order.get("gift_checkout"):
            authorized = _authorized_checkout(body)
            if authorized["id"] != order["id"]:
                raise ValueError("Order not found")
        else:
            _authorize_order(event, order)
        response = _finalize_payment({**event, "body": {
            "paymentIntentId": order.get("payment_intent_id"),
            "orderId": order["id"], "checkoutToken": body.get("checkoutToken"),
        }})
        return response
    except ValueError as error:
        return _response(400, {"error": str(error)})



ORDER_FROM_EMAIL = os.environ.get(
    "ORDER_FROM_EMAIL",
    "The Candle Garden <hello@tripleibusinesssolutions.com>",
)
ORDER_REPLY_TO = os.environ.get("ORDER_REPLY_TO", "jordan@thecandlegarden.co")
STUDIO_ADDRESS = "363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL 32233"


def _order_email(order):
    email = str((order or {}).get("customer_email") or "").strip()
    if _looks_like_email(email):
        return email
    shipping = (order or {}).get("shipping") if isinstance((order or {}).get("shipping"), dict) else {}
    email = str(shipping.get("email") or "").strip()
    return email if _looks_like_email(email) else ""


def _confirmation_text(order):
    order_id = str(order.get("id") or "")
    short = order_id.split("-")[0] or order_id[:8] or "your order"
    name = ""
    shipping = order.get("shipping") if isinstance(order.get("shipping"), dict) else {}
    if shipping.get("name"):
        name = str(shipping.get("name")).strip()
    lines = [
        f"Hello{(' ' + name) if name else ''},",
        "",
        f"The Candle Garden received order #{short}.",
        "",
    ]
    for item in order.get("items") or []:
        qty = int(item.get("quantity") or 1)
        title = item.get("name") or "Candle Garden item"
        size = f" ({item.get('size')})" if item.get("size") else ""
        lines.append(f"- {qty} x {title}{size}")
        scent_bits = []
        for scent_row in item.get("scents") or []:
            if not isinstance(scent_row, dict):
                continue
            scent_name = str(scent_row.get("scent") or "").strip()
            if not scent_name:
                continue
            vessel = str(scent_row.get("vessel") or "").strip()
            scent_bits.append(f"{vessel}: {scent_name}" if vessel else scent_name)
        if scent_bits:
            lines.append("  " + "; ".join(scent_bits))
    total = order.get("total_amount")
    if total is not None:
        lines.append("")
        lines.append(f"Total: ${float(total):.2f}")
    class_items = [
        item for item in (order.get("items") or [])
        if str(item.get("type") or "").lower() == "class"
    ]
    methods = {
        str(item.get("shippingMethod") or item.get("shipping_method") or "")
        for item in (order.get("items") or [])
        if str(item.get("type") or "").lower() == "refill"
    }
    lines.append("")
    if class_items:
        when = ", ".join(str(item.get("size") or item.get("name") or "your class") for item in class_items)
        if order.get("seat_reserved"):
            lines.append(f"Your seat is reserved for {when} at {STUDIO_ADDRESS}.")
        else:
            lines.append(f"We received your class payment for {when}. The shop will confirm the seat.")
        lines.append("")
    if methods and methods <= {"store_dropoff", "local_dropoff"}:
        lines.append(
            f"Drop the empty vessels off at {STUDIO_ADDRESS}. "
            "Pick the refill up when it is ready. There is no shipping charge."
        )
    elif "prepaid_labels" in methods:
        lines.append(
            "Your prepaid empties label is on this order in the app. Print it and tape it to the box. "
            "We ship the refilled candles back to you."
        )
    elif "kit_roundtrip" in methods:
        lines.append(
            "We will mail a packing kit with a prepaid label for the empty vessels. "
            "Send them back in that kit, and we will ship the refilled candles to you."
        )
    elif "ship_own" in methods:
        lines.append(
            f"Mail the empty vessels to {STUDIO_ADDRESS}. Postage for that trip is yours. "
            "We ship the refilled candles back to you. You do not need a label from us for the empties."
        )
    elif any(item.get("type") == "gift_card" for item in order.get("items", [])):
        lines.append("Your gift card will arrive in a separate email at the delivery address you selected. That email contains the redemption code for Candle Garden app checkout.")
    else:
        lines.append("We will follow up when your order is ready.")
    lines.extend(["", "Thank you,", "The Candle Garden"])
    return f"The Candle Garden received order #{short}", "\n".join(lines)


def _ses():
    if os.environ.get("EMAIL_PROVIDER") == "resend":
        from resend_mail import ResendMailClient
        return ResendMailClient(_service_secret("RESEND_API_KEY"))
    import boto3
    return boto3.client("ses", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _class_seat_lines(order):
    lines = []
    classes = None
    for item in order.get("items") or []:
        if str(item.get("type") or "").lower() != "class":
            continue
        variant = str(item.get("variantId") or "").strip()
        if not variant:
            if classes is None:
                try:
                    classes = _load_classes()
                except Exception:
                    classes = {}
            course = (classes or {}).get(str(item.get("productId") or "")) or {}
            variant = str(course.get("variantId") or "").strip()
        if not variant:
            raise RuntimeError("That class is missing its Squarespace seat")
        price = item.get("price")
        if price is None and item.get("unitCents") is not None:
            price = int(item.get("unitCents")) / 100.0
        lines.append({
            "variantId": variant,
            "quantity": int(item.get("quantity") or 1),
            "unitPrice": float(price or 0),
            "title": str(item.get("size") or item.get("name") or "Candle class")[:200],
        })
    return lines


def _book_class_seats(order):
    """Reserve paid class seats on the Squarespace class products."""
    if order.get("squarespace_order_id") or order.get("squarespace_inventory_adjusted"):
        return {"ok": True, "already": True}
    lines = _class_seat_lines(order)
    if not lines:
        return None
    url = str(os.environ.get("CLASS_SEAT_URL") or "").strip()
    secret = _service_secret("CLASS_SEAT_SECRET").strip()
    if not url or not secret:
        raise RuntimeError("Class seat booking is not configured")
    shipping = order.get("shipping") if isinstance(order.get("shipping"), dict) else {}
    payload = json.dumps({
        "orderId": order.get("id"),
        "email": _order_email(order),
        "name": shipping.get("name") or "",
        "items": lines,
    }).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "CandleGardenPayments/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            message = json.loads(raw).get("error") or "Squarespace did not reserve the seat"
        except json.JSONDecodeError:
            message = "Squarespace did not reserve the seat"
        raise RuntimeError(str(message)[:300]) from error
    if not isinstance(data, dict) or not data.get("ok"):
        message = data.get("error") if isinstance(data, dict) else "Squarespace did not reserve the seat"
        raise RuntimeError(str(message)[:300])
    return data


def _send_order_confirmation(order):
    if order.get("confirmation_sent_at"):
        return False
    email = _order_email(order)
    if not email:
        return False
    subject, text = _confirmation_text(order)
    provider_options = {"IdempotencyKey": "order-receipt:" + str(order["id"])} if os.environ.get("EMAIL_PROVIDER") == "resend" else {}
    _ses().send_email(
        Source=ORDER_FROM_EMAIL,
        Destination={"ToAddresses": [email]},
        ReplyToAddresses=[ORDER_REPLY_TO],
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text, "Charset": "UTF-8"}},
        },
        **provider_options,
    )
    return True


def _gift_checkout(event, body):
    order_id = None
    reserved = False
    stripe_started = False
    try:
        claims = _claims(event)
        contact_error = guest_contact_error(claims, body)
        if contact_error:
            raise ValueError(contact_error)
        key = _stripe_secret() or ""
        if not key:
            raise RuntimeError("Stripe checkout is not configured.")
        live = key.startswith("sk_live_")
        if live and os.environ.get("STRIPE_LIVE_ENABLED") != "true":
            raise RuntimeError("Live Stripe charges are disabled for this app")
        items = body.get("items")
        dest = body.get("shipping") or {}
        if not isinstance(dest, dict):
            raise ValueError("Delivery details are invalid.")
        if isinstance(items, list):
            items = [{**item, **({"dest": dest, "destZip": dest.get("zip") or body.get("destZip")}
                if item.get("type") == "refill" else {})} for item in items]
        is_gift_purchase = isinstance(items, list) and len(items) == 1 and str(items[0].get("type") or items[0].get("kind") or "").lower() == "gift_card"
        if body.get("giftCardCode") and body.get("promoCode"):
            raise ValueError("Use a gift card or a promotion code for this order. Remove the promotion code to use your gift card.")
        quote_url = os.environ.get("PRICE_QUOTE_URL")
        if quote_url and not is_gift_purchase:
            request = urllib.request.Request(quote_url, data=json.dumps({"items": items, "shipping": dest}).encode(),
                method="POST", headers={"Content-Type": "application/json", "Accept": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    quote = json.loads(response.read().decode())
            except urllib.error.HTTPError as error:
                detail = json.loads(error.read().decode()).get("error") or "Could not verify prices."
                raise ValueError(detail) from error
            total, priced = quote["total"], quote["items"]
            if not isinstance(total, int) or total < 50 or total > 250000 or not isinstance(priced, list) or not priced:
                raise ValueError("Could not verify current prices.")
        else:
            total, priced = amount_from_catalog(items)
        is_purchase = priced[0]["type"] == "gift_card"
        if is_purchase and os.environ.get("GIFT_CARD_EMAIL_READY") == "false":
            raise RuntimeError("Gift card email delivery is being set up. Please try again later.")
        if quote_url and any(item.get("type") == "class" for item in priced):
            if not os.environ.get("CLASS_SEAT_URL") or not _service_secret("CLASS_SEAT_SECRET"):
                raise RuntimeError("Class gift card checkout is not configured yet. Please contact the shop.")
        if is_purchase and body.get("giftCardCode"):
            raise ValueError("Gift cards cannot be used to buy another gift card.")
        if not is_purchase and any(item.get("type") not in ("product", "class", "refill") for item in priced):
            raise ValueError("Gift cards cover candles, refills, and classes.")
        # Subscription renewals require a separate payment flow.
        if not is_purchase and any(item.get("type") == "product" and _load_catalog().get(item["productId"], {}).get("isSubscribable") for item in priced):
            raise ValueError("Gift cards cannot be used for subscriptions.")
        order_id = str(uuid.uuid4())
        token = secrets.token_urlsafe(32)
        headers = event.get("headers") or {}
        device = _guest_device(event) if not claims.get("sub") else ""
        email = str(body.get("email") or dest.get("email") or claims.get("email") or "").strip()
        if not _looks_like_email(email):
            raise ValueError("Enter your email for the receipt.")
        order = {"id": order_id, "customer_id": claims.get("sub") or f"guest:{device}",
            "customer_email": email, "total_amount": total / 100, "status": "payment_pending",
            "source": "mobile", "payment_provider": "stripe", "items": _order_items_for_store(priced, total),
            "shipping": dest, "live": live, "gift_checkout": True,
            "fulfillment_method": body.get("fulfillment") or "shipping",
            "checkout_token_hash": hashlib.sha256(token.encode()).hexdigest(),
            "created_at": _now_iso(), "updated_at": _now_iso()}
        if packing_acknowledged(body):
            order["packing_acknowledged"] = True
        _put_checkout_order(order)  # Fail closed: never charge an untracked gift order.
        gift_amount = 0
        if body.get("giftCardCode"):
            gift_amount = gift_cards.reserve(body["giftCardCode"], order_id, total, live)
            reserved = True
        amount = total - gift_amount
        _update_order(order_id, {"gift_card_cents": gift_amount, "stripe_amount_cents": amount})
        if not amount:
            _update_order(order_id, {"payment_provider": "gift_card"})
            return _response(200, {"orderId": order_id, "checkoutToken": token,
                "giftCardCents": gift_amount, "amount": 0, "totalCents": total, "giftCardOnly": True})
        payload = {"amount": amount, "currency": "usd", "automatic_payment_methods[enabled]": "true",
            "metadata[candle_garden_order_id]": order_id, "metadata[candle_garden_mode]": "live" if live else "test",
            "metadata[customer_id]": order["customer_id"], "receipt_email": email}
        _update_order(order_id, {"stripe_create_payload": payload})
        stripe_started = True
        intent = _stripe_request("payment_intents", payload)
        _update_order(order_id, {"payment_intent_id": intent["id"]})
        return _response(200, {"orderId": order_id, "checkoutToken": token, "amount": amount,
            "totalCents": total, "giftCardCents": gift_amount, "paymentIntentId": intent["id"],
            "paymentIntentClientSecret": intent["client_secret"]})
    except (ValueError, RuntimeError) as error:
        rejected_before_creation = isinstance(error.__cause__, urllib.error.HTTPError) and 400 <= error.__cause__.code < 500 and error.__cause__.code != 429
        if reserved and (not stripe_started or rejected_before_creation):
            gift_cards.release(order_id)
            _update_order(order_id, {"status": "cancelled"})
        return _response(400, {"error": str(error)})
    except Exception:
        if reserved and not stripe_started:
            gift_cards.release(order_id)
        return _response(502, {"error": "Checkout could not start. Any pending gift balance will be restored after payment is cancelled."})


def _authorized_checkout(body):
    order = _get_order(str(body.get("orderId") or ""))
    supplied = hashlib.sha256(str(body.get("checkoutToken") or "").encode()).hexdigest()
    if not order or not order.get("checkout_token_hash") or not hmac.compare_digest(supplied, order["checkout_token_hash"]):
        raise ValueError("This checkout reference is invalid.")
    return order


def _gift_action(event, action):
    try:
        body = _body(event)
        if action == "balance":
            live = str(_stripe_secret() or "").startswith("sk_live_")
            card = gift_cards.get(body.get("code"), live)
            return _response(200, {"balanceCents": int(card["balanceCents"])})
        order = _authorized_checkout(body)
        if action == "cancel":
            if order.get("payment_provider") == "gift_card":
                # Commit/release is conditional; simultaneous completion cannot overspend.
                if not gift_cards.release(order["id"]):
                    return _finalize_payment({}, trusted_order=order)
            else:
                pi = order.get("payment_intent_id")
                if not pi and order.get("stripe_create_payload"):
                    pi = _stripe_request("payment_intents", order["stripe_create_payload"])["id"]
                    _update_order(order["id"], {"payment_intent_id": pi})
                if pi:
                    intent = _stripe_get(f"payment_intents/{pi}")
                    if intent.get("status") == "succeeded":
                        return _finalize_payment({"body": {"paymentIntentId": pi}}, trusted_payment=True)
                    if intent.get("status") != "canceled":
                        intent = _stripe_request(f"payment_intents/{pi}/cancel", {})
                    if intent.get("status") != "canceled":
                        raise RuntimeError("Payment cancellation is still pending.")
                gift_cards.release(order["id"])
            _update_order(order["id"], {"status": "cancelled"})
            return _response(200, {"cancelled": True})
        row = gift_cards.table().get_item(Key={"id": "delivery:" + order["id"]}, ConsistentRead=True).get("Item")
        return _response(200, {"emailSent": bool(row and row.get("state") == "sent"),
            "paid": order.get("status") in ("paid", "paid_test"), "orderId": order["id"]})
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not update gift card checkout. Please try again."})


def _finalize_payment(event, trusted_order=None, trusted_payment=False):
    try:
        body = _body(event)
        payment_intent_id = str(body.get("paymentIntentId") or "").strip()
        if trusted_order or (body.get("orderId") and not payment_intent_id):
            order = trusted_order or _authorized_checkout(body)
            if order.get("payment_provider") != "gift_card" or int(order.get("stripe_amount_cents", -1)) != 0:
                raise ValueError("A Stripe payment reference is required")
            reservation = gift_cards.reservation(order["id"])
            if not reservation or reservation["state"] not in ("reserved", "redeemed"):
                raise ValueError("This gift card payment was cancelled.")
            intent = {"status": "succeeded", "livemode": bool(order.get("live")),
                "metadata": {"candle_garden_order_id": order["id"]}}
        else:
            if not payment_intent_id.startswith("pi_"):
                raise ValueError("A Stripe payment reference is required")
            intent = _stripe_get(f"payment_intents/{urllib.parse.quote(payment_intent_id)}")
        paid = intent.get("status") == "succeeded"
        status = "paid" if paid and intent.get("livemode") else "paid_test" if paid else f"payment_{intent.get('status')}"
        metadata = intent.get("metadata") or {}
        order = _get_order(metadata.get("candle_garden_order_id")) or _find_order_by_payment_intent(payment_intent_id)
        if not order or order.get("status") == "deleted":
            raise ValueError("Order not found")
        if payment_intent_id:
            _verify_order_payment(order, intent)
        if not trusted_payment and not trusted_order and not order.get("gift_checkout"):
            _authorize_order(event, order)
        if paid and order and order.get("status") in ("processing", "shipped", "completed", "ready_for_pickup", "refilling", "refill_returning", "refill_received", "ready_for_fulfillment"):
            status = order["status"]
        if order and order.get("gift_checkout") and not paid:
            status = "payment_pending"
            if intent.get("status") == "canceled":
                gift_cards.release(order["id"])
                status = "cancelled"
        customer_labels = []
        shipping_labels = []
        if order:
            if order.get("gift_checkout") and payment_intent_id and not trusted_payment:
                authorized = _authorized_checkout(body)
                if authorized["id"] != order["id"]:
                    raise ValueError("Payment does not match this checkout.")
            if paid and order.get("gift_checkout"):
                if order.get("gift_refund_review") or order.get("status") in ("refunded", "partially_refunded"):
                    raise ValueError("This payment has been refunded. Contact the shop for assistance.")
                if order.get("payment_intent_id") and order["payment_intent_id"] != payment_intent_id:
                    raise ValueError("Payment does not match this order.")
                if payment_intent_id and (int(intent.get("amount_received", -1)) != int(order["stripe_amount_cents"]) or intent.get("currency") != "usd" or bool(intent.get("livemode")) != bool(order.get("live"))):
                    raise ValueError("Payment amount does not match this order.")
                if order.get("gift_card_cents"):
                    gift_cards.commit(order["id"])
                delivery = gift_cards.issue(order, bool(intent.get("livemode")), ORDERS_TABLE)
                try:
                    gift_cards.deliver(delivery, _ses(), ORDER_FROM_EMAIL, ORDER_REPLY_TO)
                except Exception:
                    print("Gift card delivery queued", order["id"])
            patch = {"status": status}
            if paid:
                try:
                    shipping_labels, tracking, label_status, purchased = _apply_paid_labels(order)
                    patch["shipping_labels"] = [{k: v for k, v in row.items() if k != "imageBase64"} for row in shipping_labels]
                    patch["label_status"] = label_status
                    if tracking:
                        patch["tracking_numbers"] = tracking
                    customer_labels = [
                        _public_label(row) for row in purchased if row.get("key") == "empties_in"
                    ]
                except Exception as error:
                    print(f"paid label purchase failed: {error}")
                    patch["label_status"] = "queued"
                try:
                    booking = _book_class_seats(order)
                    if booking and booking.get("squarespaceOrderId"):
                        patch["squarespace_order_id"] = str(booking["squarespaceOrderId"])
                    if booking and booking.get("squarespaceOrderNumber"):
                        patch["squarespace_order_number"] = str(booking["squarespaceOrderNumber"])
                    if booking and booking.get("inventoryAdjusted"):
                        patch["squarespace_inventory_adjusted"] = True
                except Exception as error:
                    print(f"class seat booking failed: {error}")
                    patch["squarespace_booking_error"] = str(error)[:300]
            try:
                _update_order(order["id"], patch)
            except Exception as error:
                print(f"finalize order update failed: {error}")
                if order.get("gift_checkout"):
                    raise
            if paid and not order.get("confirmation_sent_at"):
                try:
                    notice = dict(order)
                    notice["status"] = status
                    notice["seat_reserved"] = bool(
                        patch.get("squarespace_order_id") or patch.get("squarespace_inventory_adjusted")
                    )
                    if _send_order_confirmation(notice):
                        _update_order(order["id"], {"confirmation_sent_at": _now_iso()})
                except Exception as error:
                    print(f"order confirmation email failed: {error}")
        return _response(200, {
            "ok": True,
            "paid": paid,
            "status": status,
            "paymentIntentId": payment_intent_id,
            "orderId": order.get("id") if order else metadata.get("candle_garden_order_id"),
            "labels": customer_labels,
            "shipping_labels": [_public_label({**row, "imageBase64": None}) for row in shipping_labels],
            "giftCardCents": int((order or {}).get("gift_card_cents", 0)),
            "giftEmailSent": bool(order and order.get("gift_checkout") and 'delivery' in locals() and delivery and delivery.get("state") == "sent"),
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not verify payment"})


def handler(event, context):
    if event.get("source") == "aws.events":
        # Recover abandoned checkouts only after confirming/cancelling their Stripe intent.
        result = _orders().scan(FilterExpression="gift_checkout = :yes AND #s = :pending",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":yes": True, ":pending": "payment_pending"})
        while True:
            for order in result.get("Items", []):
                try:
                    pi = order.get("payment_intent_id")
                    created = datetime.fromisoformat(order["created_at"].replace("Z", "+00:00")).timestamp()
                    if pi:
                        intent = _stripe_get(f"payment_intents/{pi}")
                        if intent.get("status") == "succeeded":
                            response = _finalize_payment({"body": {"paymentIntentId": pi}}, trusted_payment=True)
                            if response["statusCode"] != 200:
                                print("Gift checkout recovery will retry", order["id"])
                            continue
                    if time.time() - created < 3600:
                        continue
                    if not pi and order.get("stripe_create_payload"):
                        pi = _stripe_request("payment_intents", order["stripe_create_payload"])["id"]
                        _update_order(order["id"], {"payment_intent_id": pi})
                    if pi:
                        intent = _stripe_get(f"payment_intents/{pi}")
                        if intent.get("status") == "succeeded":
                            _finalize_payment({"body": {"paymentIntentId": pi}}, trusted_payment=True)
                            continue
                        if intent.get("status") != "canceled":
                            intent = _stripe_request(f"payment_intents/{pi}/cancel", {})
                        if intent.get("status") != "canceled":
                            continue
                    if not gift_cards.release(order["id"]):
                        _finalize_payment({}, trusted_order=order)
                        continue
                    _update_order(order["id"], {"status": "cancelled"})
                except Exception:
                    print("Gift checkout recovery will retry", order["id"])
            cursor = result.get("LastEvaluatedKey")
            if not cursor:
                break
            result = _orders().scan(FilterExpression="gift_checkout = :yes AND #s = :pending",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":yes": True, ":pending": "payment_pending"}, ExclusiveStartKey=cursor)
        gift_cards.retry_deliveries(_ses(), ORDER_FROM_EMAIL, ORDER_REPLY_TO)
        return {"ok": True}
    method = (event.get("httpMethod") or "").upper()
    path = (event.get("path") or event.get("resource") or "").rstrip("/")
    if method == "OPTIONS":
        return _response(200, {"ok": True})
    if method == "POST" and path.endswith("/payments/payment-sheet"):
        return _create_payment_sheet(event)
    if method == "POST" and path.endswith("/payments/finalize"):
        return _finalize_payment(event)
    for action in ("balance", "cancel", "status"):
        if method == "POST" and path.endswith("/payments/gift-card-" + action):
            return _gift_action(event, action)
    if method == "POST" and path.endswith("/payments/shipping-quote"):
        return _shipping_quote(event)
    if method == "POST" and path.endswith("/payments/refill-labels"):
        return _refill_labels(event)
    if method == "POST" and path.endswith("/payments/webhook"):
        if not _service_secret("STRIPE_WEBHOOK_SECRET"):
            return _response(503, {"error": "Stripe webhook is not configured"})
        if not _verify_webhook(event):
            return _response(400, {"error": "Invalid Stripe signature"})
        payload = _body(event)
        kind = payload.get("type")
        intent = (payload.get("data") or {}).get("object") or {}
        if kind == "payment_intent.succeeded":
            return _finalize_payment({"body": {"paymentIntentId": intent.get("id")}}, trusted_payment=True)
        if kind == "payment_intent.canceled":
            order_id = (intent.get("metadata") or {}).get("candle_garden_order_id")
            if order_id:
                try:
                    order = _get_order(order_id)
                    if order and order.get("gift_checkout"):
                        gift_cards.release(order_id)
                        _update_order(order_id, {"status": "cancelled"})
                except Exception:
                    return _response(502, {"error": "Cancellation will retry"})
        if kind == "charge.refunded":
            try:
                pi = _stripe_get(f"payment_intents/{intent['payment_intent']}")
                order = _get_order((pi.get("metadata") or {}).get("candle_garden_order_id"))
                if order and order.get("gift_checkout"):
                    # Retrieve current charge to defeat out-of-order refund events.
                    charge = _stripe_get(f"charges/{intent['id']}")
                    if any(item.get("type") == "gift_card" for item in order.get("items", [])):
                        gift_cards.disable_refunded_purchase(order["id"])
                        _update_order(order["id"], {"gift_refund_review": True})
                    else:
                        gift_cards.refund_redemption(order["id"], int(charge.get("amount_refunded", 0)), int(round(float(order["total_amount"]) * 100)))
            except Exception:
                return _response(502, {"error": "Gift card refund will retry"})
        return _response(200, {"received": True})
    return _response(404, {"error": "Not found"})
