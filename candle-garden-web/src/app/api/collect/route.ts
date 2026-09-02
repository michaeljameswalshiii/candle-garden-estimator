import { NextRequest, NextResponse } from "next/server";
import { recordSiteVisit } from "@/lib/admin/visits";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const headers = request.headers;
  await recordSiteVisit({
    path: String(body.path || "/"),
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      "unknown",
    city: decodeURIComponent(headers.get("x-vercel-ip-city") || ""),
    region: headers.get("x-vercel-ip-country-region") || "",
    country: headers.get("x-vercel-ip-country") || "",
    referrer: String(body.referrer || headers.get("referer") || ""),
    userAgent: headers.get("user-agent") || "",
  });
  return NextResponse.json({ ok: true });
}
