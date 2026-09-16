import rawClasses from "../../../../packages/catalog/classes.json";
import { loadRecord, saveRecord } from "@/lib/admin/store";
import { saveJobRun, type JobRun } from "@/lib/jobs/product-refresh";

export type ClassItem = {
  id: string;
  title: string;
  scheduleLabel: string;
  date: string;
  dateDisplay: string;
  time: string;
  duration: string;
  price: number;
  available: number;
  soldOut: boolean;
  description: string;
  fullDescription: string;
  image: string;
  sku: string;
  url: string;
  location: string;
};

const CATALOG_RECORD = "mobile-class-catalog";
const fallbackCatalog = rawClasses as ClassItem[];

export async function getClassCatalog(): Promise<ClassItem[]> {
  return loadRecord<ClassItem[]>(CATALOG_RECORD, fallbackCatalog);
}

export async function runClassRefresh(trigger: JobRun["trigger"]): Promise<JobRun> {
  const run: JobRun = {
    id: crypto.randomUUID(),
    jobId: "class-refresh",
    trigger,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  await saveJobRun(run);
  try {
    const { fetchPublicClasses } = await import("../../../../packages/catalog/squarespace-public.mjs");
    const current = await getClassCatalog();
    const classes = (await fetchPublicClasses()) as ClassItem[];
    if (classes.length < 1) throw new Error("Safety check stopped refresh: no upcoming public classes found");
    const prior = new Map(current.map((item) => [item.id, item]));
    const next = new Map(classes.map((item) => [item.id, item]));
    const added = classes.filter((item) => !prior.has(item.id)).length;
    const updated = classes.filter(
      (item) => prior.has(item.id) && JSON.stringify(prior.get(item.id)) !== JSON.stringify(item),
    ).length;
    const removed = current.filter((item) => !next.has(item.id)).length;
    await saveRecord(CATALOG_RECORD, classes);
    Object.assign(run, {
      status: "succeeded" as const,
      completedAt: new Date().toISOString(),
      discovered: classes.length,
      added,
      updated,
      removed,
      message: "Class schedule refreshed successfully",
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
