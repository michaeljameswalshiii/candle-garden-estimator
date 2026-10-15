import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TO = ["mike@tripleibusinesssolutions.com", "thepotentpig@gmail.com"];
const FROM = "The Candle Garden <hello@tripleibusinesssolutions.com>";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().slice(0, 160);
  const message = String(body.message || "").trim().slice(0, 4000);
  if (name.length < 2 || message.length < 8) {
    return NextResponse.json({ error: "Please include your name and a short message." }, { status: 400, headers: cors });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Check the email address so we can reply." }, { status: 400, headers: cors });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Email is not ready yet. Use Email us instead." }, { status: 503, headers: cors });
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: TO,
      reply_to: email || undefined,
      subject: `Candle Garden app: ${name}`,
      text: [`From: ${name}`, email ? `Reply to: ${email}` : "", "", message].filter(Boolean).join("\n"),
    }),
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Could not send that note. Use Email us instead." }, { status: 502, headers: cors });
  }
  return NextResponse.json({ ok: true }, { headers: cors });
}
