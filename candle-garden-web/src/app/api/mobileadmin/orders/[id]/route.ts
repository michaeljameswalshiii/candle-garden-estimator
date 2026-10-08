import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getMobileOrder, updateMobileOrder } from "@/lib/mobileadmin/data";
import { purchaseOrderLegs } from "@/lib/purchase-refill-labels";
import { labelStatusFrom } from "@/lib/shipping-labels";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["payment_pending", "paid", "ready_for_fulfillment", "processing", "refill_received", "refilling", "refill_returning", "ready_for_pickup", "shipped", "completed", "cancelled", "partially_refunded", "refunded"]);

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
    if (body.action === "create_labels" || body.action === "print_leg") {
      if (!String(order.status || "").startsWith("paid")) throw new Error("Verify payment before purchasing shipping labels.");
      const refills = (order.items || []).filter((item) => item.type === "refill");
      if (!refills.length) throw new Error("This order does not contain refill shipping.");
      const keys = body.leg ? [String(body.leg)] : Array.isArray(body.legs) ? body.legs.map(String) : undefined;
      const result = await purchaseOrderLegs(order, keys);
      const tracking = result.labels.map((label) => label.trackingNumber).filter(Boolean) as string[];
      const patch: { label_status: string; tracking_numbers: string[]; shipping_labels: typeof result.labels; status?: string } = {
        shipping_labels: result.labels,
        label_status: labelStatusFrom(result.labels),
        tracking_numbers: tracking,
      };
      if (result.labels.some((row) => row.key === "refills_out" && row.status === "purchased")) patch.status = "ready_for_fulfillment";
      await updateMobileOrder(id, patch);
      const printed = result.printed;
      return NextResponse.json({
        ok: true,
        message: printed.length ? `${printed.length} shipping label${printed.length === 1 ? "" : "s"} ready.` : "No new labels were purchased.",
        labels: printed,
        shipping_labels: result.labels,
      });
    }
    if (body.action === "refund") {
      if (!order.payment_intent_id) throw new Error("This order does not have a Stripe payment reference and cannot be refunded automatically.");
      const requested = body.amount == null || body.amount === "" ? undefined : Number(body.amount);
      if (requested != null && (!Number.isFinite(requested) || requested <= 0 || requested > Number(order.total_amount || 0))) throw new Error("Enter a valid refund amount no greater than the order total.");
      const refund = await stripeRefund(order.payment_intent_id, requested);
      await updateMobileOrder(id, { status: requested && requested < Number(order.total_amount || 0) ? "partially_refunded" : "refunded", refund_id: refund.id, refunded_amount: refund.amount / 100 });
      return NextResponse.json({ ok: true, message: "Stripe refund issued." });
    }
    const patch: { status?: string; total_amount?: number; tracking_numbers?: string[]; label_status?: string } = {};
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
    if (body.action === "set_tracking" || body.tracking) {
      const tracking = String(body.tracking || "").trim();
      if (tracking.length < 8) throw new Error("Paste a tracking number from Pirate Ship.");
      patch.tracking_numbers = [tracking];
      patch.label_status = "pirateship";
      if (!patch.status) patch.status = "shipped";
    }
    await updateMobileOrder(id, patch);
    return NextResponse.json({ ok: true, message: patch.tracking_numbers ? "Tracking saved from Pirate Ship." : "Order updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update order" }, { status: 400 });
  }
}
