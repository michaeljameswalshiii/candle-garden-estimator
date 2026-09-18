import { NextRequest } from "next/server";
import { proxySaas } from "@/lib/saas-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  return proxySaas(request, "/account/push-token");
}

export async function DELETE(request: NextRequest) {
  return proxySaas(request, "/account/push-token");
}
