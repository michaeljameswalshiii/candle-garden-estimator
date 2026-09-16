import { loadRecord, saveRecord } from "@/lib/admin/store";

const RECORD = "squarespace-credentials";
const WEBHOOK_ENDPOINT = "https://candle-garden-web.vercel.app/api/webhooks/squarespace";

export type SquarespaceCredentials = {
  apiKey?: string;
  oauthAccessToken?: string;
  webhookSecret?: string;
  webhookSubscriptionId?: string;
  websiteId?: string;
  websiteTitle?: string;
  connectedAt?: string;
};

function envValue(name: string) {
  return process.env[name]?.trim() || "";
}

export async function loadSquarespaceCredentials(): Promise<SquarespaceCredentials> {
  const stored = await loadRecord<SquarespaceCredentials>(RECORD, {});
  return {
    apiKey: envValue("SQUARESPACE_API_KEY") || stored.apiKey || "",
    oauthAccessToken: envValue("SQUARESPACE_OAUTH_ACCESS_TOKEN") || stored.oauthAccessToken || "",
    webhookSecret: envValue("SQUARESPACE_WEBHOOK_SECRET") || stored.webhookSecret || "",
    webhookSubscriptionId: stored.webhookSubscriptionId || "",
    websiteId: stored.websiteId || "",
    websiteTitle: stored.websiteTitle || "",
    connectedAt: stored.connectedAt,
  };
}

export async function saveSquarespaceCredentials(patch: SquarespaceCredentials) {
  const current = await loadSquarespaceCredentials();
  const next: SquarespaceCredentials = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    connectedAt: new Date().toISOString(),
  };
  await saveRecord(RECORD, next);
  return next;
}

export function maskSecret(value?: string) {
  const text = String(value || "");
  if (text.length < 8) return text ? "set" : "";
  return `••••${text.slice(-4)}`;
}

export function publicSquarespaceStatus(creds: SquarespaceCredentials) {
  return {
    apiKeyConfigured: Boolean(creds.apiKey),
    apiKeyMasked: maskSecret(creds.apiKey),
    oauthConfigured: Boolean(creds.oauthAccessToken),
    oauthMasked: maskSecret(creds.oauthAccessToken),
    webhookSecretConfigured: Boolean(creds.webhookSecret),
    webhookSecretMasked: maskSecret(creds.webhookSecret),
    webhookSubscriptionId: creds.webhookSubscriptionId || "",
    websiteId: creds.websiteId || "",
    websiteTitle: creds.websiteTitle || "",
    connectedAt: creds.connectedAt || null,
    webhookEndpoint: WEBHOOK_ENDPOINT,
  };
}

export { WEBHOOK_ENDPOINT };
