import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";
import { createLabel } from "@/lib/shippo";
import {
  LEG_TITLES,
  labelStatusFrom,
  mergeLabels,
  methodLegs,
  stubLabelsForItems,
  type ShippingLabel,
} from "@/lib/shipping-labels";
import { claimShippingLeg, getMobileOrder, releaseShippingLeg, updateMobileOrder, type MobileOrder } from "@/lib/mobileadmin/data";

function persistable(row: ShippingLabel): ShippingLabel {
  const { imageBase64: _image, ...rest } = row;
  return rest;
}

async function withImage(row: ShippingLabel): Promise<ShippingLabel> {
  let imageBase64 = row.imageBase64 || "";
  if (!imageBase64 && row.labelUrl) {
    try {
      const file = await fetch(row.labelUrl, { cache: "no-store" });
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } catch {
      imageBase64 = "";
    }
  }
  return { ...row, imageBase64 };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function purchaseClaimedLeg(
  orderId: string,
  legKey: string,
  buy: () => Promise<ShippingLabel>,
): Promise<ShippingLabel | null> {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    let claimed = false;
    try {
      claimed = await claimShippingLeg(orderId, legKey);
    } catch {
      throw new Error("Could not reserve this shipping label");
    }
    if (!claimed) {
      await wait(300);
      const fresh = await getMobileOrder(orderId);
      const saved = (fresh?.shipping_labels || []).find((row) => row.key === legKey && row.status === "purchased" && row.labelUrl);
      if (saved) return saved;
      continue;
    }
    try {
      return await buy();
    } finally {
      await releaseShippingLeg(orderId, legKey).catch(() => undefined);
    }
  }
  return null;
}

export async function purchaseOrderLegs(order: MobileOrder, keys?: string[]) {
  const isDropoff = (method?: string) => method === "store_dropoff" || method === "local_dropoff";
  const refillItems = (order.items || []).filter((item) => String(item.type || "").toLowerCase() === "refill" && !isDropoff(item.shippingMethod));
  if (!refillItems.length) return { labels: order.shipping_labels || [], printed: [] as ShippingLabel[] };
  const destination = checkoutParty(order.shipping || {});
  let labels = mergeLabels(order.shipping_labels || [], stubLabelsForItems(order.items || []));
  const printed: ShippingLabel[] = [];
  for (const item of refillItems) {
    const quote = await priceRefillShipping(item, destination);
    const wanted = keys?.length ? keys : methodLegs(item.shippingMethod);
    for (const leg of quote.legs) {
      if (!wanted.includes(leg.key)) continue;
      const existing = labels.find((row) => row.key === leg.key && row.status === "purchased" && row.labelUrl);
      if (existing) {
        printed.push(await withImage(existing));
        continue;
      }
      try {
      const purchased = await purchaseClaimedLeg(order.id, leg.key, async () => {
        const fresh = await getMobileOrder(order.id);
        if (fresh && ["refunded", "partially_refunded"].includes(String(fresh.status))) {
          throw new Error("Refunded orders do not get new postage.");
        }
        const freshLabels = mergeLabels(fresh?.shipping_labels || labels, []);
        const saved = freshLabels.find((row) => row.key === leg.key && row.status === "purchased" && row.labelUrl);
        if (saved) return saved;
        // Explicit customer-to-shop shipment; do not reverse the addresses again.
        const created = await createLabel(leg.from, leg.to, leg.weight, leg.dims, leg.description, false);
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
          recipient: leg.key === "empties_in" ? "The Candle Garden" : (leg.to.name || "Customer"),
          recipientAddress: [leg.to.address, leg.to.city, `${leg.to.state} ${leg.to.zip}`].filter(Boolean).join(", "),
        };
        labels = mergeLabels(labels, [persistable(row)]);
        const tracking = labels.map((item) => item.trackingNumber).filter(Boolean) as string[];
        await updateMobileOrder(order.id, {
          shipping_labels: labels.map(persistable),
          label_status: labelStatusFrom(labels),
          ...(tracking.length ? { tracking_numbers: tracking } : {}),
        });
        return row;
      });
      if (purchased) printed.push(await withImage(purchased));
      else labels = mergeLabels(labels, [{
        key: leg.key,
        title: LEG_TITLES[leg.key] || leg.key,
        status: "queued",
        error: "Label purchase already in progress",
      }]);
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
