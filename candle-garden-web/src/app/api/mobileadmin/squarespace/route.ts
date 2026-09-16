import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createOrderWebhook, verifyCommerceToken } from "@/lib/squarespace/client";
import {
  WEBHOOK_ENDPOINT,
  loadSquarespaceCredentials,
  publicSquarespaceStatus,
  saveSquarespaceCredentials,
} from "@/lib/squarespace/credentials";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(publicSquarespaceStatus(await loadSquarespaceCredentials()));
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    oauthAccessToken?: string;
  };
  const apiKey = body.apiKey?.trim();
  const oauthAccessToken = body.oauthAccessToken?.trim();
  if (!apiKey && !oauthAccessToken) {
    return NextResponse.json({ error: "Paste a Squarespace API key or OAuth access token." }, { status: 400 });
  }

  const tokenToVerify = apiKey || oauthAccessToken || "";
  let website: { id?: string; title?: string } = {};
  try {
    website = await verifyCommerceToken(tokenToVerify);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Squarespace rejected that credential." },
      { status: 400 },
    );
  }

  const saved = await saveSquarespaceCredentials({
    apiKey: apiKey || undefined,
    oauthAccessToken: oauthAccessToken || undefined,
    websiteId: website.id,
    websiteTitle: website.title,
  });

  let webhookNote = "Webhook not created yet. Squarespace only allows webhook subscriptions with an OAuth token, not an API key.";
  if (oauthAccessToken) {
    try {
      const subscription = await createOrderWebhook(oauthAccessToken, WEBHOOK_ENDPOINT);
      await saveSquarespaceCredentials({
        webhookSecret: subscription.secret,
        webhookSubscriptionId: subscription.id,
        websiteId: subscription.websiteId || website.id,
      });
      webhookNote = subscription.secret
        ? `Webhook subscription ${subscription.id} created. Secret stored; it will not be shown again.`
        : `Webhook subscription ${subscription.id} created.`;
    } catch (error) {
      webhookNote = `API key/token saved, but webhook creation failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }

  const status = publicSquarespaceStatus(await loadSquarespaceCredentials());
  return NextResponse.json({
    ok: true,
    message: `Connected to ${website.title || saved.websiteTitle || "Squarespace"}. ${webhookNote}`,
    ...status,
  });
}
