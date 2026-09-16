import { NextRequest, NextResponse } from "next/server";
import { runClassRefresh } from "@/lib/jobs/class-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await runClassRefresh("schedule");
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 502 });
}
