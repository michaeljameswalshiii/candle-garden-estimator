import { NextRequest, NextResponse } from "next/server";
import { saveInquiry } from "@/lib/admin/inquiries";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const message = String(body.message || "").trim();
  if (name.length < 2 || message.length < 8) {
    return NextResponse.json(
      { error: "Please include your name and a short message." },
      { status: 400 }
    );
  }
  await saveInquiry({
    name,
    email: String(body.email || "").trim() || undefined,
    phone: String(body.phone || "").trim() || undefined,
    message,
  });
  return NextResponse.json({ ok: true });
}
