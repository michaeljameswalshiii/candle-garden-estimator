/**
 * Public Squarespace shop capture (no customer or order data).
 * Uses collection ?format=json, which includes product IDs, variants, SKUs,
 * prices, sizes, inventory flags, subscription plans, images, and store settings.
 */
export const SHOP_ORIGIN = "https://www.thecandlegarden.co";
export const USER_AGENT = "CandleGardenCatalogAgent/1.0 (+https://candle-garden-web.vercel.app)";
export const WEBSITE_ID = "65fae805de7d9316f58ac65f";
export const STORE_PAGE_ID = "65faf809b85f1d19a61c8359";

export const KNOWN_CATEGORY_PATHS = [
  "/shop",
  "/shop/classic",
  "/shop/fall",
  "/shop/summer",
  "/shop/spring",
  "/shop/subscription-boxes",
];

const CATEGORY_SLUG_ALIASES = {
  "subscription-boxes": "subscription",
};

export function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function moneyValue(variant) {
  const saleOn = Boolean(variant?.onSale);
  const sale = Number(variant?.salePriceMoney?.value ?? (Number(variant?.salePrice || 0) / 100));
  const base = Number(variant?.priceMoney?.value ?? (Number(variant?.price || 0) / 100));
  const price = saleOn && Number.isFinite(sale) && sale > 0 ? sale : base;
  return Number.isFinite(price) ? Math.round(price * 100) / 100 : 0;
}

export function variantSoldOut(variant) {
  if (!variant) return true;
  if (variant.unlimited) return false;
  return Number(variant.qtyInStock || 0) < 1;
}

export function sizeFromVariant(variant) {
  const attributes = variant?.attributes && typeof variant.attributes === "object" ? variant.attributes : {};
  return (
    attributes.Size ||
    attributes.size ||
    variant?.optionValues?.find((option) => /size/i.test(String(option.optionName || "")))?.value ||
    ""
  );
}

function subscriptionFrom(item, variant) {
  const option =
    variant?.pricingOptions?.find((row) => row?.subscriptionPlan) ||
    item?.productSubscriptionOptions?.[0] ||
    null;
  const plan = option?.subscriptionPlan || item?.subscriptionPlan || variant?.pricingOptions?.[0]?.subscriptionPlan;
  if (!plan && !item?.isSubscribable) return null;
  if (!plan) return { subscribable: Boolean(item?.isSubscribable) };
  return {
    subscribable: true,
    optionId: option?.productSubscriptionOptionId || option?.id || null,
    planVersionId: plan.planVersionId || null,
    intervalValue: Number(plan.billingPeriod?.value || 1),
    intervalUnit: String(plan.billingPeriod?.unit || "MONTH").toLowerCase(),
    billingCycles: plan.numBillingCycles == null ? null : Number(plan.numBillingCycles),
  };
}

