import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GET as liveProductsResponse } from "@/app/api/mobile/catalog/route";
import { GET as liveClassesResponse } from "@/app/api/mobile/classes/route";
import { applyPromotion, releasePromotion } from "@/lib/mobile-promotions";
import { candleGardenOrigin } from "@/lib/shippo";
import { mobileCustomerId, mobileIdentity } from "@/lib/mobile-auth";
import { putMobileOrder } from "@/lib/mobileadmin/data";
import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";
import { stubLabelsForItems } from "@/lib/shipping-labels";

export const dynamic = "force-dynamic";

function quantity(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("One or more quantities are invalid");
  return result;
}

async function priceItems(raw: unknown, shipping: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Your cart is empty");
  let total = 0;
  const kinds=(raw as any[]).map(item=>String(item.type||'product').toLowerCase());
  const productResponse=kinds.includes('product')?await liveProductsResponse():null;
  const classResponse=kinds.includes('class')?await liveClassesResponse():null;
  if(productResponse && !productResponse.ok || classResponse && !classResponse.ok)throw new Error('Could not verify current stock and prices. Please try again.');
  const products: any[]=productResponse?(await productResponse.json()).products:[];
  const classes: any[]=classResponse?(await classResponse.json()).classes:[];

  const destination = (raw as any[]).some((item) => String(item.type).toLowerCase() === "refill" && item.shippingMethod !== "local_dropoff") ? checkoutParty(shipping) : null;
  const items = await Promise.all(raw.map(async (item: any) => {
    const qty = quantity(item.quantity);
    const kind = String(item.type || "product").toLowerCase();
    if (kind === "refill") {
      const ounces = Number(item.ounces || 0);
      const quote = await priceRefillShipping(item, destination || candleGardenOrigin());
      const expedited = String(item.speed || "").toLowerCase() === "expedited";
      const waxCents = Math.round(ounces * (expedited ? 225 : 175) * qty);
      const shippingCents = expedited ? Math.round(quote.shippingCents * 2.2) : quote.shippingCents;
      const lineCents = waxCents + shippingCents;
      total += lineCents;
      return { type: "refill", productId: "refill", name: `Candle refill · ${ounces} oz`, size: quote.serviceSummary, quantity: qty, unitCents: Math.round(lineCents / qty), shippingCents: quote.shippingCents, ounces, boxKey: item.boxKey, shippingMethod: item.shippingMethod || "ship_own", vesselCount: Number(item.vesselCount || qty), speed: item.speed || "standard", destZip: item.destZip || "" };
    }
    if (kind === "class") {
      const entry = classes.find((row) => row.id === String(item.productId));
      if (!entry || entry.soldOut || entry.available != null && qty > Number(entry.available)) throw new Error("That class is unavailable or has too few seats.");
      const unitCents = Math.round(entry.price * 100);
      total += unitCents * qty;
      return { type: "class", productId: entry.id, name: entry.title, size: entry.scheduleLabel, quantity: qty, unitCents };
    }
    const entry = products.find((row) => row.id === String(item.productId));
    if (!entry || entry.soldOut) throw new Error("One or more products are unavailable");
    const variants=Array.isArray(entry.variants)?entry.variants:[];
    const variant=variants.find((row:any)=>row.id===item.variantId || row.size===item.size) || (variants.length===1?variants[0]:null);
    if(variants.length && (!variant || variant.soldOut || variant.quantity != null && qty>variant.quantity))throw new Error('Choose an available size and quantity.');
    const unitCents = Math.round(Number(variant?.price ?? entry.price)*100);
    total += unitCents * qty;
    return { type: "product", productId: entry.id, name: entry.name, size: variant?.size || item.size || null, variantId: variant?.id, quantity: qty, unitCents };
  }));
  if (total < 50 || total > 250000) throw new Error("Cart total is outside the allowed range");
  return { total, items };
}

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
    const rawItems=Array.isArray(body.items)?body.items.map((item:any)=>fulfillment==='pickup' && item.type==='refill'?{...item,shippingMethod:'local_dropoff'}:item):body.items;
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
    const storedItems = priced.items.map((row: any) => ({ ...row, price: row.unitCents / 100, unitCents: undefined, shippingCents: undefined }));
    const shippingLabels = stubLabelsForItems(storedItems);
    await putMobileOrder({ id: orderId, customer_id: customer, customer_email: identity?.email || body.email, total_amount: promotion.amount / 100, subtotal_amount: priced.total/100, discount_amount:promotion.discount/100, promotion_code:promotion.code, fulfillment_method:fulfillment, status: "payment_pending", source: "mobile", payment_provider: "stripe", payment_intent_id: intent.id, items: storedItems, shipping: body.shipping, label_status: shippingLabels.length ? "queued" : "none", shipping_labels: shippingLabels, created_at: now, updated_at: now });
    completed=true;
    return NextResponse.json({ discount:promotion.discount, subtotal:priced.total, paymentIntentClientSecret: intent.client_secret, paymentIntentId: intent.id, orderId, amount: promotion.amount, currency: "usd", items: priced.items });
  } catch (error) {
    if(reservation && !completed)await releasePromotion(reservation).catch(()=>{});
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout" }, { status: 400 });
  }
}
