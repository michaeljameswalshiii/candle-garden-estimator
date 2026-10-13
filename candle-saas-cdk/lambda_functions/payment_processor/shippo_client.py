"""Shippo rates + labels for Candle Garden refill shipping.

Token is server-side only: SHIPPO_API_TOKEN, or SHIPPO_SECRET_ARN JSON/raw.
UPS via Shippo is skipped until the portal account is connected
(set SHIPPO_ALLOW_UPS=true later). USPS works in test mode.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("SHIPPO_BASE_URL", "https://api.goshippo.com").rstrip("/")
ORIGIN = {
    "name": "The Candle Garden",
    "attention": "Refill Desk",
    "phone": "9043167608",
    "email": "jordan@thecandlegarden.co",
    "address": "363 Atlantic Boulevard, Suite 8",
    "address2": "",
    "city": "Atlantic Beach",
    "state": "FL",
    "zip": "32233",
    "country": "US",
}

SKIP_PROVIDERS = {
    "canada post",
    "dhl express",
    "dhl ecommerce",
    "dhl ecommerce",
}
# Shippo's UPS US/Canada master accounts need portal action before live use.
SKIP_UPS_UNLESS_ALLOWED = True

_secret_cache = {"value": None, "expires": 0}
_rate_cache = {}


def _truthy(value):
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


def _secret_token():
    if _secret_cache["value"] and _secret_cache["expires"] > time.time():
        return _secret_cache["value"]
    arn = os.environ.get("SHIPPO_SECRET_ARN") or os.environ.get("SHIPPO_SECRET_NAME")
    token = os.environ.get("SHIPPO_API_TOKEN")
    if not token and arn:
        try:
            import boto3

            raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString") or ""
            if raw.startswith("{"):
                parsed = json.loads(raw)
                token = (
                    parsed.get("SHIPPO_API_TOKEN")
                    or parsed.get("token")
                    or parsed.get("apiToken")
                    or parsed.get("api_token")
                )
            else:
                token = raw.strip()
        except Exception as error:
            print(f"shippo secret load failed: {error}")
            token = None
    token = (token or "").strip() or None
    _secret_cache.update({"value": token, "expires": time.time() + 300})
    return token


def configured():
    return bool(_secret_token())


def _headers():
    token = _secret_token()
    if not token:
        raise RuntimeError("Shippo is not configured")
    return {
        "Authorization": f"ShippoToken {token}",
        "Content-Type": "application/json",
        "SHIPPO-API-VERSION": "2018-02-08",
    }


def _request(method, path, body=None, timeout=25):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers=_headers(),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Shippo {error.code}: {detail[:800]}") from error


def _addr(party):
    street1 = party.get("address") or party.get("street1") or "1 Main St"
    return {
        "name": party.get("name") or "Recipient",
        "company": party.get("company") or "",
        "street1": street1,
        "street2": party.get("address2") or party.get("street2") or "",
        "city": party.get("city") or "",
        "state": str(party.get("state") or "")[:2].upper(),
        "zip": "".join(ch for ch in str(party.get("zip") or "") if ch.isdigit())[:5],
        "country": party.get("country") or "US",
        "phone": "".join(ch for ch in str(party.get("phone") or "") if ch.isdigit())[:15],
        "email": party.get("email") or "jordan@thecandlegarden.co",
        "is_residential": bool(party.get("residential")),
    }


def _allow_ups():
    return _truthy(os.environ.get("SHIPPO_ALLOW_UPS"))


def pick_rate(rates, prefer_2nd_day=False):
    """Lowest usable rate. USPS first; UPS only when SHIPPO_ALLOW_UPS is set."""
    usable = []
    for row in rates or []:
        provider = str(row.get("provider") or "")
        amount = row.get("amount")
        try:
            cents = int(round(float(amount) * 100))
        except (TypeError, ValueError):
            continue
        if cents <= 0 or not row.get("object_id"):
            continue
        key = provider.lower()
        if key in SKIP_PROVIDERS:
            continue
        if SKIP_UPS_UNLESS_ALLOWED and key.startswith("ups") and not _allow_ups() and not prefer_2nd_day:
            continue
        service = ((row.get("servicelevel") or {}).get("name")) or provider
        token = ((row.get("servicelevel") or {}).get("token")) or ""
        usable.append(
            {
                "object_id": row["object_id"],
                "cents": cents,
                "provider": provider,
                "service": service,
                "token": token,
                "usps": key == "usps",
            }
        )
    if not usable:
        raise RuntimeError("Shippo returned no usable rates")
    if prefer_2nd_day:
        air = [
            row
            for row in usable
            if "2nd" in (row["service"] or "").lower()
            or "2nd_day" in (row["token"] or "").lower()
            or (row["token"] or "") in ("ups_2nd_day_air", "ups_second_day_air")
        ]
        if not air:
            raise RuntimeError("Shippo returned no 2nd Day Air rate")
        air.sort(key=lambda row: row["cents"])
        return air[0]
    preferred = [row for row in usable if row["usps"]] or usable
    preferred.sort(key=lambda row: (row["cents"], 0 if row["usps"] else 1))
    return preferred[0]


def _cache_key(ship_from, ship_to, weight_lb, length_in, width_in, height_in, is_return, prefer_2nd_day=False):
    return (
        _addr(ship_from)["zip"],
        _addr(ship_to)["zip"],
        int(weight_lb),
        int(length_in),
        int(width_in),
        int(height_in),
        bool(is_return),
        bool(_addr(ship_to).get("street1")),
        bool(prefer_2nd_day),
    )


def lowest_rate(ship_from, ship_to, weight_lb, length_in, width_in, height_in, is_return=False, prefer_2nd_day=False):
    key = _cache_key(ship_from, ship_to, weight_lb, length_in, width_in, height_in, is_return, prefer_2nd_day)
    cached = _rate_cache.get(key)
    if cached:
        return cached
    extra = {}
    if is_return:
        extra["is_return"] = True
    token = _secret_token() or ""
    if token.startswith("shippo_test_"):
        extra["bypass_address_validation"] = True
    payload = {
        "address_from": _addr(ship_from),
        "address_to": _addr(ship_to),
        "parcels": [
            {
                "length": str(max(1, int(round(length_in)))),
                "width": str(max(1, int(round(width_in)))),
                "height": str(max(1, int(round(height_in)))),
                "distance_unit": "in",
                "weight": str(max(1, int(weight_lb))),
                "mass_unit": "lb",
            }
        ],
        "async": False,
        "extra": extra,
    }
    shipment = _request("POST", "/shipments/", payload)
    rate = pick_rate(shipment.get("rates"), prefer_2nd_day=prefer_2nd_day)
    rate["shipment_id"] = shipment.get("object_id")
    _rate_cache[key] = rate
    return rate


def rate_cents(ship_from, ship_to, weight_lb, length_in, width_in, height_in, is_return=False):
    return lowest_rate(ship_from, ship_to, weight_lb, length_in, width_in, height_in, is_return)["cents"]


def create_label(
    ship_from,
    ship_to,
    weight_lb,
    length_in,
    width_in,
    height_in,
    description="Candle Garden refill",
    return_label=False,
    prefer_2nd_day=False,
):
    rate = lowest_rate(
        ship_from, ship_to, weight_lb, length_in, width_in, height_in,
        is_return=return_label, prefer_2nd_day=prefer_2nd_day,
    )
    transaction = _request(
        "POST",
        "/transactions/",
        {
            "rate": rate["object_id"],
            "async": False,
            "label_file_type": "PNG",
            "metadata": description[:100],
        },
    )
    if transaction.get("status") not in (None, "SUCCESS", "QUEUED"):
        messages = transaction.get("messages") or []
        detail = messages[0].get("text") if messages else transaction.get("status")
        raise RuntimeError(f"Shippo could not purchase a label: {detail}")
    tracking = transaction.get("tracking_number")
    if not tracking:
        raise RuntimeError("Shippo did not return a tracking number")
    label_url = transaction.get("label_url") or ""
    image_b64 = ""
    image_format = "png"
    if label_url:
        try:
            with urllib.request.urlopen(label_url, timeout=20) as resp:
                raw = resp.read()
                ctype = (resp.headers.get("Content-Type") or "").lower()
            import base64

            image_b64 = base64.b64encode(raw).decode("ascii")
            if "pdf" in ctype or label_url.lower().endswith(".pdf"):
                image_format = "pdf"
        except Exception:
            image_b64 = ""
    return {
        "trackingNumber": tracking,
        "trackingUrl": transaction.get("tracking_url_provider") or "",
        "labelUrl": label_url,
        "labelGifBase64": image_b64,
        "imageBase64": image_b64,
        "format": image_format,
        "service": f"{rate['provider']} {rate['service']}".strip(),
        "provider": rate["provider"],
        "rateCents": rate["cents"],
        "test": bool(transaction.get("test")),
    }
