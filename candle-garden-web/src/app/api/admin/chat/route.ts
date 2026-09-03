import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getGardenContent } from "@/lib/admin/content";
import { bedrockConfigured, invokeBedrockGrok } from "@/lib/admin/bedrock-mantle";
import { AiBudgetExceededError, estimateMaximumRequestMicrousd, releaseAiBudget, reserveAiBudget, settleAiBudget } from "@/lib/admin/ai-usage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!bedrockConfigured()) {
    return NextResponse.json(
      { error: "Content AI needs AWS Bedrock credentials on the server." },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const content = await getGardenContent();
  const modelMessages = [
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
      ] as Array<{ role: "system" | "user" | "assistant"; content: string }>;
  let reservation = 0;
  let invoked = false;
  try {
    reservation = await reserveAiBudget(estimateMaximumRequestMicrousd(modelMessages));
    const result = await invokeBedrockGrok(modelMessages);
    invoked = true;
    const usage = await settleAiBudget(reservation, result.inputTokens, result.outputTokens);
    return NextResponse.json({ reply: result.content, usage });
  } catch (error) {
    if (reservation && !invoked) await releaseAiBudget(reservation).catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grok could not reply.", ...(error instanceof AiBudgetExceededError ? { usage: error.usage } : {}) },
      { status: error instanceof AiBudgetExceededError ? 429 : 502 },
    );
  }
}
