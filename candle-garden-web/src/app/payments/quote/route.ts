import { NextRequest, NextResponse } from "next/server";
import { priceItems } from "@/lib/mobile-checkout-pricing";

export const dynamic = "force-dynamic";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS" };

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30 || body.items.some((item: { type?: string }) => !["product", "physical", "refill", "class"].includes(item.type || "product"))) {
      throw new Error("Choose candles, refills, or classes to use your gift card.");
    }
    const quote = await priceItems(body.items, body.shipping);
    return NextResponse.json(quote, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify prices." }, { status: 400, headers });
  }
}
