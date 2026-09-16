import { NextResponse } from "next/server";
import rawCapture from "../../../../../../packages/catalog/commerce-capture.json";
import { getCommerceCapture, getProductCatalog } from "@/lib/jobs/product-refresh";
import { squarespaceApiConfigured } from "@/lib/squarespace/client";
import { loadSquarespaceCredentials } from "@/lib/squarespace/credentials";

export const dynamic = "force-dynamic";

const APP_ORIGIN = "https://candle-garden-web.vercel.app";
const SITE_ORIGIN = "https://www.thecandlegarden.co";

export async function GET() {
  const live = await getCommerceCapture();
  const capture = live || (rawCapture as unknown as NonNullable<typeof live>);
  const products = await getProductCatalog();
  const creds = await loadSquarespaceCredentials();

  return NextResponse.json(
    {
      plan: {
        name: "Squarespace Commerce Advanced",
        billing: "monthly",
        amountUsd: 65,
        renewsOn: "2026-10-01",
        apis: ["Orders", "Inventory", "Transactions", "Products", "Contacts", "Discounts", "Webhooks"],
        upgradeRequired: false,
      },
      credentials: {
        apiKeyConfigured: await squarespaceApiConfigured(),
        webhookSecretConfigured: Boolean(creds.webhookSecret),
        websiteId: creds.websiteId || "65fae805de7d9316f58ac65f",
        storePageId: "65faf809b85f1d19a61c8359",
      },
      catalog: {
        productCount: products.length,
        variantCount: products.reduce((count, product) => count + (product.variants?.length || 0), 0),
        source: capture && "source" in capture ? capture.source : "bundled-snapshot",
      },
      merchandising: capture?.merchandising || null,
      policies: capture?.policies || null,
      website: capture?.website || null,
      categories: capture?.categories || [],
      urls: {
        shop: `${SITE_ORIGIN}/shop`,
        classes: `${SITE_ORIGIN}/candle-garden-events`,
        support: `${SITE_ORIGIN}/get-in-touch`,
        story: `${SITE_ORIGIN}/my-story`,
        privacy: `${SITE_ORIGIN}/privacy-policy`,
        terms: `${SITE_ORIGIN}/terms-of-service`,
        appPrivacy: `${APP_ORIGIN}/privacy`,
        appTerms: `${APP_ORIGIN}/terms`,
        accountDeletion: `${APP_ORIGIN}/privacy/data-deletion`,
        catalogApi: `${APP_ORIGIN}/api/mobile/catalog`,
        classesApi: `${APP_ORIGIN}/api/mobile/classes`,
        commerceApi: `${APP_ORIGIN}/api/mobile/commerce`,
        squarespaceWebhook: `${APP_ORIGIN}/api/webhooks/squarespace`,
        checkoutReturn: `${APP_ORIGIN}/app/return`,
      },
      checkout: {
        nativeShop: "In-app cart pays with Stripe. Product rows use Squarespace product/variant IDs and SKUs.",
        squarespaceWeb: "View on site opens the Squarespace product URL. After web checkout, return to /app/return which deep-links into the Orders tab.",
        desiredReturn: "candlegarden://orders",
        universalLinkReturn: `${APP_ORIGIN}/app/return?destination=orders`,
        classBooking: "Classes open Acuity/Squarespace scheduling; they are not charged through the native Stripe cart.",
        shippingPhoneRequired: true,
        billingPhoneRequired: true,
        freeShippingAnnouncement: "Free Shipping over $50!",
      },
      capturedAt: capture?.capturedAt || null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
