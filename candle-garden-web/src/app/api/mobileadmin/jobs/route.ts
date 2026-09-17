import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listJobRuns, runProductRefresh } from "@/lib/jobs/product-refresh";
import { runClassRefresh } from "@/lib/jobs/class-refresh";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    jobs: [
      {
        id: "product-refresh",
        name: "Refresh mobile products",
        schedule: "Hourly, plus Squarespace order webhooks",
        source: "https://www.thecandlegarden.co/shop?format=json",
        agent: "Catalog refresh agent",
        description:
          "Syncs Squarespace product IDs, variant IDs, SKUs, prices, sizes, categories, images, sold-out status, and subscriptions into the mobile catalog. Uses the Commerce Inventory API when SQUARESPACE_API_KEY is set.",
      },
      {
        id: "class-refresh",
        name: "Refresh mobile classes",
        schedule: "Hourly (at :15), plus manual runs",
        source: "https://www.thecandlegarden.co/candle-garden-events",
        agent: "Class schedule agent",
        description: "Publishes public class dates, prices, availability, and direct Squarespace booking links to the mobile app.",
      },
    ],
    runs: await listJobRuns(),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  if (body.jobId !== "product-refresh" && body.jobId !== "class-refresh") {
    return NextResponse.json({ error: "Unknown job" }, { status: 400 });
  }
  const run = body.jobId === "class-refresh" ? await runClassRefresh("manual") : await runProductRefresh("manual");
  return NextResponse.json({ run }, { status: run.status === "succeeded" ? 200 : 502 });
}
