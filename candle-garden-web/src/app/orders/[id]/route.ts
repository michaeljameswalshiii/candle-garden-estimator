import { NextRequest, NextResponse } from "next/server";
import { mobileCustomerId } from "@/lib/mobile-auth";
import { getMobileOrder } from "@/lib/mobileadmin/data";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let customerId:string;
  try { customerId=await mobileCustomerId(request); } catch { return NextResponse.json({error:"Unauthorized"},{status:401}); }
  const { id } = await context.params;
  const order = await getMobileOrder(id);
  if (!order || order.customer_id !== customerId) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}
