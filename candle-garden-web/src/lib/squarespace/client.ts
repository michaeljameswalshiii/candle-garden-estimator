import { loadSquarespaceCredentials } from "@/lib/squarespace/credentials";

const API_ORIGIN = "https://api.squarespace.com";
export const SQUARESPACE_USER_AGENT = "CandleGardenMobileSync/1.0 (+https://candle-garden-web.vercel.app)";

export type SquarespaceInventoryItem = {
  variantId: string;
  sku?: string;
  quantity?: number;
  isUnlimited?: boolean;
};

export type SquarespaceApiProduct = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  variants?: Array<{
    id?: string;
    sku?: string;
    pricing?: { basePrice?: { value?: number }; salePrice?: { value?: number }; onSale?: boolean };
    stock?: { quantity?: number; unlimited?: boolean };
    attributes?: Record<string, string>;
  }>;
};

async function commerceToken() {
  const creds = await loadSquarespaceCredentials();
  return creds.apiKey || creds.oauthAccessToken || "";
}

export async function squarespaceApiConfigured() {
  return Boolean(await commerceToken());
}

async function squarespaceRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const key = token || (await commerceToken());
  if (!key) throw new Error("SQUARESPACE_API_KEY is not configured");
  const response = await fetch(`${API_ORIGIN}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "User-Agent": SQUARESPACE_USER_AGENT,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Squarespace ${path} returned ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  return response.json() as Promise<T>;
}

async function squarespaceGet<T>(path: string): Promise<T> {
  return squarespaceRequest<T>(path);
}

export async function verifyCommerceToken(token: string) {
  return squarespaceRequest<{ id?: string; title?: string; siteId?: string }>("/1.0/authorization/website", {}, token);
}

export async function createOrderWebhook(oauthAccessToken: string, endpointUrl: string) {
  return squarespaceRequest<{
    id?: string;
    secret?: string;
    websiteId?: string;
    endpointUrl?: string;
    topics?: string[];
  }>(
    "/1.0/webhook_subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        endpointUrl,
        topics: ["order.create", "order.update"],
      }),
    },
    oauthAccessToken,
  );
}

async function paginate<T>(path: string, listKey: "products" | "inventory" | "result"): Promise<T[]> {
  const rows: T[] = [];
  let cursor = "";
  for (let page = 0; page < 40; page += 1) {
    const url = cursor ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : path;
    const payload = (await squarespaceGet<{
      pagination?: { hasNextPage?: boolean; nextPageCursor?: string };
      products?: T[];
      inventory?: T[];
      result?: T[];
    }>(url)) as Record<string, unknown>;
    const batch = (payload[listKey] as T[] | undefined) || [];
    rows.push(...batch);
    const pagination = payload.pagination as { hasNextPage?: boolean; nextPageCursor?: string } | undefined;
    if (!pagination?.hasNextPage || !pagination.nextPageCursor) break;
    cursor = pagination.nextPageCursor;
  }
  return rows;
}

export async function listCommerceProducts() {
  return paginate<SquarespaceApiProduct>("/v2/commerce/products", "products");
}

export async function listInventory() {
  return paginate<SquarespaceInventoryItem>("/1.0/commerce/inventory", "inventory");
}

export async function listDiscounts() {
  try {
    const payload = await squarespaceGet<{ discounts?: Array<Record<string, unknown>> }>("/v1/commerce/discounts");
    return payload.discounts || [];
  } catch {
    return [];
  }
}

export function applyInventory(
  products: Array<{
    variants?: Array<{ id: string; sku?: string; soldOut: boolean; unlimited?: boolean; quantity?: number | null }>;
    soldOut: boolean;
  }>,
  inventory: SquarespaceInventoryItem[],
) {
  const byVariant = new Map(inventory.map((row) => [row.variantId, row]));
  for (const product of products) {
    if (!product.variants?.length) continue;
    for (const variant of product.variants) {
      const stock = byVariant.get(variant.id);
      if (!stock) continue;
      variant.unlimited = Boolean(stock.isUnlimited);
      variant.quantity = stock.isUnlimited ? null : Math.max(0, Number(stock.quantity || 0));
      variant.soldOut = variant.unlimited ? false : Number(variant.quantity || 0) < 1;
      if (stock.sku) variant.sku = stock.sku;
    }
    product.soldOut = product.variants.every((variant) => variant.soldOut);
  }
  return products;
}
