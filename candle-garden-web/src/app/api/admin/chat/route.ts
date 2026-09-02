import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getGardenContent } from "@/lib/admin/content";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.XAI_API_KEY) {
    return NextResponse.json(
      { error: "Content AI needs XAI_API_KEY on the server." },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const content = await getGardenContent();
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `You help staff rewrite copy for The Candle Garden, a soy candle shop in Atlantic Beach, Florida. Keep the voice warm, playful, and specific. Current shop facts: ${JSON.stringify({
            phone: content.phone,
            address: content.address,
            city: content.city,
            hours: content.hours,
            banner: content.banner,
          })}. Suggest wording they can paste into Business info or Announcements. Do not invent prices or class dates.`,
        },
        ...messages
          .filter((item: { role?: string; content?: string }) => item.content)
          .slice(-12)
          .map((item: { role?: string; content?: string }) => ({
            role: item.role === "assistant" ? "assistant" : "user",
            content: String(item.content).slice(0, 4000),
          })),
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Grok could not reply." },
      { status: 502 }
    );
  }
  const reply = data.choices?.[0]?.message?.content || "";
  return NextResponse.json({ reply });
}
