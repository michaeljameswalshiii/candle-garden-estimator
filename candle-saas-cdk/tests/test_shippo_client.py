"""Shippo rate picking — no live HTTP."""
import importlib.util
from pathlib import Path

PAY_DIR = Path(__file__).resolve().parents[1] / "lambda_functions" / "payment_processor"


def load():
    spec = importlib.util.spec_from_file_location("shippo_client", PAY_DIR / "shippo_client.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_picks_cheapest_usps_and_skips_ups(monkeypatch):
    monkeypatch.delenv("SHIPPO_ALLOW_UPS", raising=False)
    client = load()
    rates = [
        {"object_id": "ups1", "amount": "7.51", "provider": "UPS", "servicelevel": {"name": "Ground Saver", "token": "ups_ground_saver"}},
        {"object_id": "usps1", "amount": "7.52", "provider": "USPS", "servicelevel": {"name": "Ground Advantage", "token": "usps_ground_advantage"}},
        {"object_id": "usps2", "amount": "15.00", "provider": "USPS", "servicelevel": {"name": "Priority Mail", "token": "usps_priority"}},
        {"object_id": "dhl1", "amount": "4.00", "provider": "DHL Express", "servicelevel": {"name": "Express", "token": "dhl_express"}},
    ]
    picked = client.pick_rate(rates)
    assert picked["object_id"] == "usps1"
    assert picked["cents"] == 752
    assert picked["provider"] == "USPS"


def test_skips_ups_when_flag_off(monkeypatch):
    monkeypatch.delenv("SHIPPO_ALLOW_UPS", raising=False)
    client = load()
    rates = [
        {"object_id": "ups1", "amount": "7.51", "provider": "UPS", "servicelevel": {"name": "Ground Saver"}},
    ]
    try:
        client.pick_rate(rates)
        assert False, "expected UPS-only rates to be skipped"
    except RuntimeError as error:
        assert "no usable rates" in str(error)


def test_falls_back_to_non_usps_when_needed(monkeypatch):
    monkeypatch.setenv("SHIPPO_ALLOW_UPS", "true")
    client = load()
    rates = [
        {"object_id": "ups1", "amount": "9.57", "provider": "UPS", "servicelevel": {"name": "Ground"}},
    ]
    picked = client.pick_rate(rates)
    assert picked["object_id"] == "ups1"
    assert picked["cents"] == 957
