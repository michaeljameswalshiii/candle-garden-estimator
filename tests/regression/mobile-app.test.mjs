import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

const mobile = path.join(ROOT, "candle-garden-mobile");
const app = fs.readFileSync(path.join(mobile, "App.js"), "utf8");

const TABS = [
  ["Home", "HomeScreen.js", "The Candle Garden App"],
  ["Estimator", "EstimatorScreen.js", "Refill Estimator"],
  ["Products", "ProductsScreen.js", "Shop"],
  ["Orders", "OrdersScreen.js", "Cart"],
  ["Classes", "ClassScheduleScreen.js", "Classes"],
  ["Profile", "ProfileScreen.js", "Profile"],
];

test("the app still exposes the six customer tabs", () => {
  for (const [route, file, title] of TABS) {
    assert.match(app, new RegExp(`name="${route}"`));
    assert.match(app, new RegExp(`title: '${title}'`));
    assert.equal(fs.existsSync(path.join(mobile, "screens", file)), true, file);
  }
});

test("estimator screen still quotes from pricing.js and can fall back to manual ounces", () => {
  const source = fs.readFileSync(path.join(mobile, "screens", "EstimatorScreen.js"), "utf8");
  assert.match(source, /isAcceptableDetection/);
  assert.match(source, /calculateCost/);
  assert.match(source, /quoteAllMethods/);
  assert.match(source, /showManualEntry/);
  assert.match(source, /postDetect/);
  assert.match(source, /addItem\(/);
});

test("shop adds catalog items to the in-app cart and blocks sold-out products", () => {
  const source = fs.readFileSync(path.join(mobile, "screens", "ProductsScreen.js"), "utf8");
  assert.match(source, /filterProducts/);
  assert.match(source, /handleAddToCart/);
  assert.match(source, /product\.soldOut/);
  assert.match(source, /addItem\(product/);
  assert.match(source, /60 \* 60 \* 1000/);
});

test("classes book into the app cart, not the paused Acuity scheduler", () => {
  const classes = fs.readFileSync(path.join(mobile, "screens", "ClassScheduleScreen.js"), "utf8");
  const catalog = fs.readFileSync(path.join(mobile, "lib", "classesCatalog.js"), "utf8");
  const scheduling = fs.readFileSync(path.join(mobile, "lib", "schedulingConfig.js"), "utf8");
  const webview = fs.readFileSync(path.join(mobile, "components", "AcuityScheduler.native.js"), "utf8");
  assert.match(classes, /getUpcomingClasses/);
  assert.match(classes, /type: 'class'/);
  assert.match(classes, /60 \* 60 \* 1000/);
  assert.match(catalog, /thecandlegarden\.co\/candle-garden-events/);
  assert.match(scheduling, /Live booking is Squarespace Commerce/);
  assert.match(scheduling, /BOOKING_PAGE_URL = CLASSES_PAGE_URL/);
  assert.match(webview, /BLOCKED = \['acuityscheduling\.com'/);
  assert.match(webview, /thecandlegarden\.co/);
  assert.doesNotMatch(classes, /AcuityScheduler/);
});

test("cart line keys keep refill, class, and product lines distinct", () => {
  function lineKey(item) {
    const type = item.type || "product";
    if (type === "refill") {
      return `refill::${Number(item.ounces || 0).toFixed(1)}::${item.boxKey || "box"}::${item.shippingMethod || "ship_own"}::${item.destZip || ""}`;
    }
    if (type === "class") return `class::${item.productId}`;
    return `product::${item.productId}::${item.size || "default"}`;
  }
  const source = fs.readFileSync(path.join(mobile, "lib", "cart.js"), "utf8");
  assert.match(source, /function lineKey\(item\)/);
  assert.match(source, /CART_KEY = 'cg_cart_v1'/);
  assert.equal(
    lineKey({ type: "refill", ounces: 10, boxKey: "ups_small", shippingMethod: "ship_own", destZip: "32250" }),
    "refill::10.0::ups_small::ship_own::32250",
  );
  assert.equal(lineKey({ type: "class", productId: "class-1" }), "class::class-1");
  assert.notEqual(
    lineKey({ productId: "p1", size: "10oz" }),
    lineKey({ productId: "p1", size: "18oz" }),
  );
});

test("checkout talks to the live API with a test Stripe publishable key", () => {
  const stripe = fs.readFileSync(path.join(mobile, "lib", "stripeConfig.js"), "utf8");
  const cognito = fs.readFileSync(path.join(mobile, "lib", "cognitoConfig.js"), "utf8");
  const api = fs.readFileSync(path.join(mobile, "lib", "apiClient.js"), "utf8");
  const orders = fs.readFileSync(path.join(mobile, "screens", "OrdersScreen.js"), "utf8");
  const payments = fs.readFileSync(
    path.join(ROOT, "candle-saas-cdk/lambda_functions/payment_processor/index.py"),
    "utf8",
  );
  assert.match(stripe, /pk_test_/);
  assert.match(cognito, /execute-api\.us-east-1\.amazonaws\.com\/prod/);
  assert.match(api, /X-Device-Id/);
  assert.match(api, /createStripePaymentSheet/);
  assert.match(api, /finalizeStripePayment/);
  assert.match(orders, /initPaymentSheet/);
  assert.match(orders, /presentPaymentSheet/);
  assert.match(orders, /Test checkout with Stripe|checkingOut|paymentIntentClientSecret/);
  assert.match(payments, /sk_live_/);
  assert.match(payments, /STRIPE_LIVE_ENABLED/);
});
