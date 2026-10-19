import { NextRequest, NextResponse } from "next/server";
import { mobileIdentity, mobileCustomerId } from "@/lib/mobile-auth";
import { listCustomerOrders, findOrderByPaymentIntent } from "@/lib/mobileadmin/data";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listCustomerOrders(await mobileCustomerId(request)), {headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({error:"Please sign in or use the device that placed this order."},{status:401}); }
}

export async function POST(request: NextRequest) {
  const identity = await mobileIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  // Compatibility endpoint: checkout already creates the authoritative order.
  // Never manufacture a second order from a client total or PaymentIntent ID.
  const paymentIntentId = String(body.payment_intent_id || "");
  if (!/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) return NextResponse.json({ error: "A Stripe payment reference is required" }, { status: 400 });
  const order = await findOrderByPaymentIntent(paymentIntentId);
  if (!order || order.customer_id !== identity.sub || order.status === "deleted") {
    return NextResponse.json({ error: "Start checkout before saving an order." }, { status: 400 });
  }
  return NextResponse.json(order, { status: 201 });
}
