import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordMobileEvent } from "@/lib/mobile-events";

const allowed = new Set(["app_open", "screen_view", "payment_success"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || "");
    if (!allowed.has(name)) return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
    const now = new Date();
    await recordMobileEvent({ id: randomUUID(), name, screen: body.screen ? String(body.screen).slice(0, 40) : undefined, device_id: String(request.headers.get("x-device-id") || "unknown").slice(0, 100), created_at: now.toISOString(), expires_at: Math.floor(now.getTime() / 1000) + 400 * 86400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not record event" }, { status: 400 });
  }
}
