import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getMobileOrder, updateMobileOrder } from "@/lib/mobileadmin/data";

export const dynamic = "force-dynamic";

async function stripeRefund(paymentIntent: string, amount?: number) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe refunds are not configured on the website yet.");
  const body = new URLSearchParams({ payment_intent: paymentIntent });
  if (amount != null) body.set("amount", String(Math.round(amount * 100)));
  const response = await fetch("https://api.stripe.com/v1/refunds", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Stripe could not issue the refund.");
  return data as { id: string; amount: number };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const order = await getMobileOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  try {
    if (body.action === "refund") {
      if (!order.payment_intent_id) throw new Error("This order does not have a Stripe payment reference and cannot be refunded automatically.");
      const requested = body.amount == null || body.amount === "" ? undefined : Number(body.amount);
      if (requested != null && (!Number.isFinite(requested) || requested <= 0 || requested > Number(order.total_amount || 0))) throw new Error("Enter a valid refund amount no greater than the order total.");
      const refund = await stripeRefund(order.payment_intent_id, requested);
      await updateMobileOrder(id, { status: requested && requested < Number(order.total_amount || 0) ? "partially_refunded" : "refunded", refund_id: refund.id, refunded_amount: refund.amount / 100 });
      return NextResponse.json({ ok: true, message: "Stripe refund issued." });
    }
    const patch: { status?: string; total_amount?: number } = {};
    if (body.status) patch.status = String(body.status).slice(0, 40);
    if (body.total_amount != null) {
      const total = Number(body.total_amount);
      if (!Number.isFinite(total) || total < 0) throw new Error("Enter a valid non-negative order total.");
      patch.total_amount = total;
    }
    await updateMobileOrder(id, patch);
    return NextResponse.json({ ok: true, message: "Order updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update order" }, { status: 400 });
  }
}
