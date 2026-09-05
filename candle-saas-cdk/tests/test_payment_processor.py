"""Catalog pricing for Stripe test checkout — client amounts are ignored."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "lambda_functions" / "payment_processor" / "index.py"


def load_processor():
    spec = importlib.util.spec_from_file_location("payment_processor", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._catalog_cache = None
    module._classes_cache = None
    return module


def test_amount_uses_catalog_not_client_price():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"productId": "65faf809b85f1d19a61c8374", "quantity": 2, "unitPrice": 1}]
    )
    assert priced[0]["unitCents"] == 3400
    assert total == 6800


def test_18oz_uses_price_max():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1, "size": "18oz"}]
    )
    assert priced[0]["unitCents"] == 3900
    assert total == 3900


def test_unknown_product_is_rejected():
    processor = load_processor()
    try:
        processor.amount_from_catalog([{"productId": "not-a-product", "quantity": 1}])
        assert False, "expected unknown product to fail"
    except ValueError as error:
        assert "catalog" in str(error).lower()


def test_refill_uses_server_wax_and_box():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"type": "refill", "ounces": 10, "quantity": 1, "boxKey": "frb_medium_top", "unitPrice": 1}]
    )
    assert priced[0]["type"] == "refill"
    assert total == 1500 + 2480


def test_class_uses_catalog_price():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"type": "class", "productId": "6a3c45403645b97e2eae9160", "quantity": 1, "unitPrice": 1}]
    )
    assert priced[0]["type"] == "class"
    assert priced[0]["unitCents"] == 6000
    assert total == 6000


def test_mixed_cart_sums_all_kinds():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [
            {"productId": "65faf809b85f1d19a61c8374", "quantity": 1},
            {"type": "refill", "ounces": 10, "quantity": 1, "boxKey": "frb_small"},
            {"type": "class", "productId": "6a3c45403645b97e2eae9160", "quantity": 1},
        ]
    )
    assert [row["type"] for row in priced] == ["product", "refill", "class"]
    assert total == 3400 + (1500 + 1365) + 6000


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
                    "items": [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1}],
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
            "body": json.dumps({"items": [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1}]}),
        },
        None,
    )
    assert result["statusCode"] == 200
    assert captured["values"]["metadata[guest]"] == "false"
    assert captured["values"]["metadata[customer_id]"] == "user-123"
