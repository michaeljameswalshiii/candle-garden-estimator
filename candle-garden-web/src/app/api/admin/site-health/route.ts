import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { buildSiteHealth } from "@/lib/admin/visits";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await buildSiteHealth());
}
