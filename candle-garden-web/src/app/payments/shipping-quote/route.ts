import { NextRequest, NextResponse } from "next/server";
import { candleGardenOrigin, lowestRate, shippoConfigured, type Party } from "@/lib/shippo";
import { refillPackagePlan, packingMaterialsCents } from "@/lib/refill-pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Method = "store_dropoff" | "ship_own" | "kit_roundtrip" | "prepaid_labels";
const boxes: Record<string, [number, number, number, number]> = {
  ups_small: [10, 8, 6, 8], ups_medium: [12, 10, 8, 12], ups_large: [14, 12, 10, 16],
};

function customer(body: Record<string, unknown>): Party | null {
  const raw = (body.dest || body.shipping || {}) as Record<string, unknown>;
  const zip = String(raw.zip || body.destZip || "").replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return null;
  return {
    name: String(raw.name || "Customer"),
    address: String(raw.address || "1 Main St"),
    city: String(raw.city || ""),
    state: String(raw.state || "").slice(0, 2).toUpperCase(),
    zip,
    phone: String(raw.phone || ""),
    email: String(raw.email || ""),
    residential: true,
  };
}

function packagePlan(body: Record<string, unknown>) {
  const ounces = Number(body.ounces || 0);
  const quantity = Math.max(1, Number(body.quantity || 1));
  const vessels = Math.max(1, Number(body.vesselCount || quantity));
  if (!Number.isFinite(ounces) || ounces <= 0) throw new Error("Ounces are required");
  const selected = boxes[String(body.boxKey || "")] || boxes.ups_medium;
  const [length, width, height, tare] = selected;
  const wax = ounces * quantity;
  const empty = Math.max(5, wax / vessels * 1.1) * vessels;
  const packing = vessels * 1.75 + Math.max(1, length * width * height * 0.008) + 1;
  const dim = Math.max(1, Math.ceil((length * width * height) / 166));
  return {
    dims: [length, width, height] as [number, number, number],
    empties: Math.max(dim, Math.ceil((empty + tare + packing) / 16)),
    refills: Math.max(dim, Math.ceil((empty + tare + packing + wax) / 16)),
    kit: 2,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const destination = customer(body);
    const requested = Array.isArray(body.methods) ? body.methods as Method[] : ["store_dropoff", "ship_own", "kit_roundtrip", "prepaid_labels"];
    const dropoff = requested.includes("store_dropoff") ? [{
      method: "store_dropoff" as const,
      shipping_cents: 0,
      total_cents: 0,
      rate_source: "store",
      service_summary: "In-store drop-off",
      legs: [],
    }] : [];
    if (!destination) {
      return NextResponse.json({
        ok: true,
        shippoConfigured: shippoConfigured(),
        upsConfigured: false,
        quotes: dropoff,
        note: dropoff.length ? "In-store drop-off has no shipping. Enter a 5-digit ZIP to estimate the other methods." : "Enter a 5-digit ZIP to estimate shipping.",
      });
    }
    const plan = refillPackagePlan(Number(body.ounces), Number(body.quantity || 1), Number(body.vesselCount || 1), String(body.boxKey || ''));
    const origin = candleGardenOrigin();
    const [out, inbound, kit] = await Promise.all([
      lowestRate(origin, destination, plan.refills, plan.dims),
      lowestRate(destination, origin, plan.empties, plan.dims, false),
      lowestRate(origin, destination, plan.kit, [12, 10, 2]),
    ]);
    const quotes = [
      ...dropoff,
      ...requested.filter((method) => ["ship_own", "kit_roundtrip", "prepaid_labels"].includes(method)).map((method) => {
      const multiplier = body.speed === 'expedited' ? 2.2 : 1;
      const definitions = { kit_out: { rate: kit, title: 'Packing kit to you', weight: plan.kit },
        empties_in: { rate: inbound, title: 'Empties to The Candle Garden', weight: plan.empties },
        refills_out: { rate: out, title: 'Refills back to you', weight: plan.refills } };
      const keys = method === 'kit_roundtrip' ? ['kit_out', 'empties_in', 'refills_out'] as const : method === 'prepaid_labels' ? ['empties_in', 'refills_out'] as const : ['refills_out'] as const;
      const legs = keys.map(key => ({ key, title: definitions[key].title, cents: Math.round(definitions[key].rate.cents * multiplier),
        service: definitions[key].rate.service, provider: definitions[key].rate.provider, billedLb: definitions[key].weight }));
      const materials_cents = method === 'kit_roundtrip' ? packingMaterialsCents(String(body.boxKey || '')) : 0;
      const shipping_cents = legs.reduce((total, leg) => total + leg.cents, 0) + materials_cents;
      return {
        method,
        shipping_cents,
        total_cents: shipping_cents,
        materials_cents,
        rate_source: "shippo",
        service_summary: legs.map((rate) => `${rate.provider} ${rate.service}`).join(" + "),
        legs,
      };
      }),
    ];
    return NextResponse.json({ ok: true, shippoConfigured: true, upsConfigured: false, quotes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not quote shipping" }, { status: 502 });
  }
}
