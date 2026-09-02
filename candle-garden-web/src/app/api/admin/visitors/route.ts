import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getVisitSnapshot } from "@/lib/admin/visits";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = request.nextUrl.searchParams.get("days") === "30" ? 30 : 7;
  return NextResponse.json(await getVisitSnapshot(days));
}
