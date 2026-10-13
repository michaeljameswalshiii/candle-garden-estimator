import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "lambda_functions" / "order_processor" / "index.py"


def load_orders():
    spec = importlib.util.spec_from_file_location("order_processor_view", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_paid_ship_own_hides_return_tracking():
    orders = load_orders()
    view = orders.customer_order_view({
        "id": "92a1863d-0b19-42e6-b4a0-54423da04e54",
        "status": "paid_test",
        "tracking_numbers": ["9334620845500001895633"],
        "shipping_labels": [{
            "key": "refills_out",
            "title": "Refills back to customer",
            "trackingNumber": "9334620845500001895633",
            "labelUrl": "https://labels.test/return.png",
        }],
    })
    assert view["tracking_numbers"] == []
    assert view["shipping_labels"] == []


def test_prepaid_keeps_empties_label_and_hides_return():
    orders = load_orders()
    view = orders.customer_order_view({
        "status": "paid_test",
        "tracking_numbers": ["empties", "return"],
        "shipping_labels": [
            {"key": "empties_in", "trackingNumber": "empties", "labelUrl": "https://labels.test/in.png"},
            {"key": "refills_out", "trackingNumber": "return", "labelUrl": "https://labels.test/out.png"},
        ],
    })
    assert view["tracking_numbers"] == ["empties"]
    assert [row["key"] for row in view["shipping_labels"]] == ["empties_in"]
    assert view["shipping_labels"][0]["labelUrl"] == "https://labels.test/in.png"


def test_shipped_order_can_show_return_tracking():
    orders = load_orders()
    view = orders.customer_order_view({
        "status": "shipped",
        "tracking_numbers": ["9334"],
        "shipping_labels": [{"key": "refills_out", "trackingNumber": "9334", "labelUrl": "https://labels.test/out.png"}],
    })
    assert view["tracking_numbers"] == ["9334"]
    assert "labelUrl" not in view["shipping_labels"][0]
