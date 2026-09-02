import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listDrafts, saveDraft, socialStatus } from "@/lib/admin/social";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ...socialStatus(), items: await listDrafts() });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const draft = await saveDraft({
    body: String(body.body || ""),
    platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : [],
  });
  return NextResponse.json({ draft });
}
