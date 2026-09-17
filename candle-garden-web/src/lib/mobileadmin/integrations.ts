import { loadRecord } from "@/lib/admin/store";
import { getProductCatalog, listJobRuns } from "@/lib/jobs/product-refresh";
import { getClassCatalog } from "@/lib/jobs/class-refresh";
import { squarespaceApiConfigured, SQUARESPACE_USER_AGENT } from "@/lib/squarespace/client";
import { loadSquarespaceCredentials } from "@/lib/squarespace/credentials";

export type IntegrationStatus =
  | "Connected"
  | "Live"
  | "Needs key"
  | "Needs OAuth"
  | "Needs reporting"
  | "Needs connection";

export type Integration = {
  id: string;
  group: string;
  label: string;
  detail: string;
  endpoint?: string;
  status: IntegrationStatus;
  note?: string;
};

type Probe = { ok: boolean; status: number; detail?: string };

const CANDLE_API =
  process.env.CANDLE_SAAS_API_URL?.trim() ||
  "https://ry95dso7lc.execute-api.us-east-1.amazonaws.com/prod";

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://candle-garden-web.vercel.app";

async function probe(url: string, init?: RequestInit): Promise<Probe> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": SQUARESPACE_USER_AGENT, accept: "application/json", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(8_000),
      ...init,
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function probeJson(url: string, init?: RequestInit): Promise<Probe & { body?: unknown }> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": SQUARESPACE_USER_AGENT, accept: "application/json", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(10_000),
      ...init,
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text?.slice(0, 120);
    }
    return { ok: response.ok, status: response.status, body, detail: typeof body === "string" ? body : undefined };
  } catch {
    return { ok: false, status: 0 };
  }
}

