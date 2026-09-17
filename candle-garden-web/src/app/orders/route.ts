import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { mobileIdentity } from "@/lib/mobile-auth";
import { listCustomerOrders, putMobileOrder } from "@/lib/mobileadmin/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const identity = await mobileIdentity(request);
  if (identity) return NextResponse.json(await listCustomerOrders(identity.sub));
  const deviceId = request.headers.get("x-device-id") || "";
  if (!/^(dev|tmp)_[a-z0-9_]{10,80}$/i.test(deviceId)) return NextResponse.json({ error: "A valid device ID is required" }, { status: 401 });
  return NextResponse.json(await listCustomerOrders(`guest:${deviceId}`));
}

export async function POST(request: NextRequest) {
  const identity = await mobileIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const now = new Date().toISOString();
  const order = {
    id: randomUUID(), customer_id: identity.sub, customer_email: identity.email,
    items: Array.isArray(body.items) ? body.items.slice(0, 100) : [],
    total_amount: Number(body.total || 0), status: "payment_verification_pending",
    source: "mobile", payment_provider: "stripe", payment_intent_id: String(body.payment_intent_id || ""),
    shipping: body.shipping && typeof body.shipping === "object" ? body.shipping : undefined,
    label_status: "owner_review", created_at: now, updated_at: now,
  };
  if (!order.payment_intent_id.startsWith("pi_")) return NextResponse.json({ error: "A Stripe payment reference is required" }, { status: 400 });
  await putMobileOrder(order);
  return NextResponse.json(order, { status: 201 });
}
