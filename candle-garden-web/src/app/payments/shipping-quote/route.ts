import { NextRequest, NextResponse } from "next/server";
import { availableRates, candleGardenOrigin, type Party } from "@/lib/ups";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Method = "ship_own" | "kit_roundtrip" | "prepaid_labels";
const boxes: Record<string, [number, number, number, number]> = {
  ups_small: [10, 8, 6, 8], ups_medium: [12, 10, 8, 12], ups_large: [14, 12, 10, 16],
};

function customer(body: Record<string, unknown>): Party | null {
  const raw = (body.dest || body.shipping || {}) as Record<string, unknown>;
  const zip = String(raw.zip || body.destZip || "").replace(/\D/g, "").slice(0, 5);
  // The estimator only has a ZIP; UPS requires a complete address for a live, purchaseable rate.
  if (!raw.address || !raw.city || !raw.state || zip.length !== 5) return null;
  return { name: String(raw.name || "Customer"), address: String(raw.address), city: String(raw.city), state: String(raw.state).slice(0, 2).toUpperCase(), zip, phone: String(raw.phone || ""), residential: true };
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
  return { dims: [length, width, height] as [number, number, number], empties: Math.max(dim, Math.ceil((empty + tare + packing) / 16)), refills: Math.max(dim, Math.ceil((empty + tare + packing + wax) / 16)), kit: 2 };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const destination = customer(body);
    if (!destination) {
      return NextResponse.json({ ok: true, upsConfigured: Boolean(process.env.UPS_CLIENT_ID), quotes: [], note: "Enter a full delivery address at checkout for a live UPS lowest-cost quote." });
    }
    const plan = packagePlan(body);
    const requested = Array.isArray(body.methods) ? body.methods as Method[] : ["ship_own", "kit_roundtrip", "prepaid_labels"];
    const out = await availableRates(candleGardenOrigin(), destination, plan.refills, plan.dims);
    const inbound = await availableRates(destination, candleGardenOrigin(), plan.empties, plan.dims);
    const kit = await availableRates(candleGardenOrigin(), destination, plan.kit, [12, 10, 2]);
    const lowest = (rates: typeof out) => rates[0];
    const quotes = requested.filter((method) => ["ship_own", "kit_roundtrip", "prepaid_labels"].includes(method)).map((method) => {
      const legs = method === "kit_roundtrip" ? [lowest(kit), lowest(inbound), lowest(out)] : method === "prepaid_labels" ? [lowest(inbound), lowest(out)] : [lowest(out)];
      const shipping_cents = legs.reduce((total, rate) => total + rate.cents, 0);
      return { method, shipping_cents, total_cents: shipping_cents, rate_source: "ups", service_summary: legs.map((rate) => rate.service).join(" + "), legs: legs.map((rate) => ({ cents: rate.cents, service: rate.service, code: rate.code })) };
    });
    return NextResponse.json({ ok: true, upsConfigured: true, quotes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not quote UPS shipping" }, { status: 502 });
  }
}
