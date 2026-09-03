import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAiUsage } from "@/lib/admin/ai-usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ usage: await getAiUsage() });
}