export function normalizeCategorySlug(slug) {
  const short = String(slug || "")
    .replace(/^\/shop\//, "")
    .replace(/^\//, "")
    .trim()
    .toLowerCase();
  return CATEGORY_SLUG_ALIASES[short] || short;
}

export function mapPublicProduct(item, categoryById = new Map()) {
  const structured = item?.structuredContent && typeof item.structuredContent === "object" ? item.structuredContent : item;
  const variantsRaw = Array.isArray(structured?.variants)
    ? structured.variants
    : Array.isArray(item?.variants)
      ? item.variants
      : [];
  const variants = variantsRaw.map((variant) => {
    const price = moneyValue(variant);
    const size = sizeFromVariant(variant);
    const soldOut = variantSoldOut(variant);
    return {
      id: String(variant.id || ""),
      sku: String(variant.sku || ""),
      size: size || null,
      price,
      onSale: Boolean(variant.onSale),
      soldOut,
      unlimited: Boolean(variant.unlimited),
      quantity: variant.unlimited ? null : Math.max(0, Number(variant.qtyInStock || 0)),
      weight: variant.weight == null ? null : Number(variant.weight),
      width: variant.width == null ? null : Number(variant.width),
      height: variant.height == null ? null : Number(variant.height),
      length: variant.len == null ? null : Number(variant.len),
      attributes: variant.attributes && typeof variant.attributes === "object" ? variant.attributes : {},
      subscription: subscriptionFrom(structured, variant),
    };
  });
  const prices = variants.map((variant) => variant.price).filter((price) => price > 0);
  const sizes = [...new Set(variants.map((variant) => variant.size).filter(Boolean))];
  const categoryIds = Array.isArray(item.categoryIds) ? item.categoryIds : [];
  const categories = [
    ...new Set(categoryIds.map((id) => categoryById.get(String(id))).filter(Boolean)),
  ];
  const gallery = Array.isArray(item.items)
    ? item.items
        .filter((row) => row?.recordTypeLabel === "image" || row?.contentType?.startsWith("image/"))
        .map((row) => String(row.assetUrl || "").replace(/^http:/, "https:"))
        .filter(Boolean)
    : [];
  const image = String(item.assetUrl || gallery[0] || "").replace(/^http:/, "https:");
  const path = String(item.fullUrl || `/shop/p/${item.urlId || item.id}`);
  const url = new URL(path, SHOP_ORIGIN).toString();
  const subscription = variants.find((variant) => variant.subscription?.subscribable)?.subscription || null;
  const soldOut = variants.length > 0 ? variants.every((variant) => variant.soldOut) : false;

  return {
    id: String(item.id || ""),
    name: cleanText(item.title) || String(item.urlId || item.id || "Untitled"),
    sku: variants.map((variant) => variant.sku).filter(Boolean)[0] || "",
    price: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    soldOut,
    description: cleanText(item.excerpt || item.body || ""),
    image,
    images: [...new Set([image, ...gallery].filter(Boolean))],
    url,
    urlId: String(item.urlId || ""),
    sizes,
    categories: categories.length ? categories : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    type: path.includes("/giftcard/") ? "gift_card" : subscription ? "subscription" : "physical",
    isSubscribable: Boolean(subscription),
    subscription,
    variants,
    updatedOn: item.updatedOn ? new Date(item.updatedOn).toISOString() : null,
  };
}

function categoryMapFrom(payload) {
  const map = new Map();
  const nested = payload?.nestedCategories?.categories;
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (node?.id) map.set(String(node.id), normalizeCategorySlug(node.shortSlug || node.fullSlug || node.displayName));
      walk(node.children);
    }
  };
  walk(nested);
  return map;
}

