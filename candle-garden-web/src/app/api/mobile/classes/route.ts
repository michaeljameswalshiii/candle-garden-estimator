import { NextResponse } from "next/server";
import { getClassCatalog } from "@/lib/jobs/class-refresh";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ classes: await getClassCatalog(), refreshedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" } });
}
