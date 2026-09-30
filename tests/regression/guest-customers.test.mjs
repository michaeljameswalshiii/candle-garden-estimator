import assert from "node:assert/strict";
import test from "node:test";

function customerLabel(order) {
  const email = String(order.customer_email || "").trim();
  if (email.includes("@")) return email;
  const shipping = order.shipping || {};
  const place = [shipping.city, shipping.state].filter(Boolean).join(", ");
  const time = Date.parse(order.created_at || "");
  const when = Number.isFinite(time) ? new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const total = Number(order.total_amount);
  const money = Number.isFinite(total) && total > 0 ? `$${total.toFixed(2)}` : "";
  const bits = [place, when, money].filter(Boolean);
  return bits.length ? `guest (${bits.join(" · ")})` : `guest (${String(order.id || "order").slice(0, 8)})`;
}

function customerGroupKey(order) {
  const email = String(order.customer_email || "").trim();
  if (email.includes("@")) return email.toLowerCase();
  return `order:${order.id}`;
}

test("guest orders stay separate and include shipping data", () => {
  const ny = {
    id: "d0347268-7266-4611-9a9c-111339b5f41c",
    customer_id: "guest:d0347268-7266-4611-9a9c-111339b5f41c",
    customer_email: "guest",
    total_amount: 42.14,
    created_at: "2026-09-17T14:54:33.203Z",
    shipping: { city: "New York", state: "NY" },
  };
  const fl = {
    id: "be1e1abd-b718-4411-8ebd-055c1b2b1a88",
    customer_id: "guest:be1e1abd-b718-4411-8ebd-055c1b2b1a88",
    customer_email: "guest",
    total_amount: 34,
    created_at: "2026-09-17T14:18:43.846Z",
    shipping: { city: "Atlantic Beach", state: "FL" },
  };

  assert.equal(customerLabel(ny), "guest (New York, NY · Sep 17 · $42.14)");
  assert.equal(customerLabel(fl), "guest (Atlantic Beach, FL · Sep 17 · $34.00)");
  assert.notEqual(customerGroupKey(ny), customerGroupKey(fl));
});

test("signed-in emails stay grouped by email", () => {
  const order = {
    id: "abc",
    customer_email: "michaeljameswalshiii@gmail.com",
    total_amount: 12,
    created_at: "2026-09-17T14:18:43.846Z",
  };
  assert.equal(customerLabel(order), "michaeljameswalshiii@gmail.com");
  assert.equal(customerGroupKey(order), "michaeljameswalshiii@gmail.com");
});
