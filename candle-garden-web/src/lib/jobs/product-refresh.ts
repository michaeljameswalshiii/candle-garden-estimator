import rawProducts from "../../../../packages/catalog/products.json";
import { loadRecord, saveRecord } from "@/lib/admin/store";
import { applyInventory, listInventory, squarespaceApiConfigured } from "@/lib/squarespace/client";
import { fetchPublicShopCatalog, type CommerceCapture } from "@/lib/squarespace/public-catalog";
import type { CatalogProduct } from "@/lib/squarespace/types";

export type { CatalogProduct, CatalogVariant } from "@/lib/squarespace/types";

export type JobRun = {
  id: string;
  jobId: "product-refresh" | "class-refresh";
  trigger: "schedule" | "manual" | "webhook";
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  completedAt?: string;
  discovered?: number;
  added?: number;
  updated?: number;
  removed?: number;
  message?: string;
  source?: string;
};

const CATALOG_RECORD = "mobile-product-catalog";
const CAPTURE_RECORD = "squarespace-commerce-capture";
const RUNS_RECORD = "scheduled-job-runs";
const MAX_RUNS = 100;
const fallbackCatalog = rawProducts as CatalogProduct[];

export async function getProductCatalog(): Promise<CatalogProduct[]> {
  return loadRecord<CatalogProduct[]>(CATALOG_RECORD, fallbackCatalog);
}

export async function getCommerceCapture(): Promise<CommerceCapture | null> {
  return loadRecord<CommerceCapture | null>(CAPTURE_RECORD, null);
}

export async function listJobRuns(): Promise<JobRun[]> {
  return loadRecord<JobRun[]>(RUNS_RECORD, []);
}

export async function saveJobRun(run: JobRun) {
  const runs = await listJobRuns();
  const next = [run, ...runs.filter((item) => item.id !== run.id)].slice(0, MAX_RUNS);
  await saveRecord(RUNS_RECORD, next);
}

export async function runProductRefresh(trigger: JobRun["trigger"]): Promise<JobRun> {
  const run: JobRun = {
    id: crypto.randomUUID(),
    jobId: "product-refresh",
    trigger,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await saveJobRun(run);
  try {
    const current = await getProductCatalog();
    const { products, capture, source } = await fetchPublicShopCatalog();
    if (products.length < 5) {
      throw new Error(`Safety check stopped refresh: only ${products.length} products found`);
    }

    let overlayNote = "";
    if (await squarespaceApiConfigured()) {
      try {
        const inventory = await listInventory();
        applyInventory(products, inventory);
        overlayNote = ` Inventory API overlay applied (${inventory.length} variants).`;
      } catch (error) {
        overlayNote = ` Commerce API inventory overlay skipped: ${error instanceof Error ? error.message : "unknown error"}.`;
      }
    } else {
      overlayNote = " Using public collection JSON until SQUARESPACE_API_KEY is set.";
    }

    const prior = new Map(current.map((item) => [item.id || item.url, item]));
    const next = new Map(products.map((item) => [item.id || item.url, item]));
    const added = products.filter((item) => !prior.has(item.id || item.url)).length;
    const removed = current.filter((item) => !next.has(item.id || item.url)).length;
    const updated = products.filter((item) => {
      const old = prior.get(item.id || item.url);
      return old && JSON.stringify(old) !== JSON.stringify(item);
    }).length;

    await saveRecord(CATALOG_RECORD, products);
    await saveRecord(CAPTURE_RECORD, {
      ...capture,
      productCount: products.length,
      variantCount: products.reduce((count, product) => count + (product.variants?.length || 0), 0),
      source,
      refreshedAt: new Date().toISOString(),
    });

    Object.assign(run, {
      status: "succeeded" as const,
      completedAt: new Date().toISOString(),
      discovered: products.length,
      added,
      updated,
      removed,
      source,
      message: `Catalog refreshed from ${source}.${overlayNote}`,
    });
  } catch (error) {
    Object.assign(run, {
      status: "failed" as const,
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Unknown refresh error",
    });
  }
  await saveJobRun(run);
  return run;
}
