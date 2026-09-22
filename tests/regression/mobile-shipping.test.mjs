import assert from "node:assert/strict";
import test from "node:test";
import { loadMobileLib } from "./lib/load-mobile.mjs";

const { pricing, rates, shipping } = await loadMobileLib();

test("photo detection uses the 0.5 confidence floor from pricing.js", () => {
  assert.equal(pricing.MIN_CONFIDENCE, 0.5);
  assert.equal(pricing.WAX_PRICE_PER_OZ, 1.75);
  assert.equal(pricing.isAcceptableDetection(null).reason, "empty_response");
  assert.equal(pricing.isAcceptableDetection({ success: false }).reason, "not_detected");
  assert.equal(
    pricing.isAcceptableDetection({
      success: true,
      container_detected: true,
      estimated_ounces: 0,
      confidence: 0.9,
    }).reason,
    "invalid_ounces",
  );
  assert.equal(
    pricing.isAcceptableDetection({
      success: true,
      container_detected: true,
      estimated_ounces: 10,
      confidence: 0.49,
    }).reason,
    "low_confidence",
  );
  const ok = pricing.isAcceptableDetection({
    success: true,
    container_detected: true,
    estimated_ounces: 10,
    confidence: 0.5,
    container_type: "jar",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.ounces, 10);
});

test("10 oz refill wax is $17.50 before shipping", () => {
  const quote = pricing.calculateCost(10, { destZip: "32250", shippingMethod: "ship_own" });
  assert.equal(quote.wax_cost_num, 17.5);
  assert.equal(quote.shipping_method, "ship_own");
  assert.equal(quote.quote_ok, true);
  assert.ok(quote.total_cost_num > quote.wax_cost_num);
});

test("a ZIP is required and Alaska is out of coverage", () => {
  const missing = pricing.calculateCost(10, { shippingMethod: "ship_own" });
  assert.equal(missing.quote_ok, false);
  assert.equal(missing.needs_zip, true);
  assert.equal(rates.isValidDestZip("99501"), false);
  assert.equal(rates.isValidDestZip("32250"), true);
  assert.equal(rates.ORIGIN_ZIP, "32233");
});

test("kit roundtrip costs more than prepaid labels, which cost more than ship-own", () => {
  const own = pricing.calculateCost(12, { destZip: "10001", shippingMethod: "ship_own" });
  const labels = pricing.calculateCost(12, { destZip: "10001", shippingMethod: "prepaid_labels" });
  const kit = pricing.calculateCost(12, { destZip: "10001", shippingMethod: "kit_roundtrip" });
  assert.equal(own.quote_ok && labels.quote_ok && kit.quote_ok, true);
  assert.ok(own.shipping_cost_num < labels.shipping_cost_num);
  assert.ok(labels.shipping_cost_num < kit.shipping_cost_num);
  assert.equal(kit.legs.length, 3);
  assert.equal(labels.legs.length, 2);
  assert.equal(own.legs.length, 1);
});

test("the three refill shipping methods and cartons are still the product set", () => {
  assert.deepEqual(pricing.METHOD_ORDER, ["ship_own", "kit_roundtrip", "prepaid_labels"]);
  assert.ok(shipping.UPS_BOXES.ups_small);
  assert.ok(shipping.UPS_BOXES.ups_medium);
  assert.ok(shipping.UPS_BOXES.ups_large);
  const box = shipping.recommendShippingBox({ totalWaxOz: 10, vesselCount: 1 });
  assert.ok(["ups_small", "ups_medium", "ups_large"].includes(box.boxKey));
});
