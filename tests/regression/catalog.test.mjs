import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

const products = readJson("packages/catalog/products.json");
const classes = readJson("packages/catalog/classes.json");

test("catalog snapshots are non-empty arrays", () => {
  assert.ok(Array.isArray(products) && products.length >= 1, "products.json");
  assert.ok(Array.isArray(classes) && classes.length >= 1, "classes.json");
});

test("every product has a unique id, name, price, image, and shop url", () => {
  const ids = new Set();
  for (const product of products) {
    assert.equal(typeof product.id, "string");
    assert.ok(product.id.length > 8, product.name);
    assert.equal(ids.has(product.id), false, `duplicate product ${product.id}`);
    ids.add(product.id);
    assert.ok(String(product.name || "").trim(), "name");
    assert.equal(typeof product.price, "number");
    assert.ok(product.price > 0, product.name);
    if (product.priceMax != null) {
      assert.ok(product.priceMax >= product.price, product.name);
    }
    assert.ok(/^https?:\/\//.test(product.image), product.name);
    assert.ok(/^https?:\/\//.test(product.url), product.name);
    assert.ok(Array.isArray(product.sizes));
    assert.equal(typeof product.soldOut, "boolean");
  }
});

test("Atlantic Beach 10oz is $35 and 18oz is $42 (payment catalog cents)", () => {
  const product = products.find((item) => item.id === "65faf809b85f1d19a61c8374");
  assert.ok(product, "Atlantic Beach is in the catalog");
  assert.equal(product.price, 35);
  assert.equal(product.priceMax, 42);
  assert.ok(product.sizes.includes("10oz"));
  assert.ok(product.sizes.includes("18oz"));
});

test("every class has a unique id, date, price, and booking url", () => {
  const ids = new Set();
  for (const item of classes) {
    assert.equal(typeof item.id, "string");
    assert.equal(ids.has(item.id), false, `duplicate class ${item.id}`);
    ids.add(item.id);
    assert.ok(String(item.title || "").trim());
    assert.match(String(item.date), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof item.price, "number");
    assert.ok(item.price > 0);
    assert.ok(/^https?:\/\//.test(item.url));
    assert.equal(typeof item.soldOut, "boolean");
    assert.doesNotMatch(String(item.scheduleLabel || ""), /\bprivate\b/i);
  }
});

test("payment processor copies match the shared catalog snapshots", () => {
  const payProducts = readJson("candle-saas-cdk/lambda_functions/payment_processor/catalog.json");
  const payClasses = readJson("candle-saas-cdk/lambda_functions/payment_processor/classes.json");
  assert.deepEqual(payProducts, products);
  assert.deepEqual(payClasses, classes);
});

test("upcoming class filter uses calendar dates, not soldOut alone", () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = classes.filter((item) => new Date(`${item.date}T12:00:00`) >= today);
  assert.ok(upcoming.every((item) => !Number.isNaN(new Date(`${item.date}T12:00:00`).getTime())));
});
