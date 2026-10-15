import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getMobileOrder, updateMobileOrder } from "@/lib/mobileadmin/data";
import { purchaseOrderLegs } from "@/lib/purchase-refill-labels";
import { labelStatusFrom } from "@/lib/shipping-labels";
import { resendGiftCard, disableGiftCard, restoreGiftPayment } from "@/lib/mobileadmin/gift-cards";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["payment_pending", "paid", "ready_for_fulfillment", "processing", "refill_received", "refilling", "refill_returning", "ready_for_pickup", "shipped", "completed", "cancelled", "partially_refunded", "refunded"]);

async function stripeRefund(paymentIntent: string, amount?: number, idempotencyKey?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe refunds are not configured on the website yet.");
  const body = new URLSearchParams({ payment_intent: paymentIntent });
  if (amount != null) body.set("amount", String(Math.round(amount * 100)));
  const response = await fetch("https://api.stripe.com/v1/refunds", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body, cache: "no-store" });
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
    const giftPurchase = (order.items || []).some(item => item.type === "gift_card");
    if (body.action === "resend_gift_card" || body.action === "disable_gift_card") {
      if (!giftPurchase) throw new Error("This order does not contain a gift card purchase.");
      if (body.action === "resend_gift_card") await resendGiftCard(id);
      else await disableGiftCard(id);
      return NextResponse.json({ ok: true, message: body.action === "resend_gift_card" ? "Gift card email queued. Delivery runs within five minutes." : "Gift card disabled." });
    }
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
      if (order.gift_checkout) {
        if (body.amount != null && body.amount !== "" && Number(body.amount) !== Number(order.total_amount)) {
          throw new Error("Gift card orders support a full refund. Leave the amount blank. Contact the shop for a partial adjustment.");
        }
        if (order.status === "refunded") return NextResponse.json({ ok: true, message: "This order has already been refunded." });
        if (!String(order.status || "").startsWith("paid") && !order.gift_refund_review && !["processing", "shipped", "completed", "ready_for_fulfillment", "ready_for_pickup", "refilling", "refill_received", "refill_returning"].includes(String(order.status))) {
          throw new Error("Verify payment before refunding this order.");
        }
        // Freeze an unused purchased card before issuing its cash refund. Spent cards require review.
        if (giftPurchase) await disableGiftCard(id, true);
        const refund = order.payment_intent_id ? await stripeRefund(order.payment_intent_id, undefined, `gift-full-refund-${id}`) : undefined;
        if (order.gift_card_cents) await restoreGiftPayment(id);
        await updateMobileOrder(id, { status: "refunded", refund_id: refund?.id, refunded_amount: Number(order.total_amount || 0) });
        return NextResponse.json({ ok: true, message: giftPurchase ? "Unused gift card cancelled and refunded." : "Order refunded. Gift card payment was restored to its card; other payment was refunded through Stripe." });
      }
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
      if (tracking.length < 8) throw new Error("Paste a tracking number from Shippo.");
      patch.tracking_numbers = [tracking];
      patch.label_status = "pirateship";
      if (!patch.status) patch.status = "shipped";
    }
    await updateMobileOrder(id, patch);
    return NextResponse.json({ ok: true, message: patch.tracking_numbers ? "Tracking saved." : "Order updated." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update order" }, { status: 400 });
  }
}
