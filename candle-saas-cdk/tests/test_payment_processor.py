"""Catalog pricing for Stripe test checkout — client amounts are ignored."""
import importlib.util
import sys
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def no_live_carriers(monkeypatch):
    monkeypatch.delenv("SHIPPO_API_TOKEN", raising=False)
    monkeypatch.delenv("SHIPPO_SECRET_ARN", raising=False)
    monkeypatch.delenv("UPS_ENABLED", raising=False)

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


def test_expedited_wax_and_postage_are_higher():
    from refill_shipping import quote_refill_shipping

    standard = quote_refill_shipping(12, dest_zip="32250", shipping_method="ship_own", speed="standard")
    expedited = quote_refill_shipping(12, dest_zip="32250", shipping_method="ship_own", speed="expedited")
    assert standard["wax_cents"] == 12 * 175
    assert expedited["wax_cents"] == 12 * 225
    assert expedited["shipping_cents"] > standard["shipping_cents"]
    assert expedited["speed"] == "expedited"


def test_refill_uses_server_wax_and_shipping():
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
    assert priced[0]["speed"] == "standard"


def test_refill_checkout_reads_speed():
    processor = load_processor()
    from refill_shipping import quote_refill_shipping

    expected = quote_refill_shipping(
        12, quantity=1, box_key="ups_medium", dest_zip="32250", shipping_method="ship_own", speed="expedited"
    )
    total, priced = processor.amount_from_catalog(
        [
            {
                "type": "refill",
                "ounces": 12,
                "quantity": 1,
                "boxKey": "ups_medium",
                "destZip": "32250",
                "shippingMethod": "ship_own",
                "speed": "expedited",
                "unitPrice": 1,
            }
        ]
    )
    assert priced[0]["speed"] == "expedited"
    assert total == expected["total_cents"]


def test_store_dropoff_is_wax_only_without_a_zip():
    from refill_shipping import label_purchase_plan, quote_refill_shipping

    quote = quote_refill_shipping(10, shipping_method="store_dropoff")
    own = quote_refill_shipping(10, dest_zip="32250", shipping_method="ship_own")
    assert quote["shipping_cents"] == 0
    assert quote["wax_cents"] == 1750
    assert quote["total_cents"] == 1750
    assert quote["legs"] == []
    assert quote["method_title"] == "Drop off in the store"
    assert quote["total_cents"] < own["total_cents"]
    assert label_purchase_plan("store_dropoff")["legs"] == []
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [{"type": "refill", "ounces": 10, "quantity": 1, "shippingMethod": "store_dropoff"}]
    )
    assert total == 1750
    assert priced[0]["shippingMethod"] == "store_dropoff"


def test_local_dropoff_quotes_as_store_dropoff():
    from refill_shipping import label_purchase_plan, quote_refill_shipping

    quote = quote_refill_shipping(10, shipping_method="local_dropoff")
    assert quote["method"] == "store_dropoff"
    assert quote["shipping_cents"] == 0
    assert quote["total_cents"] == 1750
    assert quote["legs"] == []
    plan = label_purchase_plan("local_dropoff")
    assert plan["method"] == "store_dropoff"
    assert plan["legs"] == []


def test_refill_scents_are_kept_and_still_optional():
    processor = load_processor()
    total, priced = processor.amount_from_catalog(
        [
            {
                "type": "refill",
                "ounces": 10,
                "quantity": 1,
                "shippingMethod": "store_dropoff",
                "scents": [
                    {"vessel": "Mug", "scent": "Juniper"},
                    {"vessel": "Jar", "scent": "x" * 200},
                    "Vanilla",
                    {"scent": ""},
                ],
            }
        ]
    )
    assert priced[0]["scents"][0] == {"vessel": "Mug", "scent": "Juniper"}
    assert priced[0]["scents"][1]["scent"] == "x" * 80
    assert priced[0]["scents"][2] == {"scent": "Vanilla"}
    assert len(priced[0]["scents"]) == 3
    stored = processor._order_items_for_store(priced, total)
    assert stored[0]["scents"][0]["vessel"] == "Mug"
    bare_total, bare = processor.amount_from_catalog(
        [{"type": "refill", "ounces": 10, "quantity": 1, "shippingMethod": "store_dropoff"}]
    )
    assert bare_total == 1750
    assert "scents" not in bare[0]
    assert processor.packing_acknowledged({}) is False
    assert processor.packing_acknowledged({"packingAcknowledged": True}) is True
    note = processor._confirmation_text(
        {
            "id": "abc",
            "items": [
                {
                    "type": "refill",
                    "name": "Candle refill",
                    "quantity": 1,
                    "shippingMethod": "store_dropoff",
                    "scents": [{"vessel": "Jar", "scent": "Vanilla"}],
                }
            ],
            "shipping": {},
        }
    )
    assert "Jar: Vanilla" in note[1]
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


