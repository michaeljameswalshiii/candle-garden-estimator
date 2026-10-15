import { priceItems } from "@/lib/mobile-checkout-pricing";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyPromotion, releasePromotion } from "@/lib/mobile-promotions";
import { mobileCustomerId, mobileIdentity } from "@/lib/mobile-auth";
import { putMobileOrder } from "@/lib/mobileadmin/data";
import { stubLabelsForItems } from "@/lib/shipping-labels";


export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let reservation = "";
  let completed = false;
  try {
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) throw new Error("Stripe test checkout is not configured");
    if (key.startsWith("sk_live_") && process.env.MOBILE_LIVE_PAYMENTS !== "true") {
      throw new Error("Live mobile payments are safety-locked while beta checkout is being verified");
    }
    const body = await request.json();
    const fulfillment=body.fulfillment==='pickup'?'pickup':'shipping';
    const rawItems=Array.isArray(body.items)?body.items.map((item:any)=>fulfillment==='pickup' && item.type==='refill'?{...item,shippingMethod:'store_dropoff'}:item):body.items;
    const priced = await priceItems(rawItems, body.shipping);
    const customer=await mobileCustomerId(request);
    const promotion=await applyPromotion(key,String(body.promoCode||''),priced.total,customer);
    reservation=promotion.reservation;
    if(promotion.amount===0)throw new Error('This code fully covers the order. Please call the shop to redeem it.');
    if(promotion.amount>0 && promotion.amount<50)throw new Error('The discounted total must be at least $0.50 for card payment.');

    const identity = await mobileIdentity(request);
    const orderId = randomUUID();
    const form = new URLSearchParams({ amount: String(promotion.amount), currency: "usd", "automatic_payment_methods[enabled]": "true", "metadata[candle_garden_order_id]": orderId, "metadata[mode]": key.startsWith("sk_live_") ? "live" : "test" });
    if (String(body.email || "").includes("@")) form.set("receipt_email", String(body.email).slice(0, 254));
    if(promotion.code)form.set("metadata[promotion_code]",promotion.code);
    const stripe = await fetch("https://api.stripe.com/v1/payment_intents", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
    const intent = await stripe.json() as any;
    if (!stripe.ok || !intent.client_secret) throw new Error(intent?.error?.message || "Stripe could not start checkout");
    const now = new Date().toISOString();
    const storedItems = priced.items.map((row: any) => {
      const { unitCents, ...rest } = row;
      return { ...rest, price: unitCents / 100 };
    });
    const shippingLabels = stubLabelsForItems(storedItems);
    await putMobileOrder({ id: orderId, customer_id: customer, customer_email: identity?.email || body.email, total_amount: promotion.amount / 100, subtotal_amount: priced.total/100, discount_amount:promotion.discount/100, promotion_code:promotion.code, fulfillment_method:fulfillment, status: "payment_pending", source: "mobile", payment_provider: "stripe", payment_intent_id: intent.id, items: storedItems, shipping: body.shipping, label_status: shippingLabels.length ? "queued" : "none", shipping_labels: shippingLabels, created_at: now, updated_at: now });
    completed=true;
    return NextResponse.json({ discount:promotion.discount, subtotal:priced.total, paymentIntentClientSecret: intent.client_secret, paymentIntentId: intent.id, orderId, amount: promotion.amount, currency: "usd", items: priced.items });
  } catch (error) {
    if(reservation && !completed)await releasePromotion(reservation).catch(()=>{});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout" }, { status: 400 });
  }
}
