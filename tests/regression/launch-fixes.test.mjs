import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

const mobile = path.join(ROOT, "candle-garden-mobile");
const web = path.join(ROOT, "candle-garden-web");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("customer empties labels ship to The Candle Garden", () => {
  const purchase = read("candle-garden-web/src/lib/purchase-refill-labels.ts");
  const labels = read("candle-garden-web/src/lib/shipping-labels.ts");
  const pricing = read("candle-garden-web/src/lib/refill-pricing.ts");
  const card = read("candle-garden-mobile/components/OrderHistoryCard.js");
  assert.match(purchase, /recipient: leg.key === "empties_in" \? "The Candle Garden"/);
  assert.match(labels, /recipient: "The Candle Garden"/);
  assert.match(pricing, /from: destination, to: origin/);
  assert.match(pricing, /Empty vessels to Candle Garden/);
  assert.match(card, /Ship your empty vessels to/);
  assert.match(card, /The Candle Garden/);
  assert.match(card, /Tape this prepaid label to the box/);
});

test("order history shows details, tracking, pickup, and one-tap reorder", () => {
  const card = read("candle-garden-mobile/components/OrderHistoryCard.js");
  const orders = read("candle-garden-mobile/screens/OrdersScreen.js");
  assert.match(card, /Refill the same vessels again/);
  assert.match(card, /Reorder \{item.name/);
  assert.match(card, /View receipt details/);
  assert.match(card, /Atlantic Beach shop/);
  assert.match(card, /Track empties to The Candle Garden/);
  assert.match(orders, /onReorderRefill/);
  assert.match(orders, /fetchLatestProducts/);
  assert.match(orders, /navigate\('Estimator'/);
});

test("Apple Pay, promo codes, and Atlantic Beach pickup are wired at checkout", () => {
  const orders = read("candle-garden-mobile/screens/OrdersScreen.js");
  const appJson = read("candle-garden-mobile/app.json");
  const app = read("candle-garden-mobile/App.js");
  const stripe = read("candle-garden-mobile/lib/stripeConfig.js");
  assert.match(orders, /applePay: \{ merchantCountryCode: 'US' \}/);
  assert.match(orders, /promoCode/);
  assert.match(orders, /Atlantic Beach pickup/);
  assert.match(orders, /fulfillment === 'pickup'/);
  assert.match(appJson, /merchant.com.michaeljameswalshiii.candlegarden/);
  assert.match(appJson, /com.apple.developer.in-app-payments/);
  assert.match(app, /merchantIdentifier=\{APPLE_MERCHANT_IDENTIFIER\}/);
  assert.match(stripe, /APPLE_MERCHANT_IDENTIFIER/);
});

test("push notifications are hooked natively and hidden when unavailable", () => {
  const profile = read("candle-garden-mobile/screens/ProfileScreen.js");
  const stub = read("candle-garden-mobile/lib/notifications.js");
  const native = read("candle-garden-mobile/lib/notifications.native.js");
  const cron = read("candle-garden-web/src/app/api/cron/mobile-alerts/route.ts");
  assert.match(profile, /pushAvailable \? \(/);
  assert.match(stub, /export const pushAvailable = false/);
  assert.match(native, /getExpoPushTokenAsync/);
  assert.match(cron, /newScents/);
  assert.match(cron, /classSeats/);
});

test("Sign in with Apple is available on iOS and guest orders do not require auth", () => {
  const profile = read("candle-garden-mobile/screens/ProfileScreen.js");
  const api = read("candle-garden-mobile/lib/apiClient.js");
  const orders = read("candle-garden-web/src/app/orders/route.ts");
  const auth = read("candle-garden-web/src/lib/mobile-auth.ts");
  assert.match(profile, /AppleAuthenticationButton/);
  assert.match(api, /listOrders\(\) \{/);
  assert.match(api, /requireAuth: false/);
  assert.match(api, /X-Device-Id/);
  assert.match(orders, /mobileCustomerId/);
  assert.match(auth, /guest:\$\{device\}/);
});

test("shop search, popular row, product detail, and live catalog refresh are present", () => {
  const products = read("candle-garden-mobile/screens/ProductsScreen.js");
  const details = read("candle-garden-mobile/components/ProductDetails.js");
  const home = read("candle-garden-mobile/screens/HomeScreen.js");
  const catalog = read("candle-garden-mobile/lib/shopCatalog.js");
  const classes = read("candle-garden-mobile/lib/classesCatalog.js");
  const schedule = read("candle-garden-mobile/screens/ClassScheduleScreen.js");
  const app = read("candle-garden-mobile/App.js");
  assert.match(products, /Search scents, notes or sizes/);
  assert.match(products, /Most popular/);
  assert.match(details, /Scent notes/);
  assert.match(home, /Map and directions/);
  assert.match(home, /Buy a Candle Garden gift card/);
  assert.match(catalog, /api\/mobile\/catalog/);
  assert.match(classes, /api\/mobile\/classes/);
  assert.match(schedule, /Retry/);
  assert.match(schedule, /Looking up upcoming classes/);
  assert.match(app, /const \[ready\] = React.useState\(true\)/);
  assert.match(app, /checkForUpdateAsync/);
});