def test_guest_payment_sheet_does_not_require_signin(monkeypatch):
    import json

    processor = load_processor()
    captured = {}

    def fake_stripe(_path, values):
        captured["values"] = values
        return {"client_secret": "pi_test_secret", "id": "pi_test"}

    processor._stripe_request = fake_stripe
    monkeypatch.setattr(processor, "_put_checkout_order", lambda order: None)
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
                    "shipping": {"phone": "9045551212"},
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
    missing = processor.handler(
        {
            "httpMethod": "POST",
            "path": "/prod/payments/payment-sheet",
            "headers": {"X-Device-Id": "dev_abc123"},
            "body": json.dumps({"items": [{"productId": "65faf809b85f1d19a61c8374", "quantity": 1}], "email": "guest@example.com"}),
        },
        None,
    )
    assert missing["statusCode"] == 400
    assert "phone" in json.loads(missing["body"])["error"]


def test_signed_in_jwt_is_still_tagged_without_api_authorizer(monkeypatch, signed_identity):
    import base64
    import json

    processor = load_processor()
    captured = {}

    def fake_stripe(_path, values):
        captured["values"] = values
        return {"client_secret": "pi_test_secret", "id": "pi_test"}

    processor._stripe_request = fake_stripe
    monkeypatch.setattr(processor, "_put_checkout_order", lambda order: None)
    token = signed_identity()
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


def test_guest_checkout_requires_email_and_phone():
    processor = load_processor()
    assert processor.guest_contact_error({}, {"email": "not-an-email", "shipping": {"phone": "9045551212"}}) == "A guest checkout needs an email address."
    assert processor.guest_contact_error({}, {"email": "guest@example.com", "shipping": {"phone": "555"}}) == "A guest checkout needs a phone number."
    assert processor.guest_contact_error({}, {"shipping": {"email": "guest@example.com", "phone": "(904) 555-1212"}}) is None
    assert processor.guest_contact_error({"sub": "user-1"}, {}) is None


def test_ship_own_confirmation_omits_return_tracking(monkeypatch):
    processor = load_processor()
    sent = {}

    class FakeSes:
        def send_email(self, **kwargs):
            sent.update(kwargs)

    monkeypatch.setattr(processor, "_ses", lambda: FakeSes())
    order = {
        "id": "92a1863d-0b19-42e6-b4a0-54423da04e54",
        "customer_email": "guest@example.com",
        "total_amount": 71.25,
        "items": [{
            "type": "refill",
            "name": "Candle refill",
            "quantity": 1,
            "shippingMethod": "ship_own",
            "size": "Ship on your own",
        }],
        "shipping_labels": [{"key": "refills_out", "trackingNumber": "9334620845500001895633"}],
    }
    assert processor._send_order_confirmation(order) is True
    body = sent["Message"]["Body"]["Text"]["Data"]
    assert "9334620845500001895633" not in body
    assert "Postage for that trip is yours" in body
    assert sent["Destination"]["ToAddresses"] == ["guest@example.com"]
    assert sent["Source"].startswith("The Candle Garden")


def test_confirmation_is_not_sent_twice(monkeypatch):
    processor = load_processor()
    monkeypatch.setattr(processor, "_ses", lambda: (_ for _ in ()).throw(AssertionError("should not send")))
    assert processor._send_order_confirmation({
        "customer_email": "guest@example.com",
        "confirmation_sent_at": "2026-10-12T00:00:00.000Z",
        "items": [],
    }) is False


