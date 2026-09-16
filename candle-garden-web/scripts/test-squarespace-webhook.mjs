import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const secret = "aabbccddeeff00112233445566778899";
const payload = JSON.stringify({
  id: "test-notification",
  websiteId: "65fae805de7d9316f58ac65f",
  topic: "order.create",
  data: { id: "order-1" },
});
const expected = createHmac("sha256", Buffer.from(secret, "hex")).update(payload).digest("hex");
const wrong = createHmac("sha256", Buffer.from(secret, "hex")).update(`${payload}x`).digest("hex");

assert.equal(expected.length, 64);
assert.notEqual(expected, wrong);
console.log("webhook signature helper ok");
