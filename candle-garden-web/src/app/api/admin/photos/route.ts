import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getPhotos, savePhotos, type PhotoSlots } from "@/lib/admin/photos";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ slots: await getPhotos() });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as PhotoSlots;
  const slots = await savePhotos(body);
  return NextResponse.json({ slots });
}
