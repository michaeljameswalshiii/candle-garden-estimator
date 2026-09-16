import { NextRequest, NextResponse } from "next/server";
import { loadRecord, saveRecord } from "@/lib/admin/store";
import { runProductRefresh } from "@/lib/jobs/product-refresh";
import { loadSquarespaceCredentials } from "@/lib/squarespace/credentials";
import {
  shouldRefreshCatalog,
  verifySquarespaceSignature,
  webhookSecretFromEnv,
  type SquarespaceWebhookPayload,
} from "@/lib/squarespace/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EVENTS_RECORD = "squarespace-webhook-events";

type StoredEvent = {
  id: string;
  topic: string;
  websiteId: string | null;
  subscriptionId: string | null;
  receivedAt: string;
  orderId: unknown;
};

async function authorized(request: NextRequest, rawBody: string) {
  const signature = request.headers.get("squarespace-signature") || request.headers.get("Squarespace-Signature");
  const creds = await loadSquarespaceCredentials();
  const secret = creds.webhookSecret || webhookSecretFromEnv();
  if (secret) return verifySquarespaceSignature(rawBody, signature, secret);
  const cron = process.env.CRON_SECRET?.trim();
  return Boolean(cron) && request.headers.get("authorization") === `Bearer ${cron}`;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!(await authorized(request, rawBody))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SquarespaceWebhookPayload = {};
  try {
    payload = JSON.parse(rawBody) as SquarespaceWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event: StoredEvent = {
    id: payload.id || crypto.randomUUID(),
    topic: payload.topic || "unknown",
    websiteId: payload.websiteId || null,
    subscriptionId: payload.subscriptionId || null,
    receivedAt: new Date().toISOString(),
    orderId: typeof payload.data?.orderId === "string" ? payload.data.orderId : payload.data?.id || null,
  };
  const previous = await loadRecord<StoredEvent[]>(EVENTS_RECORD, []);
  await saveRecord(EVENTS_RECORD, [event, ...previous].slice(0, 50));

  if (!shouldRefreshCatalog(payload.topic)) {
    return NextResponse.json({ ok: true, ignored: payload.topic || "unknown" });
  }

  const run = await runProductRefresh("webhook");
  return NextResponse.json(
    { ok: run.status === "succeeded", run },
    { status: run.status === "succeeded" ? 200 : 502 },
  );
}
