import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listIntegrations } from "@/lib/mobileadmin/integrations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listIntegrations());
}
