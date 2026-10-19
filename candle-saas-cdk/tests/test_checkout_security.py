"""Security regressions: real signatures, mocked payment/carrier side effects."""
import importlib.util
import json
from pathlib import Path
import sys
from unittest.mock import Mock

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lambda_functions" / "payment_processor"))


def load(folder):
    path = ROOT / "lambda_functions" / folder / "index.py"
    spec = importlib.util.spec_from_file_location("security_" + folder, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_forged_payment_token_is_rejected_before_stripe():
    processor = load("payment_processor")
    processor._stripe_request = Mock(side_effect=AssertionError("Must not contact Stripe"))
    result = processor.handler({"httpMethod": "POST", "path": "/payments/payment-sheet",
        "headers": {"Authorization": "Bearer fake.eyJzdWIiOiJ2aWN0aW0ifQ.invalid"}, "body": "{}"}, None)
    assert result["statusCode"] == 401
    processor._stripe_request.assert_not_called()


@pytest.mark.parametrize("changes", [
    {"exp": 1}, {"iss": "https://attacker.invalid"}, {"aud": "another-client"},
    {"token_use": "refresh"}, {"sub": ""},
    {"token_use": "access", "client_id": "another-client"},
])
def test_invalid_signed_claims_rejected(signed_identity, changes):
    from cognito_identity import verified_claims
    with pytest.raises(ValueError):
        verified_claims({"headers": {"Authorization": "Bearer " + signed_identity(**changes)}})


def test_tampered_signature_rejected(signed_identity):
    from cognito_identity import verified_claims
    token = signed_identity()
    first, payload, signature = token.split(".")
    signature = ("A" if signature[0] != "A" else "B") + signature[1:]
    with pytest.raises(ValueError):
        verified_claims({"headers": {"Authorization": f"Bearer {first}.{payload}.{signature}"}})


def test_real_id_and_access_tokens_keep_detect_authenticated(signed_identity):
    from cognito_identity import CLIENT_ID
    detector = load("container_detector")
    for token in (signed_identity(), signed_identity(token_use="access", client_id=CLIENT_ID)):
        context = detector._resolve_user_context({"headers": {"Authorization": "Bearer " + token}})
        assert context["verified"] is True
        assert context["sub"] == "user-123"


def test_detect_does_not_use_caller_forwarded_ip():
    detector = load("container_detector")
    assert detector._client_ip({"headers": {"X-Forwarded-For": "spoofed"},
        "requestContext": {"identity": {"sourceIp": "192.0.2.1"}}}) == "192.0.2.1"


@pytest.fixture
def checkout(monkeypatch):
    processor = load("payment_processor")
    order = {"id": "order-test", "customer_id": "guest:dev_testdevice123", "status": "payment_pending",
        "payment_intent_id": "pi_test", "total_amount": 35, "items": [], "shipping": {"address": "Saved address"},
        "confirmation_sent_at": "already-sent"}
    intent = {"id": "pi_test", "status": "succeeded", "amount": 3500, "amount_received": 3500,
        "currency": "usd", "livemode": False, "metadata": {"candle_garden_order_id": "order-test"}}
    monkeypatch.setattr(processor, "_get_order", lambda oid: order if oid == order["id"] else None)
    monkeypatch.setattr(processor, "_find_order_by_payment_intent", lambda pi: order)
    monkeypatch.setattr(processor, "_stripe_get", lambda path: intent)
    monkeypatch.setattr(processor, "_stripe_secret", lambda: "sk_test_fictional")
    processor._apply_paid_labels = Mock(return_value=([], [], "none", []))
    processor._book_class_seats = Mock(return_value=None)
    processor._update_order = Mock()
    return processor, order, intent


def finalize(processor, headers=None):
    return processor._finalize_payment({"headers": headers or {}, "body": {"paymentIntentId": "pi_test"}})


@pytest.mark.parametrize("headers", [{}, {"X-Device-Id": "dev_anotherdevice123"}])
def test_unowned_payment_cannot_finalize_or_buy_labels(checkout, headers):
    processor, _, _ = checkout
    assert finalize(processor, headers)["statusCode"] == 400
    processor._apply_paid_labels.assert_not_called()
    processor._update_order.assert_not_called()


def test_refunded_order_is_not_marked_paid_or_labeled(checkout):
    processor, order, _ = checkout
    order["status"] = "refunded"
    result = finalize(processor, {"X-Device-Id": "dev_testdevice123"})
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["paid"] is False
    assert body["status"] == "refunded"
    processor._apply_paid_labels.assert_not_called()
    processor._update_order.assert_not_called()


def test_guest_test_payment_keeps_working_on_original_device(checkout):
    processor, order, _ = checkout
    result = finalize(processor, {"X-Device-Id": "dev_testdevice123"})
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["status"] == "paid_test"
    processor._apply_paid_labels.assert_called_once_with(order)


def test_signed_in_test_payment_keeps_working(checkout, signed_identity):
    processor, order, _ = checkout
    order["customer_id"] = "user-123"
    assert finalize(processor, {"Authorization": "Bearer " + signed_identity()})["statusCode"] == 200


@pytest.mark.parametrize("change", [
    {"amount": 1}, {"amount_received": 1}, {"currency": "eur"}, {"livemode": True},
    {"id": "pi_other"}, {"metadata": {"candle_garden_order_id": "another-order"}},
])
def test_payment_binding_checked_before_side_effects(checkout, change):
    processor, _, intent = checkout
    intent.update(change)
    assert finalize(processor, {"X-Device-Id": "dev_testdevice123"})["statusCode"] == 400
    processor._apply_paid_labels.assert_not_called()
    processor._update_order.assert_not_called()


def test_signed_webhook_can_finalize_without_device(checkout):
    processor, _, _ = checkout
    assert processor._finalize_payment({"body": {"paymentIntentId": "pi_test"}}, trusted_payment=True)["statusCode"] == 200


def test_public_label_request_needs_saved_order(checkout):
    processor, _, _ = checkout
    result = processor._refill_labels({"body": {"shipping": {"address": "Attacker address", "zip": "00000"},
        "items": [{"type": "refill"}]}})
    assert result["statusCode"] == 400
    processor._apply_paid_labels.assert_not_called()


def test_label_retry_ignores_client_destination_and_items(checkout):
    processor, order, _ = checkout
    result = processor._refill_labels({"headers": {"X-Device-Id": "dev_testdevice123"},
        "body": {"orderId": order["id"], "shipping": {"address": "Attacker address"}, "items": [{"price": 0}]}})
    assert result["statusCode"] == 200
    processor._apply_paid_labels.assert_called_once_with(order)
    assert order["shipping"]["address"] == "Saved address"


def test_unpaid_label_retry_does_not_buy_labels(checkout):
    processor, order, intent = checkout
    intent["status"] = "requires_payment_method"
    result = processor._refill_labels({"headers": {"X-Device-Id": "dev_testdevice123"}, "body": {"orderId": order["id"]}})
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["paid"] is False
    processor._apply_paid_labels.assert_not_called()


@pytest.mark.parametrize("status", ["paid", "shipped", "completed", "confirmed"])
def test_customer_cannot_set_payment_or_fulfillment_status(monkeypatch, status):
    orders = load("order_processor")
    orders.orders_table = Mock()
    orders.orders_table.get_item.return_value = {"Item": {"id": "order-test", "customer_id": "user-123"}}
    assert orders.ddb_update_order("order-test", "user-123", {"status": status})["statusCode"] == 403
    orders.orders_table.update_item.assert_not_called()


def test_purge_paginates_and_removes_personal_fields(monkeypatch):
    orders = load("order_processor")
    orders.orders_table = Mock()
    orders.push_table = Mock()
    orders.dynamodb = Mock()
    orders.dynamodb.Table.return_value.scan.return_value = {"Items": []}
    orders.orders_table.query.side_effect = [
        {"Items": [{"id": "one", "customer_email": "private@example.com", "shipping": {"address": "Private"},
            "payment_intent_id": "pi_one", "items": [{"delivery": {"email": "recipient@example.com"}}]}],
            "LastEvaluatedKey": {"id": "one"}},
        {"Items": [{"id": "two", "total_amount": 35}]},
    ]
    orders.push_table.query.side_effect = [
        {"Items": [{"token": "token-one"}], "LastEvaluatedKey": {"token": "token-one"}},
        {"Items": [{"token": "token-two"}]},
    ]
    result = orders.purge_user_data("user-123")
    assert result["orders"] == result["push_tokens"] == 2
    assert orders.orders_table.query.call_args_list[1].kwargs["ExclusiveStartKey"] == {"id": "one"}
    receipt = orders.orders_table.put_item.call_args_list[0].kwargs["Item"]
    assert receipt == {"id": "one", "payment_intent_id": "pi_one", "status": "deleted", "updated_at": receipt["updated_at"]}


def test_purge_failure_is_not_reported_as_success():
    orders = load("order_processor")
    orders.orders_table = Mock()
    orders.orders_table.query.side_effect = RuntimeError("Temporary database failure")
    with pytest.raises(RuntimeError):
        orders.purge_user_data("user-123")


def test_purge_cleans_active_push_store_when_legacy_table_does_not_exist(monkeypatch):
    import boto3
    from moto import mock_aws
    with mock_aws():
        db = boto3.resource("dynamodb", region_name="us-east-1")
        db.create_table(TableName="candle-garden-orders", KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"},
                {"AttributeName": "customer_id", "AttributeType": "S"}, {"AttributeName": "created_at", "AttributeType": "S"}],
            GlobalSecondaryIndexes=[{"IndexName": "customer_id-created_at-index",
                "KeySchema": [{"AttributeName": "customer_id", "KeyType": "HASH"}, {"AttributeName": "created_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"}}], BillingMode="PAY_PER_REQUEST")
        table = db.create_table(TableName="candle-garden-detect-rate-limits",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
        own = "push:user-123:ExpoPushToken[fictional]"
        foreign = "push:other-user:ExpoPushToken[other]"
        table.put_item(Item={"pk": own, "customer_id": "user-123"})
        table.put_item(Item={"pk": foreign, "customer_id": "other-user"})
        orders = load("order_processor")
        result = orders.purge_user_data("user-123")
        assert result["push_tokens"] == 1
        assert not table.get_item(Key={"pk": own}).get("Item")
        assert table.get_item(Key={"pk": foreign})["Item"]["customer_id"] == "other-user"


def test_purge_does_not_hide_legacy_push_permission_failures():
    from botocore.exceptions import ClientError
    orders = load("order_processor")
    orders.orders_table = Mock()
    orders.orders_table.query.return_value = {"Items": []}
    orders.push_table = Mock()
    orders.push_table.query.side_effect = ClientError({"Error": {"Code": "AccessDeniedException"}}, "Query")
    with pytest.raises(ClientError):
        orders.purge_user_data("user-123")


def test_pure_python_layer_verifies_without_host_crypto_packages(signed_identity):
    """Lambda ships portable wheels only, so test its native RSA backend too."""
    import cognito_identity
    import subprocess
    data = {"token": signed_identity(), "keys": cognito_identity._keys["value"]}
    program = '''import sys,json,time
sys.path.insert(0,sys.argv[1])
import cognito_identity
from jose.backends import RSAKey
assert RSAKey.__module__ == 'jose.backends.rsa_backend'
data=json.load(sys.stdin)
cognito_identity._keys={'value':data['keys'],'expires':time.time()+3600}
assert cognito_identity.verified_claims({'headers':{'Authorization':'Bearer '+data['token']}})['sub']=='user-123'
'''
    result = subprocess.run([sys.executable, "-S", "-c", program, str(ROOT / ".build" / "auth-layer" / "python")],
        input=json.dumps(data), text=True, capture_output=True)
    assert result.returncode == 0, result.stderr


def test_rotating_guest_devices_still_share_server_ip_limit(monkeypatch):
    detector = load("container_detector")
    calls = []
    def limit(bucket, maximum):
        calls.append(bucket)
        return False, 0, maximum
    monkeypatch.setattr(detector, "_rate_limit_check", limit)
    for device in ("first-device", "second-device"):
        result = detector.handler({"headers": {"X-Device-Id": device},
            "requestContext": {"identity": {"sourceIp": "192.0.2.1"}}, "body": "{}"}, None)
        assert result["statusCode"] == 429
    assert calls == ["guest-ip:192.0.2.1", "guest-ip:192.0.2.1"]


def test_api_packages_verifier_and_protects_purge(tmp_path):
    from aws_cdk import App, Environment
    from aws_cdk.assertions import Template
    from candle_saas.stacks.api import APIStack
    app = App(outdir=str(tmp_path))
    stack = APIStack(app, "SecurityAPI", env=Environment(account="123456789012", region="us-east-1"))
    template = Template.from_stack(stack).to_json()["Resources"]
    layer_ids = [key for key, row in template.items() if row["Type"] == "AWS::Lambda::LayerVersion"]
    assert len(layer_ids) == 1
    for name in ("PaymentProcessorFunction", "ContainerDetectorFunction"):
        functions = [row for key, row in template.items() if key.startswith(name) and row["Type"] == "AWS::Lambda::Function"]
        assert len(functions) == 1
        assert functions[0]["Properties"]["Layers"] == [{"Ref": layer_ids[0]}]
    purge = next(key for key, row in template.items() if row["Type"] == "AWS::ApiGateway::Resource" and row["Properties"]["PathPart"] == "purge")
    method = next(row for row in template.values() if row["Type"] == "AWS::ApiGateway::Method" and row["Properties"]["ResourceId"] == {"Ref": purge} and row["Properties"]["HttpMethod"] == "POST")
    assert method["Properties"]["AuthorizationType"] == "COGNITO_USER_POOLS"
    blob = json.dumps(template)
    assert "aws-marketplace:Unsubscribe" not in blob
    assert "arn:aws:logs:*:*:*" not in blob
    assert "bedrock:InvokeModelWithResponseStream" not in blob

    def method(resource_id, verb):
        return next(row for row in template.values() if row["Type"] == "AWS::ApiGateway::Method" and row["Properties"].get("ResourceId") == {"Ref": resource_id} and row["Properties"]["HttpMethod"] == verb)

    def resource(part, parent=None):
        return next(key for key, row in template.items() if row["Type"] == "AWS::ApiGateway::Resource" and row["Properties"]["PathPart"] == part and (parent is None or row["Properties"].get("ParentId") == {"Ref": parent}))

    products = resource("products")
    product_item = resource("{id}", products)
    images = resource("images")
    image_item = resource("{id}", images)
    recommendations = resource("recommendations")
    assert method(products, "GET")["Properties"]["AuthorizationType"] == "NONE"
    assert method(product_item, "GET")["Properties"]["AuthorizationType"] == "NONE"
    assert method(image_item, "GET")["Properties"]["AuthorizationType"] == "NONE"
    for resource_id, verb in ((products, "POST"), (product_item, "PUT"), (product_item, "DELETE"), (images, "POST"), (image_item, "DELETE"), (recommendations, "POST")):
        assert method(resource_id, verb)["Properties"]["AuthorizationType"] == "COGNITO_USER_POOLS"
