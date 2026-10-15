"""Stored value integration tests with actual DynamoDB expressions under moto."""
import json
import importlib.util
import sys
from pathlib import Path
from unittest.mock import Mock

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambda_functions" / "payment_processor"))
import gift_cards as gifts
def load_processor():
    path = Path(__file__).resolve().parents[1] / "lambda_functions" / "payment_processor" / "index.py"
    spec = importlib.util.spec_from_file_location("gift_payment_processor", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_gift_tests")
    with mock_aws():
        db = boto3.resource("dynamodb", region_name="us-east-1")
        for name in (gifts.TABLE, "candle-garden-orders"):
            db.create_table(TableName=name, KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
        processor = load_processor()
        processor._orders_table = db.Table("candle-garden-orders")
        processor._ses = Mock(return_value=Mock())
        processor._apply_paid_labels = Mock(return_value=([], [], "none", []))
        processor._book_class_seats = Mock(return_value=None)
        intents = {}

        def stripe(path, values):
            if path.endswith("/cancel"):
                pi = path.split("/")[1]
                intents[pi]["status"] = "canceled"
                return intents[pi]
            order = values["metadata[candle_garden_order_id]"]
            pi = "pi_" + order
            intents[pi] = {"id": pi, "client_secret": pi + "_secret", "amount": values["amount"],
                "amount_received": values["amount"], "currency": "usd", "status": "requires_payment_method",
                "livemode": False, "metadata": {"candle_garden_order_id": order}}
            return intents[pi]

        processor._stripe_request = Mock(side_effect=stripe)
        processor._stripe_get = lambda path: intents[path.split("/")[1]]
        yield processor, intents


def event(body, path="/payments/payment-sheet"):
    return {"httpMethod": "POST", "path": path, "body": json.dumps(body), "headers": {"X-Device-Id": "test-device"}}


def request(processor, body, path="/payments/payment-sheet"):
    response = processor.handler(event(body, path), None)
    return response["statusCode"], json.loads(response["body"])


def purchase(processor, amount=50):
    status, checkout = request(processor, {"email": "buyer@example.com", "items": [{"type": "gift_card",
        "giftAmount": amount, "quantity": 1, "unitPrice": 0.01,
        "delivery": {"email": "recipient@example.com", "message": "<script>gift</script>", "senderName": "Buyer"}}]})
    assert status == 200, checkout
    return checkout


def pay(processor, intents, checkout):
    if checkout.get("paymentIntentId"):
        intents[checkout["paymentIntentId"]]["status"] = "succeeded"
    return request(processor, checkout, "/payments/finalize")


def issued_card(processor, intents, amount=50):
    checkout = purchase(processor, amount)
    status, result = pay(processor, intents, checkout)
    assert status == 200 and result["paid"], result
    delivery = gifts.table().get_item(Key={"id": "delivery:" + checkout["orderId"]})["Item"]
    return checkout, delivery["code"]


def redemption(processor, code, amount):
    processor._catalog_cache = {"candle": {"id": "candle", "name": "Candle", "price": amount}}
    processor._catalog_cache_expires = 10**12
    return request(processor, {"giftCardCode": code, "email": "customer@example.com",
        "shipping": {"phone": "9045551212"}, "items": [{"productId": "candle", "quantity": 1}]})


@pytest.mark.parametrize("amount", gifts.AMOUNTS)
def test_allowed_amounts_ignore_client_price(app, amount):
    processor, _ = app
    checkout = purchase(processor, amount)
    assert checkout["amount"] == amount * 100
    assert processor._get_order(checkout["orderId"])["items"][0]["price"] == amount


@pytest.mark.parametrize("amount", [0, 26, 999, True, "50"])
def test_invalid_amounts_fail_before_charge(app, amount):
    processor, _ = app
    status, _ = request(processor, {"email": "buyer@example.com", "items": [{"type": "gift_card",
        "giftAmount": amount, "quantity": 1, "delivery": {"email": "recipient@example.com"}}]})
    assert status == 400
    processor._stripe_request.assert_not_called()


def test_no_card_before_payment_and_duplicate_finalize_issues_once(app):
    processor, intents = app
    checkout = purchase(processor)
    status, result = request(processor, checkout, "/payments/finalize")
    assert status == 200 and not result["paid"]
    assert gifts.table().scan()["Items"] == []
    assert processor._get_order(checkout["orderId"])["status"] == "payment_pending"
    pay(processor, intents, checkout)
    first = gifts.table().scan()["Items"]
    pay(processor, intents, checkout)
    assert gifts.table().scan()["Items"] == first
    sent = processor._ses().send_email.call_args_list
    recipient = [call.kwargs for call in sent if call.kwargs["Destination"]["ToAddresses"] == ["recipient@example.com"]]
    assert len(recipient) == 1
    assert "&lt;script&gt;" in recipient[0]["Message"]["Body"]["Html"]["Data"]
    assert "TEST" in recipient[0]["Message"]["Subject"]["Data"]


def test_issue_transaction_rolls_back_when_order_missing(app):
    with pytest.raises(Exception):
        gifts.issue({"id": "missing", "items": [{"type": "gift_card", "price": 50,
            "delivery": {"email": "recipient@example.com"}}]}, False, "candle-garden-orders")
    assert gifts.table().scan()["Items"] == []


def test_partial_redemption_cancel_and_retry_do_not_spend_twice(app):
    processor, intents = app
    _, code = issued_card(processor, intents)
    status, checkout = redemption(processor, code, 70)
    assert status == 200 and checkout["amount"] == 2000 and checkout["giftCardCents"] == 5000
    assert gifts.get(code, False)["balanceCents"] == 0
    status, _ = redemption(processor, code, 10)
    assert status == 400
    status, result = request(processor, checkout, "/payments/gift-card-cancel")
    assert status == 200 and result["cancelled"]
    request(processor, checkout, "/payments/gift-card-cancel")
    assert gifts.get(code, False)["balanceCents"] == 5000
    status, checkout = redemption(processor, code, 30)
    assert status == 200 and checkout["giftCardOnly"]
    assert gifts.get(code, False)["balanceCents"] == 2000
    assert pay(processor, intents, checkout)[1]["paid"]
    assert pay(processor, intents, checkout)[1]["paid"]
    assert gifts.get(code, False)["balanceCents"] == 2000
    assert not gifts.release(checkout["orderId"])


def test_fully_covered_checkout_requires_secret_token(app):
    processor, intents = app
    _, code = issued_card(processor, intents)
    _, checkout = redemption(processor, code, 25)
    status, _ = request(processor, {"orderId": checkout["orderId"], "checkoutToken": "wrong"}, "/payments/finalize")
    assert status == 400
    assert gifts.reservation(checkout["orderId"])["state"] == "reserved"
    request(processor, checkout, "/payments/gift-card-cancel")
    assert pay(processor, intents, checkout)[0] == 400
    assert gifts.get(code, False)["balanceCents"] == 5000


def test_test_card_cannot_be_used_with_live_checkout(app):
    processor, intents = app
    _, code = issued_card(processor, intents)
    with pytest.raises(ValueError):
        gifts.get(code, True)


def test_stripe_minimum_keeps_small_unspent_balance(app):
    processor, intents = app
    _, code = issued_card(processor, intents)
    status, checkout = redemption(processor, code, 50.25)
    assert status == 200 and checkout["amount"] == 50 and checkout["giftCardCents"] == 4975
    assert gifts.get(code, False)["balanceCents"] == 25


def test_payment_amount_mismatch_never_issues_card(app):
    processor, intents = app
    checkout = purchase(processor)
    intents[checkout["paymentIntentId"]]["amount_received"] = 1
    assert pay(processor, intents, checkout)[0] == 400
    assert gifts.table().scan()["Items"] == []


def test_payment_reference_alone_cannot_access_gift_checkout(app):
    processor, intents = app
    checkout = purchase(processor)
    intents[checkout["paymentIntentId"]]["status"] = "succeeded"
    status, _ = request(processor, {"paymentIntentId": checkout["paymentIntentId"]}, "/payments/finalize")
    assert status == 400
    assert gifts.table().scan()["Items"] == []


def test_authoritative_quote_sets_redemption_price_and_preserves_scents(app, monkeypatch):
    processor, intents = app
    _, code = issued_card(processor, intents)
    monkeypatch.setenv("PRICE_QUOTE_URL", "https://example.test/payments/quote")
    scents = [{"vesselId": "one", "scentId": "almond", "scentName": "Almond", "ounces": 10}]
    class Response:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def read(self): return json.dumps({"total": 4000, "items": [{"type": "refill", "productId": "refill",
            "name": "Candle refill", "quantity": 1, "unitCents": 4000, "vesselScents": scents}]}).encode()
    monkeypatch.setattr(processor.urllib.request, "urlopen", lambda *_, **__: Response())
    status, checkout = request(processor, {"giftCardCode": code, "email": "customer@example.com",
        "shipping": {"phone": "9045551212"}, "items": [{"type": "refill", "quantity": 1, "unitPrice": 0.01}]})
    assert status == 200 and checkout["totalCents"] == 4000 and checkout["giftCardOnly"]
    assert processor._get_order(checkout["orderId"])["items"][0]["vesselScents"] == scents


def test_email_failure_retries_same_card_on_schedule(app):
    processor, intents = app
    checkout = purchase(processor)
    processor._ses().send_email.side_effect = RuntimeError("temporary outage")
    assert pay(processor, intents, checkout)[1]["paid"]
    delivery = gifts.table().get_item(Key={"id": "delivery:" + checkout["orderId"]})["Item"]
    assert delivery["state"] == "pending"
    gifts.table().update_item(Key={"id": delivery["id"]}, UpdateExpression="REMOVE leaseUntil")
    processor._ses().send_email.side_effect = None
    processor.handler({"source": "aws.events"}, None)
    updated = gifts.table().get_item(Key={"id": delivery["id"]})["Item"]
    assert updated["state"] == "sent" and updated["code"] == delivery["code"]


def test_closed_app_payment_is_recovered_by_scheduler(app):
    processor, intents = app
    checkout = purchase(processor)
    intents[checkout["paymentIntentId"]]["status"] = "succeeded"
    processor.handler({"source": "aws.events"}, None)
    assert gifts.table().get_item(Key={"id": "delivery:" + checkout["orderId"]})["Item"]["state"] == "sent"


def test_persist_failure_does_not_create_payment(app, monkeypatch):
    processor, _ = app
    monkeypatch.setattr(processor, "_put_checkout_order", Mock(side_effect=RuntimeError("storage unavailable")))
    with pytest.raises(AssertionError):
        purchase(processor)
    processor._stripe_request.assert_not_called()


def test_refund_credit_is_idempotent_and_refunded_purchase_disabled(app):
    processor, intents = app
    purchase_checkout, code = issued_card(processor, intents)
    _, checkout = redemption(processor, code, 70)
    assert pay(processor, intents, checkout)[1]["paid"]
    gifts.refund_redemption(checkout["orderId"], 2000, 7000)
    gifts.refund_redemption(checkout["orderId"], 2000, 7000)
    assert gifts.get(code, False)["balanceCents"] == 5000
    gifts.disable_refunded_purchase(purchase_checkout["orderId"])
    with pytest.raises(ValueError):
        gifts.get(code, False)
