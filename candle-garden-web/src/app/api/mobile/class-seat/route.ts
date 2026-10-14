import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

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

function seatItems(raw: unknown): SeatItem[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error("A class seat needs a variant");
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    const variantId = String(row.variantId || "").trim();
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (!variantId) throw new Error("A class seat needs a variant");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error("That class quantity is invalid");
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("That class has no price");
    return { variantId, quantity, unitPrice, title: String(row.title || "Candle class").slice(0, 200) };
  });
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
  const key = String(process.env.SQUARESPACE_API_KEY || "").trim();
  if (!key) return NextResponse.json({ keyPresent: false, keyLength: 0 });
  const inventory = await squarespace("/1.0/commerce/inventory");
  const orders = await squarespace("/1.0/commerce/orders?modifiedAfter=2026-10-01T00:00:00Z&modifiedBefore=2026-10-13T00:00:00Z");
  return NextResponse.json({
    keyPresent: true,
    keyLength: key.length,
    inventoryStatus: inventory.status,
    ordersStatus: orders.status,
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "").trim();
    if (!orderId) throw new Error("An order id is required");
    const email = String(body.email || "").trim();
    const name = String(body.name || "").trim();
    const items = seatItems(body.items);
    const reserved = await reserveSeats(orderId, email, name, items);
    return NextResponse.json(reserved);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reserve the class seat" }, { status: 400 });
  }
}