export function extractStoreCapture(payload) {
  const website = payload?.website || {};
  const settings = payload?.websiteSettings || {};
  const store = settings.storeSettings || {};
  const collection = payload?.collection || {};
  const location = website.location || {};
  return {
    capturedAt: new Date().toISOString(),
    containsCustomerData: false,
    containsOrderHistory: false,
    website: {
      id: website.id || WEBSITE_ID,
      title: website.siteTitle || "The Candle Garden",
      primaryDomain: website.primaryDomain || "www.thecandlegarden.co",
      authenticUrl: website.authenticUrl || SHOP_ORIGIN,
      identifier: website.identifier || null,
      language: website.language || "en-US",
      timeZone: website.timeZone || "America/New_York",
      location: {
        title: location.addressTitle || "The Candle Garden",
        line1: location.addressLine1 || "363 Atlantic Boulevard Suite 8",
        line2: location.addressLine2 || "Atlantic Beach, FL, 32233",
        country: location.addressCountry || "United States",
        lat: location.mapLat ?? 30.325117,
        lng: location.mapLng ?? -81.3984905,
      },
      social: (website.socialAccounts || []).map((account) => ({
        service: account.serviceName || account.screenname,
        url: account.profileUrl,
      })),
      contactEmail: settings.contactEmail || "jordan@thecandlegarden.co",
      contactPhone: settings.contactPhoneNumber || "904-316-7608",
      businessHours: settings.businessHours || null,
    },
    storePage: {
      id: collection.id || STORE_PAGE_ID,
      title: collection.title || "Shop",
      url: collection.fullUrl || "/shop",
      itemCount: collection.itemCount ?? null,
    },
    merchandising: {
      announcementBar: cleanText(settings.announcementBarSettings?.text || ""),
      customSoldOutText: store.merchandisingSettings?.customSoldOutText || "Sold Out",
      scarcityEnabled: Boolean(store.merchandisingSettings?.scarcityEnabledOnProductItems),
      scarcityThreshold: store.merchandisingSettings?.scarcityThreshold ?? null,
      relatedProductsEnabled: Boolean(store.merchandisingSettings?.relatedProductsEnabled),
      defaultCurrency: store.defaultCurrency || "USD",
      shippingCountryDefault: store.shippingCountryDefaultValue || "US",
      showShippingPhoneNumber: Boolean(store.showShippingPhoneNumber),
      shippingPhoneRequired: Boolean(store.isShippingPhoneRequired),
      showBillingPhoneNumber: Boolean(store.showBillingPhoneNumber),
      billingPhoneRequired: Boolean(store.isBillingPhoneRequired),
      billToShippingDefault: Boolean(store.billToShippingDefaultValue),
      expressCheckout: Boolean(store.expressCheckout),
      continueShoppingLinkUrl: store.continueShoppingLinkUrl || "/",
      checkoutMarketingOptIn: Boolean(store.checkoutPageMarketingOptInEnabled),
      userAccounts: settings.userAccountsSettings || null,
    },
    policies: {
      returnAndCancellationHtml: store.returnPolicy || "",
      returnAndCancellationText: cleanText(store.returnPolicy || ""),
      termsOfServiceHtml: store.termsOfService || "",
      termsOfServiceText: cleanText(store.termsOfService || ""),
      privacyPolicyHtml: store.privacyPolicy || "",
      privacyPolicyText: cleanText(store.privacyPolicy || ""),
      privacyUrl: `${SHOP_ORIGIN}/privacy-policy`,
      termsUrl: `${SHOP_ORIGIN}/terms-of-service`,
      supportUrl: `${SHOP_ORIGIN}/get-in-touch`,
      classesUrl: `${SHOP_ORIGIN}/candle-garden-events`,
    },
    categories: (payload?.nestedCategories?.categories || []).map((node) => ({
      id: node.id,
      name: node.displayName,
      slug: normalizeCategorySlug(node.shortSlug || node.fullSlug),
      path: node.fullUrl,
    })),
    notes: {
      giftCards: "Gift-card products, if any, appear in the product export with type gift_card. None are assumed until listed in the catalog.",
      discounts: "Discount codes are not in the public collection JSON. Use the Discounts API with a Commerce API key.",
      tax: "Tax calculation happens on Squarespace checkout. Native app checkout uses Stripe Tax only if configured separately.",
      pickup: "Local pickup is not exposed in the public collection JSON. Confirm in Squarespace Settings > Selling > Shipping.",
      webhooks:
        "Squarespace webhook topics are order.create, order.update, contact.*, address.*, and extension.uninstall. There is no product or inventory topic; inventory is refreshed from the Inventory API and after order webhooks.",
    },
  };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    cache: "no-store",
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

export async function fetchCollection(path, fetchImpl = fetch, offset = 0) {
  const url = new URL(path, SHOP_ORIGIN);
  url.searchParams.set("format", "json");
  if (offset > 0) url.searchParams.set("offset", String(offset));
  return fetchJson(url.toString(), fetchImpl);
}

export async function fetchCollectionPages(path, fetchImpl = fetch) {
  const pages = [];
  const seen = new Set();
  let offset = 0;
  let guard = 0;
  while (guard < 20) {
    const payload = await fetchCollection(path, fetchImpl, offset);
    pages.push(payload);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const storeItems = items.filter(
      (item) => Number(item.recordType) === 11 || item.recordTypeLabel === "store-item" || item.structuredContent,
    );
    const newIds = storeItems.map((item) => String(item.id || "")).filter((id) => id && !seen.has(id));
    for (const id of newIds) seen.add(id);
    offset += items.length || storeItems.length;
    const expected = Number(payload.collection?.itemCount || 0);
    const hasCursor = Boolean(payload.pagination?.nextPage);
    if (storeItems.length === 0 || newIds.length === 0) break;
    if (!hasCursor && !(expected > seen.size && items.length > 0)) break;
    guard += 1;
  }
  return pages;
}

export async function fetchPublicCatalog(fetchImpl = fetch) {
  const shopPages = await fetchCollectionPages("/shop", fetchImpl);
  const shop = shopPages[0] || {};
  const categoryById = categoryMapFrom(shop);
  const byId = new Map();

  const ingest = (payload, fallbackCategory) => {
    const localCategories = categoryMapFrom(payload);
    for (const [id, slug] of localCategories) categoryById.set(id, slug);
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      if (item?.recordTypeLabel && item.recordTypeLabel !== "store-item") continue;
      if (Number(item.recordType) !== 11 && item.recordTypeLabel !== "store-item" && !item.structuredContent) {
        continue;
      }
      const mapped = mapPublicProduct(item, categoryById);
      if (fallbackCategory && !mapped.categories.includes(fallbackCategory)) {
        mapped.categories = [...new Set([...mapped.categories, fallbackCategory])];
      }
      if (!mapped.categories.length) mapped.categories = ["classic"];
      const existing = byId.get(mapped.id);
      if (existing) {
        existing.categories = [...new Set([...existing.categories, ...mapped.categories])];
        continue;
      }
      byId.set(mapped.id, mapped);
    }
  };

  for (const page of shopPages) ingest(page, null);

  const extraCollections = ["/giftcard"];
  const discovered = [
    ...KNOWN_CATEGORY_PATHS,
    ...extraCollections,
    ...(shop.nestedCategories?.categories || []).map((node) => node.fullUrl).filter(Boolean),
  ];
  const uniquePaths = [...new Set(discovered.filter((path) => path && path !== "/shop"))];
  await Promise.all(
    uniquePaths.map(async (path) => {
      try {
        const pages = await fetchCollectionPages(path, fetchImpl);
        const fallback = path === "/giftcard" ? "gift-card" : normalizeCategorySlug(path);
        for (const payload of pages) ingest(payload, fallback);
      } catch {
        // Category pages come and go seasonally.
      }
    }),
  );

  const products = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    products,
    capture: extractStoreCapture(shop),
    source: "squarespace-public-json",
  };
}