function env(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function listIntegrations(): Promise<{ integrations: Integration[]; checkedAt: string }> {
  const origin = SITE_ORIGIN.replace(/\/$/, "");
  const [
    shop,
    events,
    catalog,
    classes,
    runs,
    webhookEvents,
    creds,
    commerceKey,
    detectProxy,
    detectApi,
    saasDetect,
    mobileCatalog,
    mobileClasses,
    aasa,
    assetlinks,
  ] = await Promise.all([
    probe("https://www.thecandlegarden.co/shop?format=json"),
    probe("https://www.thecandlegarden.co/candle-garden-events?format=json"),
    getProductCatalog().catch(() => []),
    getClassCatalog().catch(() => []),
    listJobRuns().catch(() => []),
    loadRecord<Array<{ topic?: string; receivedAt?: string }>>("squarespace-webhook-events", []),
    loadSquarespaceCredentials(),
    squarespaceApiConfigured(),
    probeJson(`${origin}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_base64: "dGVzdA==", content_type: "image/jpeg" }),
    }),
    probeJson(`${origin}/api/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_base64: "dGVzdA==", content_type: "image/jpeg" }),
    }),
    probeJson(`${CANDLE_API}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_base64: "dGVzdA==", content_type: "image/jpeg" }),
    }),
    probeJson(`${origin}/api/mobile/catalog`),
    probeJson(`${origin}/api/mobile/classes`),
    probeJson(`${origin}/.well-known/apple-app-site-association`),
    probeJson(`${origin}/.well-known/assetlinks.json`),
  ]);

  const webhook = Boolean(creds.webhookSecret);
  const lastProduct = runs.find((run) => run.jobId === "product-refresh");
  const lastClass = runs.find((run) => run.jobId === "class-refresh");
  const lastWebhook = webhookEvents[0];

  const detectLive = (probeResult: Probe & { body?: unknown }) => {
    const body = probeResult.body as { error?: string; success?: boolean } | null;
    // Lambda validates payload and returns 400 "image required" when the proxy is healthy.
    if (probeResult.status === 400 && body?.error) return true;
    if (probeResult.ok && body && body.success !== false) return true;
    return false;
  };

  const aasaBody = aasa.body as { applinks?: { details?: unknown[] } } | null;
  const assetBody = assetlinks.body as unknown[] | null;
  const aasaReady = Array.isArray(aasaBody?.applinks?.details) && aasaBody.applinks.details.length > 0;
  const assetReady = Array.isArray(assetBody) && assetBody.length > 0;

  const catalogCount =
    typeof mobileCatalog.body === "object" &&
    mobileCatalog.body &&
    Array.isArray((mobileCatalog.body as { products?: unknown[] }).products)
      ? (mobileCatalog.body as { products: unknown[] }).products.length
      : catalog.length;

  const classCount =
    typeof mobileClasses.body === "object" &&
    mobileClasses.body &&
    Array.isArray((mobileClasses.body as { classes?: unknown[] }).classes)
      ? (mobileClasses.body as { classes: unknown[] }).classes.length
      : classes.length;

  const integrations: Integration[] = [
    {
      id: "sq-public-shop",
      group: "Squarespace shop",
      label: "Public shop catalog JSON",
      detail: "Product, variant, SKU, price, size, and subscription export from /shop?format=json",
      endpoint: "https://www.thecandlegarden.co/shop?format=json",
      status: shop.ok ? "Live" : "Needs connection",
      note: shop.ok ? `${catalogCount} products in the mobile catalog` : `Shop JSON returned ${shop.status || "no response"}`,
    },
    {
      id: "sq-products-api",
      group: "Squarespace shop",
      label: "Products API v2",
      detail: "Official Commerce Products API for IDs, variants, and images",
      endpoint: "https://api.squarespace.com/v2/commerce/products",
      status: commerceKey ? "Connected" : "Needs key",
      note: commerceKey ? "Commerce credential is stored" : "Paste the Developer API key in Connect Squarespace above",
    },
    {
      id: "sq-inventory-api",
      group: "Squarespace shop",
      label: "Inventory API",
      detail: "Live variant stock overlay during product refresh",
      endpoint: "https://api.squarespace.com/1.0/commerce/inventory",
      status: commerceKey ? "Connected" : "Needs key",
      note: lastProduct?.message || "Used when the product refresh job runs",
    },
    {
      id: "sq-discounts-api",
      group: "Squarespace shop",
      label: "Discounts API",
      detail: "Promo codes for consistent mobile checkout messaging",
      endpoint: "https://api.squarespace.com/v1/commerce/discounts",
      status: commerceKey ? "Connected" : "Needs key",
    },
    {
      id: "sq-webhooks",
      group: "Squarespace shop",
      label: "Order webhooks",
      detail: "order.create and order.update refresh inventory after Squarespace sales",
      endpoint: "/api/webhooks/squarespace",
      status: webhook ? "Connected" : "Needs OAuth",
      note: webhook
        ? lastWebhook
          ? `Last event ${lastWebhook.topic || "unknown"} at ${lastWebhook.receivedAt || "unknown"}`
          : "Secret is set; waiting for the first Squarespace notification"
        : "Paste an OAuth access token in Connect Squarespace to create the order webhook",
    },
    {
      id: "mobile-catalog",
      group: "Mobile app APIs",
      label: "Mobile product catalog",
      detail: "JSON the Shop tab loads, including variants and SKUs",
      endpoint: "/api/mobile/catalog",
      status: mobileCatalog.ok && catalogCount > 0 ? "Live" : "Needs connection",
      note: `${catalogCount} products · refreshed via hourly cron + webhooks`,
    },
    {
      id: "mobile-commerce",
      group: "Mobile app APIs",
      label: "Commerce settings",
      detail: "Shipping, cancellation, gift-card, URL, and checkout-handoff copy",
      endpoint: "/api/mobile/commerce",
      status: "Live",
    },
    {
      id: "mobile-classes",
      group: "Classes",
      label: "Mobile class catalog",
      detail: "Public class dates, prices, and booking links",
      endpoint: "/api/mobile/classes",
      status: mobileClasses.ok && classCount > 0 ? "Live" : "Needs connection",
      note: lastClass?.message || `${classCount} upcoming classes`,
    },
    {
      id: "sq-classes",
      group: "Classes",
      label: "Squarespace events JSON",
      detail: "Source for the class refresh agent",
      endpoint: "https://www.thecandlegarden.co/candle-garden-events?format=json",
      status: events.ok ? "Live" : "Needs connection",
    },
    {
      id: "acuity",
      group: "Classes",
      label: "Acuity Scheduling",
      detail: "Embedded class booking (separate Squarespace Scheduling subscription)",
      endpoint: "https://app.acuityscheduling.com/schedule.php?owner=32288720",
      status: "Connected",
      note: "Owner 32288720 · plan must be confirmed independently",
    },
    {
      id: "detect-proxy",
      group: "App backend",
      label: "Estimator detect proxy",
      detail: "Vercel /detect and /api/detect forward to the Bedrock detector Function URL",
      endpoint: "/detect",
      status: env("DETECT_FUNCTION_URL") && (detectLive(detectProxy) || detectLive(detectApi)) ? "Live" : env("DETECT_FUNCTION_URL") ? "Needs connection" : "Needs key",
      note: env("DETECT_FUNCTION_URL")
        ? detectLive(detectProxy) || detectLive(detectApi)
          ? "Proxy reached the detector (validation response)"
          : `Proxy returned HTTP ${detectProxy.status || detectApi.status || 0}`
        : "Set DETECT_FUNCTION_URL on Vercel",
    },
    {
      id: "saas-api",
      group: "App backend",
      label: "Candle SaaS API (no NAT)",
      detail: "Orders, payments, and detect on API Gateway without a VPC NAT bill",
      endpoint: `${CANDLE_API}/detect`,
      status: detectLive(saasDetect) ? "Live" : "Needs connection",
      note: detectLive(saasDetect)
        ? "API Gateway detect is healthy"
        : `Detect returned HTTP ${saasDetect.status || 0}`,
    },
    {
      id: "cognito",
      group: "App backend",
      label: "Customer accounts",
      detail: "Amazon Cognito pool us-east-1_WTA7ZWxcr for app sign-in",
      status: "Connected",
      note: "Pool us-east-1_WTA7ZWxcr · client 19gc38poajblf8qsagv3s93nvu",
    },
    {
      id: "orders-api",
      group: "App backend",
      label: "Orders API",
      detail: "Authenticated order create/list on the Candle SaaS API",
      endpoint: `${CANDLE_API}/orders`,
      status: detectLive(saasDetect) ? "Connected" : "Needs connection",
      note: "Requires Cognito ID token from a signed-in shopper",
    },
    {
      id: "stripe",
      group: "App backend",
      label: "Payments",
      detail: "Stripe checkout, refunds, and payment failures",
      status: env("STRIPE_SECRET_KEY") ? "Connected" : "Needs key",
      note: env("STRIPE_SECRET_KEY") ? "Refunds available from the order desk" : "Add STRIPE_SECRET_KEY for refunds and reporting",
    },
    {
      id: "ups",
      group: "App backend",
      label: "UPS Ground Saver",
      detail: "Lowest-cost available UPS refill shipping quotes",
      endpoint: "/payments/shipping-quote",
      status: env("UPS_CLIENT_ID") && env("UPS_CLIENT_SECRET") && env("UPS_ACCOUNT_NUMBER") ? "Connected" : "Needs key",
      note: env("UPS_CLIENT_ID")
        ? "Live UPS rates select the least-expensive eligible service"
        : "Add UPS_CLIENT_ID, UPS_CLIENT_SECRET, and UPS_ACCOUNT_NUMBER",
    },
    {
      id: "blob",
      group: "App backend",
      label: "Catalog storage",
      detail: "Vercel Blob holds the live product snapshot used by the app",
      status: env("BLOB_READ_WRITE_TOKEN") ? "Connected" : "Needs key",
    },
    {
      id: "cron",
      group: "App backend",
      label: "Scheduled refresh",
      detail: "Hourly Vercel Cron for product (:00) and class (:15) sync",
      status: env("CRON_SECRET") ? "Connected" : "Needs key",
      note: lastProduct ? `Last product job: ${lastProduct.status}` : "Waiting for the next hourly run",
    },
    {
      id: "universal-links",
      group: "App publishing",
      label: "iOS Universal Links",
      detail: "apple-app-site-association for checkout return",
      endpoint: "/.well-known/apple-app-site-association",
      status: aasaReady ? "Connected" : "Needs key",
      note: aasaReady
        ? "AASA details include the app ID"
        : "Set APPLE_TEAM_ID on Vercel (10-character Apple Team ID)",
    },
    {
      id: "app-links",
      group: "App publishing",
      label: "Android App Links",
      detail: "assetlinks.json for checkout return",
      endpoint: "/.well-known/assetlinks.json",
      status: assetReady ? "Connected" : "Needs key",
      note: assetReady
        ? "assetlinks.json has signing fingerprints"
        : "Set ANDROID_SHA256_CERT_FINGERPRINTS on Vercel (Play App Signing cert)",
    },
    {
      id: "analytics",
      group: "App publishing",
      label: "App analytics",
      detail: "Lightweight event log (screens, estimate, add-to-cart) via Expo updates",
      status: "Connected",
      note: "Client analytics module ships with OTA; wire a vendor later if needed",
    },
    {
      id: "stores",
      group: "App publishing",
      label: "Store builds",
      detail: "Apple App Store and Google Play production binaries",
      status: "Connected",
      note: "Runtime 1.1.0 · iOS build 9+ · Android versionCode 4 · OTA channel production",
    },
    {
      id: "push",
      group: "App publishing",
      label: "Push notifications",
      detail: "Delivery, opens, and failures",
      status: "Needs reporting",
      note: "Intentionally deferred for the current store release",
    },
  ];

  return { integrations, checkedAt: new Date().toISOString() };
}
