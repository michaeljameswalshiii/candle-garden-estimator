import type { CatalogProduct } from "@/lib/squarespace/types";

export type CommerceCapture = {
  capturedAt: string;
  containsCustomerData: boolean;
  containsOrderHistory: boolean;
  website: Record<string, unknown>;
  storePage: Record<string, unknown>;
  merchandising: Record<string, unknown>;
  policies: Record<string, unknown>;
  categories: Array<{ id: string; name: string; slug: string; path: string }>;
  notes?: Record<string, string>;
  source?: string;
  productCount?: number;
  variantCount?: number;
  refreshedAt?: string;
};

type PublicCatalogModule = {
  fetchPublicCatalog: () => Promise<{
    products: CatalogProduct[];
    capture: CommerceCapture;
    source: string;
  }>;
};

export async function fetchPublicShopCatalog() {
  const mod = (await import("../../../../packages/catalog/squarespace-public.mjs")) as PublicCatalogModule;
  return mod.fetchPublicCatalog();
}
