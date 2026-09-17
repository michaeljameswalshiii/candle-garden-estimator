import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getMobileOrder, updateMobileOrder } from "@/lib/mobileadmin/data";
import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";
import { createLabel } from "@/lib/ups";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["payment_pending", "paid", "ready_for_fulfillment", "processing", "shipped", "completed", "cancelled", "partially_refunded", "refunded"]);

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
    if (body.action === "create_labels") {
      if (!String(order.status || "").startsWith("paid")) throw new Error("Verify payment before purchasing shipping labels.");
      if (order.label_status === "created") throw new Error("Labels were already created for this order.");
      const refills = (order.items || []).filter((item) => item.type === "refill");
      if (!refills.length) throw new Error("This order does not contain refill shipping.");
      const destination = checkoutParty(order.shipping || {});
      const labels = [];
      for (const item of refills) {
        const quote = await priceRefillShipping(item, destination);
        for (const leg of quote.legs) {
          const label = await createLabel(leg.from, leg.to, leg.weight, leg.dims, leg.rate.code, leg.description, leg.key === "empties_in");
          labels.push({ key: leg.key, service: leg.rate.service, ...label });
        }
      }
      const tracking = labels.map((label) => label.trackingNumber).filter(Boolean) as string[];
      await updateMobileOrder(id, { label_status: "created", tracking_numbers: tracking, status: "ready_for_fulfillment" });
      return NextResponse.json({ ok: true, message: `${labels.length} UPS label${labels.length === 1 ? "" : "s"} created.`, labels });
    }
    if (body.action === "refund") {
      if (!order.payment_intent_id) throw new Error("This order does not have a Stripe payment reference and cannot be refunded automatically.");
      const requested = body.amount == null || body.amount === "" ? undefined : Number(body.amount);
      if (requested != null && (!Number.isFinite(requested) || requested <= 0 || requested > Number(order.total_amount || 0))) throw new Error("Enter a valid refund amount no greater than the order total.");
      const refund = await stripeRefund(order.payment_intent_id, requested);
      await updateMobileOrder(id, { status: requested && requested < Number(order.total_amount || 0) ? "partially_refunded" : "refunded", refund_id: refund.id, refunded_amount: refund.amount / 100 });
      return NextResponse.json({ ok: true, message: "Stripe refund issued." });
    }
    const patch: { status?: string; total_amount?: number } = {};
    if (body.status) {
      const status = String(body.status);
      if (!allowedStatuses.has(status)) throw new Error("Choose a valid order status.");
      patch.status = status;
    }
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
