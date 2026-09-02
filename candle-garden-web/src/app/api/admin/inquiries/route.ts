import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listInquiries, markInquiryRead } from "@/lib/admin/inquiries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await listInquiries();
  return NextResponse.json({
    items,
    unread: items.filter((item) => item.status === "new").length,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  await markInquiryRead(String(body.id || ""));
  return NextResponse.json({ ok: true });
}