function classDate(title) {
  const match = String(title).match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i,
  );
  if (!match) return "";
  const now = new Date();
  let year = now.getUTCFullYear();
  let value = new Date(`${match[1]} ${match[2]}, ${year} 12:00:00 UTC`);
  if (value.getTime() < now.getTime() - 180 * 86400000) {
    value = new Date(`${match[1]} ${match[2]}, ${year + 1} 12:00:00 UTC`);
  }
  return value.toISOString().slice(0, 10);
}

function classTime(title) {
  const match = String(title).match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  return match ? match[1].replace(/\s+/g, "").toUpperCase() : "";
}

export function mapPublicClass(item) {
  const structured = item?.structuredContent && typeof item.structuredContent === "object" ? item.structuredContent : item;
  const variants = Array.isArray(structured?.variants) ? structured.variants : Array.isArray(item.variants) ? item.variants : [];
  const variant = variants[0] || {};
  const title = cleanText(item.title);
  const date = classDate(title);
  const available = variant.unlimited ? null : Math.max(0, Number(variant.qtyInStock || 0));
  const price = moneyValue(variant);
  const path = String(item.fullUrl || "/candle-garden-events");
  return {
    id: String(item.id || ""),
    title: "Candle Making Class",
    scheduleLabel: title,
    date,
    dateDisplay: title.split(/\s+at\s+/i)[0],
    time: classTime(title),
    duration: "About 1 hour",
    price,
    available: available ?? 0,
    soldOut: available != null && available < 1,
    description: cleanText(item.excerpt || item.body).slice(0, 240),
    fullDescription: cleanText(item.body),
    image: String(item.assetUrl || "").replace(/^http:/, "https:"),
    sku: String(variant.sku || ""),
    url: new URL(path, SHOP_ORIGIN).toString(),
    location: "The Candle Garden · Atlantic Beach, FL",
  };
}

export async function fetchPublicClasses(fetchImpl = fetch) {
  const pages = await fetchCollectionPages("/candle-garden-events", fetchImpl);
  const today = new Date().toISOString().slice(0, 10);
  const classes = [];
  const seen = new Set();
  for (const page of pages) {
    for (const item of page.items || []) {
      if (Number(item.recordType) !== 11 && item.recordTypeLabel !== "store-item" && !item.structuredContent) continue;
      const title = cleanText(item.title);
      if (!title || /^test\b/i.test(title) || /private class/i.test(title)) continue;
      const mapped = mapPublicClass(item);
      if (!mapped.date || mapped.date < today || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      classes.push(mapped);
    }
  }
  return classes.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}
