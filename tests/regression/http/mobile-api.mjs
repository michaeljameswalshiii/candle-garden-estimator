import fs from "node:fs";
import path from "node:path";
import { apiBase, collect, ROOT } from "../helpers.mjs";

const FIXTURE = path.join(ROOT, "candle-garden-mobile/assets/lifestyle/red-currant.jpg");
const ATLANTIC_BEACH = "65faf809b85f1d19a61c8374";

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": "regression-suite",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { response, json, text };
}

export async function runMobileApi(base = apiBase()) {
  const report = collect();

  const orders = await fetch(`${base}/orders`, {
    headers: { "x-device-id": "regression-suite" },
    signal: AbortSignal.timeout(20_000),
  }).catch((error) => ({ ok: false, status: 0, error }));
  const orderStatus = orders.status || 0;
  report.check(
    "GET /orders without JWT",
    orderStatus === 401 || orderStatus === 403,
    `expected 401/403, got ${orderStatus}`,
  );

  const sheet = await post(`${base}/payments/payment-sheet`, {
    items: [{ productId: ATLANTIC_BEACH, quantity: 1, size: "10oz" }],
    email: "regression@thecandlegarden.co",
    name: "Regression Suite",
  });
  report.check(
    "POST /payments/payment-sheet",
    sheet.response.ok && Boolean(sheet.json.paymentIntentClientSecret),
    sheet.json.error || `HTTP ${sheet.response.status}`,
  );
  if (sheet.response.ok) {
    report.check(
      "payment sheet amount",
      sheet.json.amount === 3500,
      `expected 3500 cents, got ${sheet.json.amount}`,
    );
    report.check(
      "payment sheet is test mode client secret",
      String(sheet.json.paymentIntentClientSecret || "").includes("_secret_"),
    );
  }

  const quote = await post(`${base}/payments/shipping-quote`, {
    ounces: 10,
    destZip: "32250",
    methods: ["ship_own", "prepaid_labels", "kit_roundtrip"],
  });
  report.check(
    "POST /payments/shipping-quote",
    quote.response.ok && quote.json.ok !== false,
    quote.json.error || `HTTP ${quote.response.status}`,
  );
  if (quote.response.ok && Array.isArray(quote.json.quotes)) {
    report.check("shipping quote returns three methods", quote.json.quotes.length >= 3);
  }

  const jpeg = fs.readFileSync(FIXTURE).toString("base64");
  const detect = await post(`${base}/detect`, { image: jpeg });
  report.check(
    "POST /detect",
    detect.response.ok,
    detect.json.error || detect.json.message || `HTTP ${detect.response.status}`,
  );
  if (detect.response.ok) {
    report.check("detect JSON", typeof detect.json.success === "boolean");
    report.check("detect does not 500-invent a quote", detect.json.error !== "internal");
    if (detect.json.container_detected) {
      const ounces = Number(
        detect.json.total_wax_needed_oz || detect.json.estimated_ounces || detect.json.wax_needed_oz,
      );
      report.check("detect ounces", Number.isFinite(ounces) && ounces > 0, `ounces=${ounces}`);
      report.note(`Vision detected a vessel at ${ounces} oz (confidence ${detect.json.confidence}).`);
    } else {
      report.check(
        "detect fail-closed tips",
        Array.isArray(detect.json.tips) && detect.json.tips.length >= 1,
      );
      report.note("Vision did not detect a vessel; fail-closed tips were returned.");
    }
  }

  return report.result({ surface: "mobile-api", base });
}

if (process.argv[1]?.endsWith("mobile-api.mjs")) {
  const result = await runMobileApi();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
