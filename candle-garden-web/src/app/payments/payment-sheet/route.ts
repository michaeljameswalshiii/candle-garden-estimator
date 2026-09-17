import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { products, classes } from "@/lib/catalog";
import { mobileIdentity } from "@/lib/mobile-auth";
import { putMobileOrder } from "@/lib/mobileadmin/data";
import { checkoutParty, priceRefillShipping } from "@/lib/refill-pricing";

export const dynamic = "force-dynamic";

function quantity(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("One or more quantities are invalid");
  return result;
}

async function priceItems(raw: unknown, shipping: unknown) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("Your cart is empty");
  let total = 0;
  const destination = (raw as any[]).some((item) => String(item.type).toLowerCase() === "refill") ? checkoutParty(shipping) : null;
  const items = await Promise.all(raw.map(async (item: any) => {
    const qty = quantity(item.quantity);
    const kind = String(item.type || "product").toLowerCase();
    if (kind === "refill") {
      const ounces = Number(item.ounces || 0);
      const quote = await priceRefillShipping(item, destination!);
      const lineCents = Math.round(ounces * 150 * qty) + quote.shippingCents;
      total += lineCents;
      return { type: "refill", productId: "refill", name: `Candle refill · ${ounces} oz`, size: quote.serviceSummary, quantity: qty, unitCents: Math.round(lineCents / qty), shippingCents: quote.shippingCents };
    }
    if (kind === "class") {
      const entry = classes.find((row) => row.id === String(item.productId));
      if (!entry || entry.soldOut) throw new Error("That class is unavailable");
      const unitCents = Math.round(entry.price * 100);
      total += unitCents * qty;
      return { type: "class", productId: entry.id, name: entry.title, quantity: qty, unitCents };
    }
    const entry = products.find((row) => row.id === String(item.productId));
    if (!entry || entry.soldOut) throw new Error("One or more products are unavailable");
    const large = String(item.size || "").includes("18");
    const unitCents = Math.round((large && entry.priceMax ? entry.priceMax : entry.price) * 100);
    total += unitCents * qty;
    return { type: "product", productId: entry.id, name: entry.name, size: item.size || null, quantity: qty, unitCents };
  }));
  if (total < 50 || total > 250000) throw new Error("Cart total is outside the allowed range");
  return { total, items };
}

export async function POST(request: NextRequest) {
  try {
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) throw new Error("Stripe test checkout is not configured");
    if (key.startsWith("sk_live_") && process.env.MOBILE_LIVE_PAYMENTS !== "true") {
      throw new Error("Live mobile payments are safety-locked while beta checkout is being verified");
    }
    const body = await request.json();
    const priced = await priceItems(body.items, body.shipping);
    const identity = await mobileIdentity(request);
    const orderId = randomUUID();
    const form = new URLSearchParams({ amount: String(priced.total), currency: "usd", "automatic_payment_methods[enabled]": "true", "metadata[candle_garden_order_id]": orderId, "metadata[mode]": key.startsWith("sk_live_") ? "live" : "test" });
    if (String(body.email || "").includes("@")) form.set("receipt_email", String(body.email).slice(0, 254));
    const stripe = await fetch("https://api.stripe.com/v1/payment_intents", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
    const intent = await stripe.json() as any;
    if (!stripe.ok || !intent.client_secret) throw new Error(intent?.error?.message || "Stripe could not start checkout");
    const now = new Date().toISOString();
    await putMobileOrder({ id: orderId, customer_id: identity?.sub || `guest:${request.headers.get("x-device-id") || orderId}`, customer_email: identity?.email || body.email, total_amount: priced.total / 100, status: "payment_pending", source: "mobile", payment_provider: "stripe", payment_intent_id: intent.id, items: priced.items.map((row) => ({ name: row.name, size: "size" in row ? String(row.size || "") : "", quantity: row.quantity, price: row.unitCents / 100 })), shipping: body.shipping, label_status: "owner_review", created_at: now, updated_at: now });
    return NextResponse.json({ paymentIntentClientSecret: intent.client_secret, paymentIntentId: intent.id, orderId, amount: priced.total, currency: "usd", items: priced.items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout" }, { status: 400 });
  }
}
