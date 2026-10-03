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
    if isinstance(claims, dict) and claims.get("sub"):
        return claims
    headers = event.get("headers") or {}
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = token.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            data = json.loads(base64.urlsafe_b64decode(payload.encode()).decode("utf-8"))
            if isinstance(data, dict) and data.get("sub"):
                return data
        except (ValueError, IndexError, json.JSONDecodeError, UnicodeDecodeError):
            pass
    return claims if isinstance(claims, dict) else {}


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
    return quote["total_cents"], {
        "type": "refill",
        "productId": "refill",
        "name": f"Candle refill · {ounces:g} oz",
        "size": size,
        "quantity": qty,
        "unitCents": unit,
        "ounces": ounces,
        "boxKey": quote["box_key"],
        "destZip": _zip_or_none(dest_zip),
        "shippingMethod": quote["method"],
        "speed": quote.get("speed") or speed,
        "vesselCount": int(item.get("vesselCount") or item.get("vessel_count") or qty),
    }


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
    }


def amount_from_catalog(items):
    """Price the cart from server catalogs. Client unitPrice is ignored."""
    if not isinstance(items, list) or not items:
        raise ValueError("Your cart is empty")
    total = 0
    priced = []
    for item in items:
        kind = str(item.get("type") or item.get("kind") or "product").lower()
        if kind == "refill":
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
            "ounces": row.get("ounces"),
            "boxKey": row.get("boxKey"),
            "shippingMethod": row.get("shippingMethod"),
            "speed": row.get("speed"),
            "vesselCount": row.get("vesselCount"),
        }
        rows.append({key: value for key, value in stored.items() if value is not None})
    return rows


def _put_checkout_order(order):
    _orders().put_item(Item=_ddb_value(order))


def _get_order(order_id):
    if not order_id:
        return None
    resp = _orders().get_item(Key={"id": order_id})
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
    _orders().update_item(
        Key={"id": order_id},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
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
        plan = label_purchase_plan(method)
        stubs = _stub_labels(method)
        queued = _merge_labels(queued, stubs)
        now_rows, errors = _purchase_item_legs(item, dest, plan["now"], queued)
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
    claims = _claims(event)
    headers = event.get("headers") or {}
    body = _body(event)
    device = headers.get("X-Device-Id") or headers.get("x-device-id") or "unknown"
    customer_id = claims.get("sub") or claims.get("cognito:username") or f"guest:{device}"
    email = body.get("email") or claims.get("email")
    name = body.get("name") or claims.get("name")
    try:
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
        try:
            _put_checkout_order({
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
            })
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
    if not shippo_client.configured() and not ups_client.configured():
        return _response(503, {"error": "Shipping labels are not configured yet"})
    body = _body(event)
    try:
        order = None
        order_id = str(body.get("orderId") or body.get("order_id") or "").strip()
        if order_id:
            order = _get_order(order_id)
        dest = body.get("dest") or body.get("shipping") or (order.get("shipping") if order else None)
        if not isinstance(dest, dict) or not dest.get("zip") or not dest.get("address"):
            raise ValueError("A full ship-to address is required to print labels")
        requested = body.get("legs") or body.get("leg")
        if isinstance(requested, str):
            requested = [requested]
        items = body.get("items") or (order.get("items") if order else None)
        if not items:
            items = [{
                "type": "refill",
                "ounces": body.get("ounces"),
                "quantity": body.get("quantity") or 1,
                "boxKey": body.get("boxKey"),
                "shippingMethod": body.get("shippingMethod") or "ship_own",
                "vesselCount": body.get("vesselCount"),
                "speed": body.get("speed"),
            }]
        existing = list((order or {}).get("shipping_labels") or [])
        printed = []
        for item in items:
            if str(item.get("type") or "refill").lower() != "refill":
                continue
            method = item.get("shippingMethod") or item.get("shipping_method") or "ship_own"
            plan = label_purchase_plan(method)
            keys = list(requested) if requested else plan["queued"]
            keys = [key for key in keys if key in plan["legs"]]
            rows, errors = _purchase_item_legs(item, dest, keys, existing)
            printed.extend(rows)
            existing = _merge_labels(existing, _stub_labels(method) + rows + errors)
        tracking = [row.get("trackingNumber") for row in existing if row.get("trackingNumber")]
        if order_id:
            has_purchased = any(row.get("status") == "purchased" for row in existing)
            has_queued = any(row.get("status") != "purchased" for row in existing)
            label_status = "partial" if has_purchased and has_queued else "created" if has_purchased else "queued"
            patch = {"shipping_labels": existing, "label_status": label_status, "tracking_numbers": tracking}
            if any(row.get("key") == "refills_out" and row.get("status") == "purchased" for row in existing):
                patch["status"] = "ready_for_fulfillment"
            _update_order(order_id, patch)
        return _response(200, {
            "ok": True,
            "labels": [_public_label(row) for row in printed],
            "shipping_labels": [_public_label({**row, "imageBase64": None}) for row in existing],
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not create shipping labels"})


def _finalize_payment(event):
    try:
        body = _body(event)
        payment_intent_id = str(body.get("paymentIntentId") or "").strip()
        if not payment_intent_id.startswith("pi_"):
            raise ValueError("A Stripe payment reference is required")
        intent = _stripe_get(f"payment_intents/{urllib.parse.quote(payment_intent_id)}")
        paid = intent.get("status") == "succeeded"
        status = "paid" if paid and intent.get("livemode") else "paid_test" if paid else f"payment_{intent.get('status')}"
        metadata = intent.get("metadata") or {}
        order = _get_order(metadata.get("candle_garden_order_id")) or _find_order_by_payment_intent(payment_intent_id)
        customer_labels = []
        shipping_labels = []
        if order:
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
                _update_order(order["id"], patch)
            except Exception as error:
                print(f"finalize order update failed: {error}")
        return _response(200, {
            "ok": True,
            "paid": paid,
            "status": status,
            "paymentIntentId": payment_intent_id,
            "orderId": order.get("id") if order else metadata.get("candle_garden_order_id"),
            "labels": customer_labels,
            "shipping_labels": [_public_label({**row, "imageBase64": None}) for row in shipping_labels],
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not verify payment"})


def handler(event, context):
    method = (event.get("httpMethod") or "").upper()
    path = (event.get("path") or event.get("resource") or "").rstrip("/")
    if method == "OPTIONS":
        return _response(200, {"ok": True})
    if method == "POST" and path.endswith("/payments/payment-sheet"):
        return _create_payment_sheet(event)
    if method == "POST" and path.endswith("/payments/finalize"):
        return _finalize_payment(event)
    if method == "POST" and path.endswith("/payments/shipping-quote"):
        return _shipping_quote(event)
    if method == "POST" and path.endswith("/payments/refill-labels"):
        return _refill_labels(event)
    if method == "POST" and path.endswith("/payments/webhook"):
        if not os.environ.get("STRIPE_WEBHOOK_SECRET"):
            return _response(503, {"error": "Stripe webhook is not configured"})
        if not _verify_webhook(event):
            return _response(400, {"error": "Invalid Stripe signature"})
        return _response(200, {"received": True})
    return _response(404, {"error": "Not found"})
