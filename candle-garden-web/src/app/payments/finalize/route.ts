import { NextRequest, NextResponse } from "next/server";
import { findOrderByPaymentIntent, updateMobileOrder } from "@/lib/mobileadmin/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId } = await request.json();
    if (!String(paymentIntentId || "").startsWith("pi_")) throw new Error("A Stripe payment reference is required");
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) throw new Error("Stripe is not configured");
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    const intent = await response.json() as any;
    if (!response.ok) throw new Error(intent?.error?.message || "Stripe verification failed");
    const order = await findOrderByPaymentIntent(paymentIntentId);
    if (!order) throw new Error("Order record not found");
    const paid = intent.status === "succeeded";
    await updateMobileOrder(order.id, { status: paid ? (intent.livemode ? "paid" : "paid_test") : `payment_${intent.status}` });
    return NextResponse.json({ ok: true, orderId: order.id, status: paid ? (intent.livemode ? "paid" : "paid_test") : `payment_${intent.status}`, paid });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify payment" }, { status: 400 });
  }
}
