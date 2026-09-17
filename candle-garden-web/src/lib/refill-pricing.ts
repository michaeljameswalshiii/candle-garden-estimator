import { availableRates, candleGardenOrigin, type Party } from "@/lib/ups";

const boxes: Record<string, [number, number, number, number]> = {
  ups_small: [10, 8, 6, 8], ups_medium: [12, 10, 8, 12], ups_large: [14, 12, 10, 16],
};

export function checkoutParty(raw: any): Party {
  const zip = String(raw?.zip || "").replace(/\D/g, "").slice(0, 5);
  if (!raw?.address || !raw?.city || !raw?.state || zip.length !== 5) throw new Error("A complete U.S. shipping address is required for a live UPS refill quote");
  return { name: String(raw.name || "Customer"), address: String(raw.address), city: String(raw.city), state: String(raw.state).slice(0, 2).toUpperCase(), zip, phone: String(raw.phone || ""), residential: true };
}

function plan(ounces: number, quantity: number, vessels: number, boxKey?: string) {
  const [length, width, height, tare] = boxes[String(boxKey || "")] || boxes.ups_medium;
  const wax = ounces * quantity;
  const count = Math.max(1, vessels || quantity);
  const empty = Math.max(5, wax / count * 1.1) * count;
  const packing = count * 1.75 + Math.max(1, length * width * height * 0.008) + 1;
  const dim = Math.max(1, Math.ceil((length * width * height) / 166));
  return { dims: [length, width, height] as [number, number, number], empties: Math.max(dim, Math.ceil((empty + tare + packing) / 16)), refills: Math.max(dim, Math.ceil((empty + tare + packing + wax) / 16)), kit: 2 };
}

export async function priceRefillShipping(item: any, destination: Party) {
  const ounces = Number(item.ounces || 0);
  const quantity = Number(item.quantity || 0);
  if (!Number.isFinite(ounces) || ounces <= 0 || ounces > 80 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("Refill quantity or ounces are invalid");
  const shipment = plan(ounces, quantity, Number(item.vesselCount || quantity), item.boxKey);
  const origin = candleGardenOrigin();
  const outbound = (await availableRates(origin, destination, shipment.refills, shipment.dims))[0];
  const method = String(item.shippingMethod || "ship_own");
  const legs = [{ key: "refills_out", from: origin, to: destination, weight: shipment.refills, dims: shipment.dims, rate: outbound, description: "Candle Garden refill return" }];
  if (method === "prepaid_labels" || method === "kit_roundtrip") {
    const rate = (await availableRates(destination, origin, shipment.empties, shipment.dims))[0];
    legs.unshift({ key: "empties_in", from: destination, to: origin, weight: shipment.empties, dims: shipment.dims, rate, description: "Empty vessels to Candle Garden" });
  }
  if (method === "kit_roundtrip") {
    const dims: [number, number, number] = [12, 10, 2];
    const rate = (await availableRates(origin, destination, shipment.kit, dims))[0];
    legs.unshift({ key: "kit_out", from: origin, to: destination, weight: shipment.kit, dims, rate, description: "Candle Garden packing kit" });
  }
  return { shippingCents: legs.reduce((sum, leg) => sum + leg.rate.cents, 0), serviceSummary: legs.map((leg) => leg.rate.service).join(" + "), legs };
}
