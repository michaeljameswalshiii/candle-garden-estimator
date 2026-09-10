"""UPS Rating + Shipping (OAuth REST). Ground Saver = service 93 (1 lb+).

Credentials from env or Secrets Manager JSON:
  clientId / client_id, clientSecret / client_secret, accountNumber / account_number
  optional: baseUrl (default production onlinetools.ups.com)
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

SERVICE_GROUND_SAVER = "93"
RETURN_PRINT_LABEL = "9"

ORIGIN = {
    "name": "The Candle Garden",
    "attention": "Refill Desk",
    "phone": "9043167608",
    "address": "363 Atlantic Boulevard, Suite 8",
    "city": "Atlantic Beach",
    "state": "FL",
    "zip": "32233",
    "country": "US",
}

_token_cache = {"value": None, "expires": 0}
_secret_cache = {"value": None, "expires": 0}


def _secret_dict():
    if _secret_cache["value"] and _secret_cache["expires"] > time.time():
        return _secret_cache["value"]
    arn = os.environ.get("UPS_SECRET_ARN") or os.environ.get("UPS_SECRET_NAME")
    data = {}
    if arn:
        try:
            import boto3

            raw = boto3.client("secretsmanager").get_secret_value(SecretId=arn).get("SecretString") or "{}"
            parsed = json.loads(raw) if raw.startswith("{") else {"clientSecret": raw}
            if isinstance(parsed, dict):
                data = parsed
        except Exception:
            data = {}
    merged = {
        "clientId": os.environ.get("UPS_CLIENT_ID") or data.get("clientId") or data.get("client_id"),
        "clientSecret": os.environ.get("UPS_CLIENT_SECRET") or data.get("clientSecret") or data.get("client_secret"),
        "accountNumber": os.environ.get("UPS_ACCOUNT_NUMBER") or data.get("accountNumber") or data.get("account_number"),
        "baseUrl": (
            os.environ.get("UPS_BASE_URL")
            or data.get("baseUrl")
            or "https://onlinetools.ups.com"
        ).rstrip("/"),
    }
    _secret_cache.update({"value": merged, "expires": time.time() + 300})
    return merged


def configured():
    creds = _secret_dict()
    return bool(creds.get("clientId") and creds.get("clientSecret") and creds.get("accountNumber"))


def _request(method, url, headers=None, body=None, timeout=20):
    data = None
    hdrs = dict(headers or {})
    if isinstance(body, dict):
        if hdrs.get("Content-Type") == "application/x-www-form-urlencoded":
            data = urllib.parse.urlencode(body).encode("utf-8")
        else:
            hdrs.setdefault("Content-Type", "application/json")
            data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"UPS {error.code}: {detail[:800]}") from error


def access_token():
    if _token_cache["value"] and _token_cache["expires"] > time.time() + 30:
        return _token_cache["value"]
    creds = _secret_dict()
    if not creds.get("clientId") or not creds.get("clientSecret"):
        raise RuntimeError("UPS API credentials are not configured")
    basic = base64.b64encode(f"{creds['clientId']}:{creds['clientSecret']}".encode()).decode()
    payload = _request(
        "POST",
        f"{creds['baseUrl']}/security/v1/oauth/token",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
            "x-merchant-id": creds.get("accountNumber") or "",
        },
        body={"grant_type": "client_credentials"},
    )
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("UPS did not return an access token")
    ttl = int(payload.get("expires_in") or 3300)
    _token_cache.update({"value": token, "expires": time.time() + max(60, ttl - 60)})
    return token


def _headers():
    return {
        "Authorization": f"Bearer {access_token()}",
        "Content-Type": "application/json",
        "transId": uuid.uuid4().hex[:32],
        "transactionSrc": "candle-garden-app",
    }


def _addr(party):
    block = {
        "AddressLine": [party["address"]] if isinstance(party.get("address"), str) else (party.get("address") or []),
        "City": party["city"],
        "StateProvinceCode": party["state"],
        "PostalCode": str(party["zip"]).replace(" ", "")[:10],
        "CountryCode": party.get("country") or "US",
    }
    if party.get("residential"):
        block["ResidentialAddressIndicator"] = "Y"
    out = {
        "Name": party.get("name") or "Recipient",
        "Address": block,
    }
    if party.get("attention"):
        out["AttentionName"] = party["attention"]
    if party.get("phone"):
        out["Phone"] = {"Number": "".join(ch for ch in str(party["phone"]) if ch.isdigit())[:15]}
    return out


def _package(weight_lb, length_in, width_in, height_in):
    return {
        "PackagingType": {"Code": "02", "Description": "Customer Supplied Package"},
        "Dimensions": {
            "UnitOfMeasurement": {"Code": "IN", "Description": "Inches"},
            "Length": str(max(1, int(round(length_in)))),
            "Width": str(max(1, int(round(width_in)))),
            "Height": str(max(1, int(round(height_in)))),
        },
        "PackageWeight": {
            "UnitOfMeasurement": {"Code": "LBS", "Description": "Pounds"},
            "Weight": f"{max(1, int(weight_lb)):.1f}",
        },
    }


def rate_ground_saver(ship_from, ship_to, weight_lb, length_in, width_in, height_in):
    """Return total USD cents for one Ground Saver package. Raises on UPS errors."""
    creds = _secret_dict()
    shipper = dict(ORIGIN)
    shipper["account"] = creds["accountNumber"]
    ship_from = ship_from or ORIGIN
    body = {
        "RateRequest": {
            "Request": {"TransactionReference": {"CustomerContext": "refill-rate"}},
            "Shipment": {
                "Shipper": {
                    **_addr(shipper),
                    "ShipperNumber": creds["accountNumber"],
                },
                "ShipFrom": _addr(ship_from),
                "ShipTo": _addr(ship_to),
                "PaymentDetails": {
                    "ShipmentCharge": [
                        {"Type": "01", "BillShipper": {"AccountNumber": creds["accountNumber"]}}
                    ]
                },
                "Service": {"Code": SERVICE_GROUND_SAVER, "Description": "UPS Ground Saver"},
                "NumOfPieces": "1",
                "Package": _package(weight_lb, length_in, width_in, height_in),
                "ShipmentRatingOptions": {"NegotiatedRatesIndicator": "Y"},
            },
        }
    }
    payload = _request(
        "POST",
        f"{creds['baseUrl']}/api/rating/v2409/Rate",
        headers=_headers(),
        body=body,
    )
    rated = ((payload.get("RateResponse") or {}).get("RatedShipment") or [{}])
    if isinstance(rated, list):
        rated = rated[0] if rated else {}
    negotiated = ((rated.get("NegotiatedRateCharges") or {}).get("TotalCharge") or {})
    published = rated.get("TotalCharges") or {}
    amount = negotiated.get("MonetaryValue") or published.get("MonetaryValue")
    if amount is None:
        raise RuntimeError("UPS Rating response had no total")
    return int(round(float(amount) * 100))


def create_ground_saver_label(
    ship_from,
    ship_to,
    weight_lb,
    length_in,
    width_in,
    height_in,
    description="Candle Garden refill",
    return_label=False,
):
    """Create a Ground Saver label billed to Candle Garden. Returns tracking + GIF base64."""
    creds = _secret_dict()
    shipper = dict(ORIGIN)
    shipment = {
        "Description": description[:50],
        "Shipper": {**_addr(shipper), "ShipperNumber": creds["accountNumber"]},
        "ShipFrom": _addr(ship_from),
        "ShipTo": _addr(ship_to),
        "PaymentInformation": {
            "ShipmentCharge": {
                "Type": "01",
                "BillShipper": {"AccountNumber": creds["accountNumber"]},
            }
        },
        "Service": {"Code": SERVICE_GROUND_SAVER, "Description": "UPS Ground Saver"},
        "Package": {
            "Description": description[:35],
            "Packaging": {"Code": "02", "Description": "Package"},
            "Dimensions": _package(weight_lb, length_in, width_in, height_in)["Dimensions"],
            "PackageWeight": _package(weight_lb, length_in, width_in, height_in)["PackageWeight"],
        },
    }
    if return_label:
        shipment["ReturnService"] = {"Code": RETURN_PRINT_LABEL}
    body = {
        "ShipmentRequest": {
            "Request": {"RequestOption": "nonvalidate"},
            "Shipment": shipment,
            "LabelSpecification": {
                "LabelImageFormat": {"Code": "GIF", "Description": "GIF"},
                "LabelStockSize": {"Height": "6", "Width": "4"},
            },
        }
    }
    payload = _request(
        "POST",
        f"{creds['baseUrl']}/api/shipments/v2409/ship",
        headers=_headers(),
        body=body,
        timeout=25,
    )
    results = ((payload.get("ShipmentResponse") or {}).get("ShipmentResults") or {})
    tracking = results.get("ShipmentIdentificationNumber")
    pkg = results.get("PackageResults") or {}
    if isinstance(pkg, list):
        pkg = pkg[0] if pkg else {}
    if not tracking:
        tracking = pkg.get("TrackingNumber")
    graphic = ((pkg.get("ShippingLabel") or {}).get("GraphicImage")) or ""
    if not tracking:
        raise RuntimeError("UPS Shipping response had no tracking number")
    return {
        "trackingNumber": tracking,
        "labelGifBase64": graphic,
        "service": "UPS Ground Saver",
    }
