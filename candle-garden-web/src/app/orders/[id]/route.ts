import { NextRequest } from "next/server";
import { proxySaas } from "@/lib/saas-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxySaas(request, `/orders/${encodeURIComponent(id)}`);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxySaas(request, `/orders/${encodeURIComponent(id)}`);
}
