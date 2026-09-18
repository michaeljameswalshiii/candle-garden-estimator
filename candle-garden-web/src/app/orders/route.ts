import { NextRequest } from "next/server";
import { proxySaas } from "@/lib/saas-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  return proxySaas(request, "/orders");
}

export async function POST(request: NextRequest) {
  return proxySaas(request, "/orders");
}
