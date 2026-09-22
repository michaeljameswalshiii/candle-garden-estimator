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

from refill_shipping import quote_refill_shipping, METHODS
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
    try:
        quote = quote_refill_shipping(
            ounces,
            quantity=qty,
            box_key=box_key,
            dest_zip=dest_zip,
            shipping_method=method,
            vessel_count=item.get("vesselCount") or item.get("vessel_count") or qty,
            dest=item.get("dest") or item.get("shipping"),
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
        payload = {
            "amount": amount,
            "currency": "usd",
            "automatic_payment_methods[enabled]": "true",
            "metadata[candle_garden_mode]": "test",
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
            )
            quotes.append(q)
        return _response(200, {
            "ok": True,
            "upsConfigured": ups_client.configured(),
            "quotes": quotes,
        })
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not quote UPS shipping"})


def _refill_labels(event):
    if not ups_client.configured():
        return _response(503, {"error": "UPS Shipping API is not configured yet"})
    body = _body(event)
    try:
        dest = body.get("dest") or body.get("shipping")
        if not isinstance(dest, dict) or not dest.get("zip") or not dest.get("address"):
            raise ValueError("A full ship-to address is required to print labels")
        ounces = float(body.get("ounces") or 0)
        quote = quote_refill_shipping(
            ounces,
            quantity=int(body.get("quantity") or 1),
            box_key=body.get("boxKey"),
            dest_zip=dest.get("zip"),
            shipping_method=body.get("shippingMethod") or "ship_own",
            vessel_count=body.get("vesselCount"),
            dest=dest,
        )
        method = quote["method"]
        if method == "ship_own":
            return _response(200, {
                "ok": True,
                "labels": [],
                "note": "Ship on your own does not include prepaid labels.",
            })
        box = quote["box"]
        weights = quote["weights"]
        customer = {
            "name": dest.get("name") or "Customer",
            "attention": dest.get("name") or "Customer",
            "phone": dest.get("phone") or "9043167608",
            "address": dest.get("address"),
            "city": dest.get("city") or "City",
            "state": str(dest.get("state") or "FL")[:2].upper(),
            "zip": "".join(ch for ch in str(dest.get("zip")) if ch.isdigit())[:5],
            "country": "US",
            "residential": True,
        }
        origin = dict(ups_client.ORIGIN)
        labels = []
        if method == "kit_roundtrip":
            labels.append(
                {
                    "key": "kit_out",
                    **ups_client.create_ground_saver_label(
                        origin,
                        customer,
                        weights["kit_billed"],
                        12,
                        10,
                        2,
                        description="Candle Garden packing kit",
                    ),
                }
            )
        if method in ("kit_roundtrip", "prepaid_labels"):
            labels.append(
                {
                    "key": "empties_in",
                    **ups_client.create_ground_saver_label(
                        customer,
                        origin,
                        weights["empties_billed"],
                        box["l"],
                        box["w"],
                        box["h"],
                        description="Empty vessels to Candle Garden",
                        return_label=True,
                    ),
                }
            )
        labels.append(
            {
                "key": "refills_out",
                **ups_client.create_ground_saver_label(
                    origin,
                    customer,
                    weights["refills_billed"],
                    box["l"],
                    box["w"],
                    box["h"],
                    description="Candle Garden refill return",
                ),
            }
        )
        return _response(200, {"ok": True, "method": method, "labels": labels})
    except (ValueError, RuntimeError) as error:
        return _response(400, {"error": str(error)})
    except Exception:
        return _response(502, {"error": "Could not create UPS labels"})


def _finalize_payment(event):
    try:
        body = _body(event)
        payment_intent_id = str(body.get("paymentIntentId") or "").strip()
        if not payment_intent_id.startswith("pi_"):
            raise ValueError("A Stripe payment reference is required")
        intent = _stripe_get(f"payment_intents/{urllib.parse.quote(payment_intent_id)}")
        paid = intent.get("status") == "succeeded"
        status = "paid" if paid and intent.get("livemode") else "paid_test" if paid else f"payment_{intent.get('status')}"
        return _response(200, {
            "ok": True,
            "paid": paid,
            "status": status,
            "paymentIntentId": payment_intent_id,
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
