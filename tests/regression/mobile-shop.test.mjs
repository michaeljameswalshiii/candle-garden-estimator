import assert from "node:assert/strict";
import test from "node:test";
import { loadMobileLib } from "./lib/load-mobile.mjs";

const { shop, classes } = await loadMobileLib();

test("shop catalog is the shared products snapshot", () => {
  assert.ok(shop.products.length >= 1);
  assert.equal(shop.SHOP_BASE, "https://www.thecandlegarden.co");
  assert.deepEqual(
    shop.SHOP_CATEGORIES.map((item) => item.id),
    ["all", "fall", "summer", "classic", "subscription", "gift-card"],
  );
});

test("shop filters and price labels match the catalog", () => {
  const all = shop.filterProducts("all");
  const fall = shop.filterProducts("fall");
  const classic = shop.filterProducts("classic");
  assert.equal(all.length, shop.products.length);
  assert.ok(fall.length >= 1);
  assert.ok(classic.length >= 1);
  assert.ok(fall.every((item) => item.categories.includes("fall")));
  const atlantic = shop.products.find((item) => item.id === "65faf809b85f1d19a61c8374");
  assert.equal(shop.formatPrice(atlantic), "from $35.00");
});

test("class helper hides past dates and sorts remaining seats", () => {
  const sample = [
    { id: "past", date: "2026-01-01", time: "6PM", title: "Past" },
    { id: "later", date: "2026-12-02", time: "10AM", title: "Later" },
    { id: "soon", date: "2026-12-01", time: "6PM", title: "Soon" },
  ];
  const upcoming = classes.getUpcomingClasses(new Date("2026-09-20T12:00:00"), sample);
  assert.deepEqual(
    upcoming.map((item) => item.id),
    ["soon", "later"],
  );
  const fromCatalog = classes.getUpcomingClasses(new Date("2099-01-01T12:00:00"), classes.classes);
  assert.equal(fromCatalog.length, 0);
});

test("live class refresh URL is the Vercel mobile classes endpoint", () => {
  assert.equal(classes.CLASSES_PAGE_URL, "https://www.thecandlegarden.co/candle-garden-events");
  assert.equal(classes.CLASSES_API_URL, "https://candle-garden-web.vercel.app/api/mobile/classes");
});

test("live product inventory refresh URL is the Vercel mobile catalog endpoint", () => {
  assert.equal(shop.CATALOG_API_URL, "https://candle-garden-web.vercel.app/api/mobile/catalog");
  assert.equal(typeof shop.fetchLatestProducts, "function");
});
