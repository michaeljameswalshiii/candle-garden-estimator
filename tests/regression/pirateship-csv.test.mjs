import assert from "node:assert/strict";
import test from "node:test";
import { pirateshipCsv, pirateshipReady } from "../../candle-garden-web/src/lib/mobileadmin/pirateship.ts";

test("Pirate Ship CSV includes address, order id, and package hints", () => {
  const { csv, count, skipped } = pirateshipCsv([
    {
      id: "be1e1abd-b718-4411-8ebd-055c1b2b1a88",
      customer_email: "guest",
      items: [{ ounces: 10, quantity: 1, boxKey: "ups_small" }],
      shipping: {
        name: "Guest",
        address: "363 Atlantic Boulevard, Suite 8",
        city: "Atlantic Beach",
        state: "FL",
        zip: "32233",
        phone: "9043167608",
      },
    },
  ]);
  assert.equal(count, 1);
  assert.equal(skipped, 0);
  assert.match(csv, /Order ID,Name,Address/);
  assert.match(csv, /be1e1abd-b718-4411-8ebd-055c1b2b1a88/);
  assert.match(csv, /Atlantic Beach/);
  assert.match(csv, /,10,/);
  assert.match(csv, /,10,8,6,/);
});

test("orders without a ZIP are skipped", () => {
  assert.equal(pirateshipReady({ id: "x", shipping: { address: "1 Main", city: "Miami", state: "FL" } }), false);
});
