"""Catalog pricing for Stripe test checkout — client amounts are ignored."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAY_DIR = ROOT / "lambda_functions" / "payment_processor"
MODULE_PATH = PAY_DIR / "index.py"
if str(PAY_DIR) not in sys.path:
    sys.path.insert(0, str(PAY_DIR))


def load_processor():
    spec = importlib.util.spec_from_file_location("payment_processor", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._catalog_cache = None
    module._catalog_cache_expires = 0
    module._classes_cache = None
    module._classes_cache_expires = 0
    return module


def test_live_class_catalog_is_used(monkeypatch):
    processor = load_processor()
    monkeypatch.setenv("CLASS_CATALOG_URL", "https://example.test/classes")

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"classes":[{"id":"live-class","title":"Live Class","price":50,"available":4,"soldOut":false}]}'

    monkeypatch.setattr(processor.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    amount, rows = processor.amount_from_catalog(
        [{"type": "class", "productId": "live-class", "quantity": 2}]
    )
    assert amount == 10000
    assert rows[0]["name"] == "Live Class"


def test_live_product_variant_price_and_inventory_are_used(monkeypatch):
    processor = load_processor()
    monkeypatch.setenv("PRODUCT_CATALOG_URL", "https://example.test/products")

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"products":[{"id":"live-product","name":"Live Candle","soldOut":false,"variants":[{"id":"small","size":"10oz","price":35,"soldOut":false},{"id":"large","size":"18oz","price":42,"soldOut":true}]}]}'

    monkeypatch.setattr(processor.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())
    amount, rows = processor.amount_from_catalog(
        [{"productId": "live-product", "variantId": "small", "size": "10oz", "quantity": 2}]
    )
    assert amount == 7000
    assert rows[0]["variantId"] == "small"
    try:
        processor.amount_from_catalog(
            [{"productId": "live-product", "variantId": "large", "size": "18oz", "quantity": 1}]
        )
        assert False, "expected sold-out variant to fail"
    except ValueError as error:
        assert "sold out" in str(error).lower()


def test_amount_uses_catalog_not_client_price():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"productId": "65faf809b85f1d19a61c8374", "quantity": 2, "size": "10oz", "unitPrice": 1}]
    )
    assert priced[0]["unitCents"] == 3500
    assert total == 7000


def test_18oz_uses_price_max():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1, "size": "18oz"}]
    )
    assert priced[0]["unitCents"] == 4200
    assert total == 4200


def test_unknown_product_is_rejected():
    processor = load_processor()
    try:
        processor.amount_from_catalog([{"productId": "not-a-product", "quantity": 1}])
        assert False, "expected unknown product to fail"
    except ValueError as error:
        assert "catalog" in str(error).lower()


def test_refill_uses_server_wax_and_ups():
    processor = load_processor()
    from refill_shipping import quote_refill_shipping

    expected = quote_refill_shipping(
        10, quantity=1, box_key="ups_medium", dest_zip="32250", shipping_method="ship_own"
    )
    total, priced = processor.amount_from_catalog(
        [
            {
                "type": "refill",
                "ounces": 10,
                "quantity": 1,
                "boxKey": "ups_medium",
                "destZip": "32250",
                "shippingMethod": "ship_own",
                "unitPrice": 1,
            }
        ]
    )
    assert priced[0]["type"] == "refill"
    assert priced[0]["shippingMethod"] == "ship_own"
    assert total == expected["total_cents"]
    assert total > expected["wax_cents"]


def test_refill_requires_zip():
    processor = load_processor()
    try:
        processor.amount_from_catalog(
            [{"type": "refill", "ounces": 10, "quantity": 1, "boxKey": "ups_medium"}]
        )
        assert False, "expected missing ZIP to fail"
    except ValueError as error:
        assert "zip" in str(error).lower()


def test_refill_kit_costs_more_than_ship_own():
    from refill_shipping import quote_refill_shipping

    own = quote_refill_shipping(12, dest_zip="10001", shipping_method="ship_own")
    labels = quote_refill_shipping(12, dest_zip="10001", shipping_method="prepaid_labels")
    kit = quote_refill_shipping(12, dest_zip="10001", shipping_method="kit_roundtrip")
    assert own["shipping_cents"] < labels["shipping_cents"] < kit["shipping_cents"]


def test_refill_empties_in_is_commercial():
    from refill_shipping import quote_refill_shipping

    labels = quote_refill_shipping(12, dest_zip="32250", shipping_method="prepaid_labels")
    inn = next(leg for leg in labels["legs"] if leg["key"] == "empties_in")
    out = next(leg for leg in labels["legs"] if leg["key"] == "refills_out")
    assert inn["billedLb"] == out["billedLb"]
    assert out["cents"] - inn["cents"] == 465


def test_refill_rejects_alaska():
    from refill_shipping import quote_refill_shipping

    try:
        quote_refill_shipping(12, dest_zip="99501", shipping_method="ship_own")
        assert False, "expected Alaska ZIP to fail"
    except ValueError as error:
        assert "48" in str(error)


def test_class_uses_catalog_price():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"type": "class", "productId": "6a46945e1aa91b68f13fad5d", "quantity": 1, "unitPrice": 1}]
    )
    assert priced[0]["type"] == "class"
    assert priced[0]["unitCents"] == 6000
    assert total == 6000


def test_mixed_cart_sums_all_kinds():
    processor = load_processor()
    from refill_shipping import quote_refill_shipping

    refill = quote_refill_shipping(
        10, quantity=1, box_key="ups_small", dest_zip="32250", shipping_method="ship_own"
    )
    total, priced = processor.amount_from_catalog(
        [
            {"productId": "65faf809b85f1d19a61c8374", "quantity": 1, "size": "10oz"},
            {"type": "refill", "ounces": 10, "quantity": 1, "boxKey": "ups_small", "destZip": "32250", "shippingMethod": "ship_own"},
            {"type": "class", "productId": "6a46945e1aa91b68f13fad5d", "quantity": 1},
        ]
    )
    assert [row["type"] for row in priced] == ["product", "refill", "class"]
    assert total == 3500 + refill["total_cents"] + 6000


def test_empty_cart_is_rejected():
    processor = load_processor()
    try:
        processor.amount_from_catalog([])
        assert False, "expected empty cart to fail"
    except ValueError as error:
        assert "empty" in str(error).lower()


def test_guest_payment_sheet_does_not_require_signin():
    import json

    processor = load_processor()
    captured = {}

    def fake_stripe(_path, values):
        captured["values"] = values
        return {"client_secret": "pi_test_secret", "id": "pi_test"}

    processor._stripe_request = fake_stripe
    result = processor.handler(
        {
            "httpMethod": "POST",
            "path": "/prod/payments/payment-sheet",
            "headers": {"X-Device-Id": "dev_abc123"},
            "body": json.dumps(
                {
                    "items": [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1, "size": "10oz"}],
                    "email": "guest@example.com",
                    "name": "Guest Shopper",
                }
            ),
        },
        None,
    )
    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["paymentIntentClientSecret"] == "pi_test_secret"
    assert captured["values"]["metadata[guest]"] == "true"
    assert captured["values"]["metadata[customer_id]"].startswith("guest:dev_abc123")
    assert captured["values"]["receipt_email"] == "guest@example.com"


def test_signed_in_jwt_is_still_tagged_without_api_authorizer():
    import base64
    import json

    processor = load_processor()
    captured = {}

    def fake_stripe(_path, values):
        captured["values"] = values
        return {"client_secret": "pi_test_secret", "id": "pi_test"}

    processor._stripe_request = fake_stripe
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "user-123"}).encode()).decode().rstrip("=")
    token = f"header.{payload}.sig"
    result = processor.handler(
        {
            "httpMethod": "POST",
            "path": "/prod/payments/payment-sheet",
            "headers": {"Authorization": f"Bearer {token}", "X-Device-Id": "dev_abc123"},
            "body": json.dumps({"items": [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1, "size": "10oz"}]}),
        },
        None,
    )
    assert result["statusCode"] == 200
    assert captured["values"]["metadata[guest]"] == "false"
    assert captured["values"]["metadata[customer_id]"] == "user-123"
