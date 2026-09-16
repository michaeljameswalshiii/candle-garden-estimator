declare module "*squarespace-public.mjs" {
  export function fetchPublicCatalog(fetchImpl?: typeof fetch): Promise<{
    products: unknown[];
    capture: unknown;
    source: string;
  }>;
  export function fetchPublicClasses(fetchImpl?: typeof fetch): Promise<unknown[]>;
}