def test_class_seat_request_reserves_the_variant(monkeypatch):
    import json

    processor = load_processor()
    captured = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"ok":true,"squarespaceOrderId":"sq-1","squarespaceOrderNumber":"44","inventoryAdjusted":false}'

    def fake_open(request, timeout=0):
        captured["body"] = json.loads(request.data.decode())
        captured["auth"] = request.headers.get("Authorization")
        return Response()

    monkeypatch.setenv("CLASS_SEAT_URL", "https://candle.test/api/mobile/class-seat")
    monkeypatch.setenv("CLASS_SEAT_SECRET", "seat-secret")
    monkeypatch.setattr(processor.urllib.request, "urlopen", fake_open)
    result = processor._book_class_seats({
        "id": "order-1",
        "customer_email": "guest@example.com",
        "shipping": {"name": "Ada Lovelace"},
        "items": [{
            "type": "class",
            "productId": "class-1",
            "variantId": "variant-9",
            "quantity": 1,
            "price": 60,
            "size": "Friday at 6PM",
        }],
    })
    assert result["squarespaceOrderId"] == "sq-1"
    assert captured["auth"] == "Bearer seat-secret"
    assert captured["body"]["email"] == "guest@example.com"
    assert captured["body"]["items"][0]["variantId"] == "variant-9"
    assert captured["body"]["items"][0]["unitPrice"] == 60


def test_class_without_a_variant_cannot_reserve_a_seat(monkeypatch):
    processor = load_processor()
    monkeypatch.delenv("CLASS_CATALOG_URL", raising=False)
    try:
        processor._class_seat_lines({"items": [{"type": "class", "productId": "missing-class", "quantity": 1}]})
        assert False, "expected a missing variant to fail"
    except RuntimeError as error:
        assert "Squarespace seat" in str(error)


def test_class_confirmation_says_the_seat_is_reserved():
    processor = load_processor()
    _subject, body = processor._confirmation_text({
        "id": "order-1",
        "total_amount": 60,
        "seat_reserved": True,
        "items": [{"type": "class", "name": "Candle Making Class", "size": "Friday, October 9 at 6PM", "quantity": 1}],
    })
    assert "Your seat is reserved for Friday, October 9 at 6PM" in body


def test_label_purchase_plan_splits_customer_and_staff_legs():
    from refill_shipping import label_purchase_plan

    prepaid = label_purchase_plan("prepaid_labels")
    assert prepaid["now"] == ["empties_in"]
    assert prepaid["queued"] == ["refills_out"]
    kit = label_purchase_plan("kit_roundtrip")
    assert kit["now"] == ["empties_in"]
    assert kit["queued"] == ["kit_out", "refills_out"]
    own = label_purchase_plan("ship_own")
    assert own["now"] == []
    assert own["queued"] == ["refills_out"]


def test_paid_prepaid_labels_save_every_leg(monkeypatch):
    processor = load_processor()
    printed = []

    def fake_print(quote, dest, key):
        printed.append(key)
        return {"key": key, "status": "purchased", "trackingNumber": f"trk-{key}", "labelUrl": f"https://labels.test/{key}.png"}

    monkeypatch.setattr(processor, "_print_one_leg", fake_print)
    monkeypatch.setattr(processor, "_quote_for_item", lambda item, dest: {"method": "prepaid_labels", "box": {"l": 12, "w": 10, "h": 8}, "weights": {"empties_billed": 3, "refills_billed": 4, "kit_billed": 1}, "speed": "standard"})
    labels, tracking, status, purchased = processor._apply_paid_labels({
        "shipping": {"name": "Pat", "address": "1 Main", "city": "Atlantic Beach", "state": "FL", "zip": "32233"},
        "items": [{"type": "refill", "ounces": 10, "quantity": 1, "shippingMethod": "prepaid_labels", "boxKey": "ups_medium"}],
        "shipping_labels": [],
    })
    assert printed == ["empties_in", "refills_out"]
    assert [row["key"] for row in purchased] == ["empties_in", "refills_out"]
    assert status == "created"
    assert all(row["status"] == "purchased" and row["labelUrl"] for row in labels)
