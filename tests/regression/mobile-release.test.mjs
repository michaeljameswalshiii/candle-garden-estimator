import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

const app = JSON.parse(fs.readFileSync(path.join(ROOT, "candle-garden-mobile/app.json"), "utf8"));
const eas = JSON.parse(fs.readFileSync(path.join(ROOT, "candle-garden-mobile/eas.json"), "utf8"));
const stripePlugin = (app.expo.plugins || []).find(
  (item) => Array.isArray(item) && item[0] === "@stripe/stripe-react-native",
);

test("EAS production submit is pointed at the App Store listing", () => {
  assert.equal(app.expo.extra.eas.projectId, "7769d138-60fb-46b1-92dc-90cdcdac10d3");
  assert.equal(app.expo.ios.bundleIdentifier, "com.michaeljameswalshiii.candlegarden");
  assert.equal(app.expo.android.package, "com.michaeljameswalshiii.candlegarden");
  assert.equal(eas.submit.production.ios.ascAppId, "6792380750");
  assert.equal(eas.build.production.channel, "production");
  assert.match(app.expo.updates.url, /7769d138-60fb-46b1-92dc-90cdcdac10d3/);
  assert.ok(Number(app.expo.ios.buildNumber) >= 1);
});

test("Apple Pay is still disabled in this release", () => {
  assert.equal(app.expo.ios.merchantIdentifier, undefined);
  assert.equal(app.expo.ios.entitlements?.["com.apple.developer.in-app-payments"], undefined);
  assert.ok(stripePlugin, "Stripe native plugin missing");
  assert.equal(stripePlugin[1].enableGooglePay, true);
  assert.equal(stripePlugin[1].merchantIdentifier, undefined);
});

test("App Store listing is public when REQUIRE_APP_STORE_RELEASE is enabled", async () => {
  const byId = await fetch("https://itunes.apple.com/lookup?id=6792380750").then((res) => res.json());
  const byBundle = await fetch(
    "https://itunes.apple.com/lookup?bundleId=com.michaeljameswalshiii.candlegarden",
  ).then((res) => res.json());
  const released = (byId.resultCount || 0) + (byBundle.resultCount || 0) > 0;
  if (process.env.REQUIRE_APP_STORE_RELEASE === "true") {
    assert.equal(
      released,
      true,
      "Apple public catalog has no listing. Release the approved build for sale in App Store Connect.",
    );
  }
});

test("Expo Updates endpoint for the EAS project responds", async () => {
  const response = await fetch(app.expo.updates.url, {
    headers: { "expo-protocol-version": "1" },
  });
  assert.ok(
    response.status < 500,
    `Expo Updates HTTP ${response.status}`,
  );
});
