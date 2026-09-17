import { NextRequest, NextResponse } from "next/server";
import { mobileIdentity } from "@/lib/mobile-auth";
import { getMobileOrder } from "@/lib/mobileadmin/data";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const identity = await mobileIdentity(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const order = await getMobileOrder(id);
  if (!order || order.customer_id !== identity.sub) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}
