import { GET as liveProductsResponse } from "@/app/api/mobile/catalog/route";
import { GET as liveClassesResponse } from "@/app/api/mobile/classes/route";
import { candleGardenOrigin } from "@/lib/shippo";
import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";
import { validateVesselScents } from "../../../packages/catalog/refillScents";

function quantity(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("One or more quantities are invalid");
  return result;
}

export async function priceItems(raw: unknown, shipping: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Your cart is empty");
  let total = 0;
  const kindOf = (item: any) => ["physical", "subscription"].includes(String(item.type || "").toLowerCase()) ? "product" : String(item.type || "product").toLowerCase();
  const kinds = (raw as any[]).map(kindOf);
  const productResponse = kinds.includes("product") || kinds.includes("refill") ? await liveProductsResponse() : null;
  const classResponse = kinds.includes("class") ? await liveClassesResponse() : null;
  if ((productResponse && !productResponse.ok) || (classResponse && !classResponse.ok)) throw new Error("Could not verify current stock and prices. Please try again.");
  const products: any[] = productResponse ? (await productResponse.json()).products : [];
  const classes: any[] = classResponse ? (await classResponse.json()).classes : [];
  const needsShipQuote = (raw as any[]).some((item) => {
    const method = String(item.shippingMethod || "ship_own");
    return String(item.type || "").toLowerCase() === "refill" && method !== "store_dropoff" && method !== "local_dropoff";
  });
  const destination = needsShipQuote ? checkoutParty(shipping) : null;
  const items = await Promise.all(raw.map(async (item: any) => {
    const qty = quantity(item.quantity);
    const kind = kindOf(item);
    if (kind === "refill") {
      const ounces = Number(item.ounces || 0);
      const vesselCount = Number(item.vesselCount || qty);
      const vesselScents = validateVesselScents(item.vesselScents, vesselCount, products);
      const quote = await priceRefillShipping(item, destination || candleGardenOrigin());
      const expedited = String(item.speed || "").toLowerCase() === "expedited";
      const waxCents = Math.round(ounces * (expedited ? 225 : 175) * qty);
      const shippingCents = quote.shippingCents;
      const lineCents = waxCents + shippingCents;
      total += lineCents;
      return { type: "refill", productId: "refill", name: `Candle refill · ${ounces} oz`, size: quote.serviceSummary, quantity: qty, unitCents: Math.round(lineCents / qty), shippingCents, waxCents, ounces, boxKey: item.boxKey, shippingMethod: item.shippingMethod || "ship_own", vesselCount, vesselScents, speed: item.speed || "standard", destZip: item.destZip || "" };
    }
    if (kind === "class") {
      const entry = classes.find((row) => row.id === String(item.productId));
      if (!entry || entry.soldOut || entry.available != null && qty > Number(entry.available)) throw new Error("That class is unavailable or has too few seats.");
      const unitCents = Math.round(entry.price * 100);
      total += unitCents * qty;
      return { type: "class", productId: entry.id, name: entry.title, size: entry.scheduleLabel, quantity: qty, unitCents };
    }
    const entry = products.find((row) => row.id === String(item.productId));
    if (!entry || entry.soldOut) throw new Error(`${entry?.name || item.name || 'This candle'} is unavailable. Refresh Shop and choose an available size.`);
    const variants=Array.isArray(entry.variants)?entry.variants:[];
    const variant=(item.variantId ? variants.find((row:any)=>row.id===item.variantId) : null) || variants.find((row:any)=>row.size===item.size) || (variants.length===1?variants[0]:null);
    if(variants.length && (!variant || variant.soldOut || variant.quantity != null && qty>variant.quantity))throw new Error('Choose an available size and quantity.');
    const unitCents = Math.round(Number(variant?.price ?? entry.price)*100);
    total += unitCents * qty;
    return { type: "product", productId: entry.id, name: entry.name, size: variant?.size || item.size || null, variantId: variant?.id, quantity: qty, unitCents };
  }));
  if (total < 50 || total > 250000) throw new Error("Cart total is outside the allowed range");
  return { total, items };
}

