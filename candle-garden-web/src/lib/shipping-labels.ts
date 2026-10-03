export const LEG_TITLES: Record<string, string> = {
  kit_out: "Packing kit out",
  empties_in: "Empties inbound",
  refills_out: "Refills back to customer",
};

export function methodLegs(method?: string) {
  if (method === "kit_roundtrip") return ["kit_out", "empties_in", "refills_out"];
  if (method === "prepaid_labels") return ["empties_in", "refills_out"];
  if (method === "ship_own") return ["refills_out"];
  return [];
}

export function purchaseOnPayKeys(method?: string) {
  return methodLegs(method).filter((key) => key === "empties_in");
}

export function queuedOnPayKeys(method?: string) {
  return methodLegs(method).filter((key) => key !== "empties_in");
}

export type ShippingLabel = {
  key?: string;
  title?: string;
  status?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  service?: string;
  format?: string;
  imageBase64?: string;
  purchasedAt?: string;
  error?: string;
};

export function stubLabelsForItems(items: Array<{ type?: string; shippingMethod?: string }> = []) {
  const seen = new Set<string>();
  const labels: ShippingLabel[] = [];
  for (const item of items) {
    if (String(item.type || "").toLowerCase() !== "refill") continue;
    for (const key of methodLegs(item.shippingMethod || "ship_own")) {
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({ key, title: LEG_TITLES[key] || key, status: "queued" });
    }
  }
  return labels;
}

export function mergeLabels(existing: ShippingLabel[] = [], updates: ShippingLabel[] = []) {
  const byKey = new Map<string, ShippingLabel>();
  for (const row of existing) if (row?.key) byKey.set(row.key, { ...row });
  for (const row of updates) if (row?.key) byKey.set(row.key, { ...byKey.get(row.key), ...row });
  return [...byKey.values()];
}

export function labelStatusFrom(labels: ShippingLabel[] = []) {
  const purchased = labels.some((row) => row.status === "purchased");
  const queued = labels.some((row) => row.status !== "purchased");
  if (purchased && queued) return "partial";
  if (purchased) return "created";
  if (labels.length) return "queued";
  return "none";
}
