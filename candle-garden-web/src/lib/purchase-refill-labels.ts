import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";
import { createLabel } from "@/lib/shippo";
import {
  LEG_TITLES,
  mergeLabels,
  purchaseOnPayKeys,
  stubLabelsForItems,
  type ShippingLabel,
} from "@/lib/shipping-labels";
import type { MobileOrder } from "@/lib/mobileadmin/data";

function persistable(row: ShippingLabel): ShippingLabel {
  const { imageBase64: _image, ...rest } = row;
  return rest;
}

export async function purchaseOrderLegs(order: MobileOrder, keys?: string[]) {
  const destination = checkoutParty(order.shipping || {});
  let labels = mergeLabels(order.shipping_labels || [], stubLabelsForItems(order.items || []));
  const printed: ShippingLabel[] = [];
  for (const item of order.items || []) {
    if (String(item.type || "").toLowerCase() !== "refill") continue;
    const quote = await priceRefillShipping(item, destination);
    const wanted = keys?.length ? keys : purchaseOnPayKeys(item.shippingMethod);
    for (const leg of quote.legs) {
      if (!wanted.includes(leg.key)) continue;
      const existing = labels.find((row) => row.key === leg.key && row.status === "purchased" && row.labelUrl);
      if (existing) {
        let imageBase64 = existing.imageBase64 || "";
        if (!imageBase64 && existing.labelUrl) {
          try {
            const file = await fetch(existing.labelUrl, { cache: "no-store" });
            imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
          } catch {
            imageBase64 = "";
          }
        }
        printed.push({ ...existing, imageBase64 });
        continue;
      }
      try {
        const created = await createLabel(leg.from, leg.to, leg.weight, leg.dims, leg.description, leg.returnLabel || leg.key === "empties_in");
        const row: ShippingLabel = {
          key: leg.key,
          title: LEG_TITLES[leg.key] || leg.key,
          status: "purchased",
          trackingNumber: created.trackingNumber,
          trackingUrl: created.trackingUrl,
          labelUrl: created.labelUrl,
          service: created.service,
          format: created.format,
          imageBase64: created.imageBase64,
          purchasedAt: new Date().toISOString(),
        };
        printed.push(row);
        labels = mergeLabels(labels, [persistable(row)]);
      } catch (error) {
        labels = mergeLabels(labels, [{
          key: leg.key,
          title: LEG_TITLES[leg.key] || leg.key,
          status: "queued",
          error: error instanceof Error ? error.message : "Could not purchase label",
        }]);
      }
    }
  }
  return { labels, printed };
}
