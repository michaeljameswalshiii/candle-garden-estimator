import { NextRequest, NextResponse } from "next/server";
import { findOrderByPaymentIntent, updateMobileOrder } from "@/lib/mobileadmin/data";
import { purchaseOrderLegs } from "@/lib/purchase-refill-labels";
import { labelStatusFrom } from "@/lib/shipping-labels";

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
    const status = paid ? (intent.livemode ? "paid" : "paid_test") : `payment_${intent.status}`;
    const patch: Record<string, unknown> = { status };
    let printed: Awaited<ReturnType<typeof purchaseOrderLegs>>["printed"] = [];
    let labels = order.shipping_labels || [];
    if (paid && (order.items || []).some((item) => item.type === "refill")) {
      try {
        const result = await purchaseOrderLegs(order);
        labels = result.labels;
        printed = result.printed;
        patch.shipping_labels = labels;
        patch.label_status = labelStatusFrom(labels);
        const tracking = labels.map((row) => row.trackingNumber).filter(Boolean);
        if (tracking.length) patch.tracking_numbers = tracking;
      } catch {
        patch.label_status = "queued";
      }
    }
    await updateMobileOrder(order.id, patch);
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      status,
      paid,
      labels: printed.filter((row) => row.key === "empties_in"),
      shipping_labels: labels,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify payment" }, { status: 400 });
  }
}
