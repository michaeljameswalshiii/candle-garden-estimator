import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanText, SHOP_ORIGIN, USER_AGENT } from "../../packages/catalog/squarespace-public.mjs";

const catalogDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages/catalog");

async function fetchJson(pathname) {
  const url = new URL(pathname, SHOP_ORIGIN);
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${pathname} ${response.status}`);
  return response.json();
}

const [privacy, terms, story, home] = await Promise.all([
  fetchJson("/privacy-policy"),
  fetchJson("/terms-of-service"),
  fetchJson("/my-story"),
  fetchJson("/"),
]);

const pages = {
  capturedAt: new Date().toISOString(),
  containsCustomerData: false,
  urls: {
    home: `${SHOP_ORIGIN}/`,
    shop: `${SHOP_ORIGIN}/shop`,
    classes: `${SHOP_ORIGIN}/candle-garden-events`,
    support: `${SHOP_ORIGIN}/get-in-touch`,
    story: `${SHOP_ORIGIN}/my-story`,
    giftCard: `${SHOP_ORIGIN}/giftcard`,
    privacy: `${SHOP_ORIGIN}/privacy-policy`,
    terms: `${SHOP_ORIGIN}/terms-of-service`,
  },
  privacy: {
    title: privacy.collection?.title || "Privacy Policy",
    seo: privacy.collection?.seoData || null,
    text: cleanText(privacy.mainContent || privacy.collection?.body || ""),
  },
  terms: {
    title: terms.collection?.title || "Terms of Service",
    seo: terms.collection?.seoData || null,
    text: cleanText(terms.mainContent || terms.collection?.body || ""),
  },
  story: {
    title: story.collection?.title || "My Story",
    text: cleanText(story.mainContent || "").slice(0, 4000),
  },
  announcement: cleanText(home.websiteSettings?.announcementBarSettings?.text || ""),
};

await mkdir(catalogDir, { recursive: true });
await writeFile(path.join(catalogDir, "site-pages.json"), `${JSON.stringify(pages, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      privacyChars: pages.privacy.text.length,
      termsChars: pages.terms.text.length,
      announcement: pages.announcement,
      urls: pages.urls,
    },
    null,
    2,
  ),
);
