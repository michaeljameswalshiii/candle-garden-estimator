import { loadRecord } from "@/lib/admin/store";
import { getProductCatalog, listJobRuns } from "@/lib/jobs/product-refresh";
import { getClassCatalog } from "@/lib/jobs/class-refresh";
import { squarespaceApiConfigured, SQUARESPACE_USER_AGENT } from "@/lib/squarespace/client";
import { loadSquarespaceCredentials } from "@/lib/squarespace/credentials";

export type IntegrationStatus = "Connected" | "Live" | "Needs key" | "Needs OAuth" | "Needs reporting" | "Needs connection";

export type Integration = {
  id: string;
  group: string;
  label: string;
  detail: string;
  endpoint?: string;
  status: IntegrationStatus;
  note?: string;
};

type Probe = { ok: boolean; status: number };

async function probe(url: string): Promise<Probe> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": SQUARESPACE_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function env(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function listIntegrations(): Promise<{ integrations: Integration[]; checkedAt: string }> {
  const [shop, events, catalog, classes, runs, webhookEvents, creds, commerceKey] = await Promise.all([
    probe("https://www.thecandlegarden.co/shop?format=json"),
    probe("https://www.thecandlegarden.co/candle-garden-events?format=json"),
    getProductCatalog().catch(() => []),
    getClassCatalog().catch(() => []),
    listJobRuns().catch(() => []),
    loadRecord<Array<{ topic?: string; receivedAt?: string }>>("squarespace-webhook-events", []),
    loadSquarespaceCredentials(),
    squarespaceApiConfigured(),
  ]);

  const webhook = Boolean(creds.webhookSecret);
  const lastProduct = runs.find((run) => run.jobId === "product-refresh");
  const lastClass = runs.find((run) => run.jobId === "class-refresh");
  const lastWebhook = webhookEvents[0];

  const integrations: Integration[] = [
    {
      id: "sq-public-shop",
      group: "Squarespace shop",
      label: "Public shop catalog JSON",
      detail: "Product, variant, SKU, price, size, and subscription export from /shop?format=json",
      endpoint: "https://www.thecandlegarden.co/shop?format=json",
      status: shop.ok ? "Live" : "Needs connection",
      note: shop.ok ? `${catalog.length} products in the mobile catalog` : `Shop JSON returned ${shop.status || "no response"}`,
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
      status: catalog.length ? "Live" : "Needs connection",
      note: `${catalog.length} products · ${catalog.reduce((count, product) => count + (product.variants?.length || 0), 0)} variants`,
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
      status: classes.length ? "Live" : "Needs connection",
      note: lastClass?.message || `${classes.length} upcoming classes`,
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
      id: "orders-db",
      group: "App backend",
      label: "Orders database",
      detail: "DynamoDB order history for the mobile admin desk",
      status: env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY") ? "Connected" : "Needs key",
    },
    {
      id: "cognito",
      group: "App backend",
      label: "Customer accounts",
      detail: "Amazon Cognito authentication",
      status: env("AWS_ACCESS_KEY_ID") && env("AWS_SECRET_ACCESS_KEY") ? "Connected" : "Needs key",
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
      detail: "Lowest-cost available UPS refill shipping quotes on the app backend",
      status: env("UPS_CLIENT_ID") || env("UPS_ACCESS_LICENSE") || env("UPS_ACCOUNT_NUMBER") ? "Connected" : "Needs reporting",
      note: env("UPS_CLIENT_ID")
        ? "Live UPS rates select the least-expensive eligible service. Ground Saver will appear automatically once UPS enables it on the account."
        : "Native refill shipping is separate from Squarespace product shipping",
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
      detail: "Vercel Cron for product and class sync",
      status: env("CRON_SECRET") ? "Connected" : "Needs key",
    },
    {
      id: "universal-links",
      group: "App publishing",
      label: "iOS Universal Links",
      detail: "apple-app-site-association for checkout return",
      endpoint: "/.well-known/apple-app-site-association",
      status: env("APPLE_TEAM_ID") ? "Connected" : "Needs key",
      note: env("APPLE_TEAM_ID") ? "APPLE_TEAM_ID is set" : "Add APPLE_TEAM_ID so the AASA file includes the app ID",
    },
    {
      id: "app-links",
      group: "App publishing",
      label: "Android App Links",
      detail: "assetlinks.json for checkout return",
      endpoint: "/.well-known/assetlinks.json",
      status: env("ANDROID_SHA256_CERT_FINGERPRINTS") ? "Connected" : "Needs key",
    },
    {
      id: "analytics",
      group: "App publishing",
      label: "App analytics",
      detail: "Screens, sessions, funnels, retention",
      status: "Needs connection",
    },
    {
      id: "stores",
      group: "App publishing",
      label: "Store downloads",
      detail: "Apple App Store and Google Play",
      status: "Needs connection",
    },
    {
      id: "push",
      group: "App publishing",
      label: "Push notifications",
      detail: "Delivery, opens, and failures",
      status: "Needs reporting",
    },
  ];

  return { integrations, checkedAt: new Date().toISOString() };
}
