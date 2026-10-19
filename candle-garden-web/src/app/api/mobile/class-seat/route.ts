import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMobileOrder, type MobileOrder } from "@/lib/mobileadmin/data";

export const dynamic = "force-dynamic";

type SeatItem = { variantId: string; quantity: number; unitPrice: number; title?: string };

function authorized(request: NextRequest) {
  const expected = String(process.env.CLASS_SEAT_SECRET || "");
  const header = request.headers.get("authorization") || "";
  const token = header.slice(0, 7).toLowerCase() === "bearer " ? header.slice(7).trim() : "";
  if (!expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function money(amount: number) {
  return { currency: "USD", value: amount.toFixed(2) };
}

async function squarespace(path: string, init?: { method?: string; body?: unknown; idempotencyKey?: string }) {
  const key = String(process.env.SQUARESPACE_API_KEY || "").trim();
  if (!key) return { ok: false, status: 503, data: { message: "Squarespace is not configured" } };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "User-Agent": "CandleGardenClassSeats/1.0",
    Accept: "application/json",
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey.slice(0, 200);
  const response = await fetch(`https://api.squarespace.com${path}`, {
    method: init?.method || "GET",
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    data = { message: text.slice(0, 240) };
  }
  return { ok: response.ok, status: response.status, data };
}

function squarespaceMessage(data: Record<string, unknown>) {
  const message = data.message || data.type || data.error;
  return String(message || "Squarespace did not reserve the seat").slice(0, 300);
}

const BOOKABLE = new Set(["paid", "paid_test", "processing", "shipped", "completed", "ready_for_pickup", "ready_for_fulfillment", "refill_received", "refilling", "refill_returning"]);

async function variantFor(productId: string) {
  const { GET } = await import("@/app/api/mobile/classes/route");
  const response = await GET();
  if (!response.ok) throw new Error("That class is missing its Squarespace seat");
  const payload = await response.json() as { classes?: Array<{ id?: string; variantId?: string }> };
  const variantId = String((payload.classes || []).find((row) => row.id === productId)?.variantId || "").trim();
  if (!variantId) throw new Error("That class is missing its Squarespace seat");
  return variantId;
}

async function seatsFromOrder(order: MobileOrder): Promise<SeatItem[]> {
  const classes = (order.items || []).filter((item) => String(item.type || "").toLowerCase() === "class");
  if (!classes.length) throw new Error("This order has no class seat");
  const seats: SeatItem[] = [];
  for (const item of classes) {
    const row = item as typeof item & { variantId?: string; unitCents?: number; price?: number };
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitCents) > 0 ? Number(row.unitCents) / 100 : Number(row.price);
    const variantId = String(row.variantId || "").trim() || await variantFor(String(row.productId || ""));
    if (!variantId) throw new Error("A class seat needs a variant");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("That class quantity is invalid");
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("That class has no price");
    seats.push({ variantId, quantity, unitPrice, title: String(row.size || row.name || "Candle class").slice(0, 200) });
  }
  return seats;
}

async function reserveSeats(orderId: string, email: string, name: string, items: SeatItem[]) {
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const orderBody = {
    channelName: "Candle Garden App",
    createdOn: new Date().toISOString(),
    externalOrderReference: orderId.slice(0, 200),
    fulfillments: [],
    fulfillmentStatus: "PENDING",
    inventoryBehavior: "DEDUCT",
    priceTaxInterpretation: "EXCLUSIVE",
    customerEmail: email || undefined,
    billingAddress: firstName ? { firstName, lastName: rest.join(" ") || firstName } : undefined,
    subtotal: money(total),
    shippingTotal: money(0),
    taxTotal: money(0),
    discountTotal: money(0),
    grandTotal: money(total),
    lineItems: items.map((item) => ({
      lineItemType: "PHYSICAL_PRODUCT",
      variantId: item.variantId,
      quantity: item.quantity,
      unitPricePaid: money(item.unitPrice),
    })),
  };
  const created = await squarespace("/1.0/commerce/orders", { method: "POST", body: orderBody, idempotencyKey: orderId });
  if (created.ok) {
    return {
      ok: true,
      squarespaceOrderId: String(created.data.id || ""),
      squarespaceOrderNumber: String(created.data.orderNumber || ""),
      inventoryAdjusted: false,
    };
  }
  const adjusted = await squarespace("/1.0/commerce/inventory/adjustments", {
    method: "POST",
    idempotencyKey: `${orderId}-stock`,
    body: { decrementOperations: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) },
  });
  if (!adjusted.ok) {
    throw new Error(
      `Squarespace order ${created.status}: ${squarespaceMessage(created.data)}. Stock ${adjusted.status}: ${squarespaceMessage(adjusted.data)}.`
    );
  }
  return { ok: true, squarespaceOrderId: "", squarespaceOrderNumber: "", inventoryAdjusted: true };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "").trim();
    if (!orderId) throw new Error("An order id is required");
    const order = await getMobileOrder(orderId);
    if (!order || !BOOKABLE.has(String(order.status || ""))) throw new Error("This order is not paid");
    const email = String(order.customer_email || "").trim();
    const name = String(order.shipping?.name || "").trim();
    const items = await seatsFromOrder(order);
    const reserved = await reserveSeats(orderId, email, name, items);
    return NextResponse.json(reserved);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reserve the class seat" }, { status: 400 });
  }
}
