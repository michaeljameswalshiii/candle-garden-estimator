declare module "../../../../packages/catalog/squarespace-public.mjs" {
  export const SHOP_ORIGIN: string;
  export const WEBSITE_ID: string;
  export const STORE_PAGE_ID: string;
  export function fetchPublicCatalog(fetchImpl?: typeof fetch): Promise<{
    products: unknown[];
    capture: unknown;
    source: string;
  }>;
  export function extractStoreCapture(payload: unknown): unknown;
}
