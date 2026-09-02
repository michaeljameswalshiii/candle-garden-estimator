import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAlerts, saveAlerts } from "@/lib/admin/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ alerts: await getAlerts() });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const alerts = await saveAlerts({
    email: String(body.email || ""),
    phone: String(body.phone || ""),
  });
  return NextResponse.json({ alerts });
}
