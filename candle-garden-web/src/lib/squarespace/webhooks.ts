import { createHmac, timingSafeEqual } from "node:crypto";

export const SQUARESPACE_WEBHOOK_TOPICS = [
  "order.create",
  "order.update",
  "extension.uninstall",
] as const;

export type SquarespaceWebhookTopic = (typeof SQUARESPACE_WEBHOOK_TOPICS)[number];

export type SquarespaceWebhookPayload = {
  id?: string;
  websiteId?: string;
  subscriptionId?: string;
  topic?: string;
  createdOn?: string;
  data?: Record<string, unknown>;
};

export function webhookSecretFromEnv() {
  return process.env.SQUARESPACE_WEBHOOK_SECRET?.trim() || "";
}

export function verifySquarespaceSignature(rawBody: string, headerSignature: string | null, secret: string) {
  if (!secret || !headerSignature) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "hex")).update(rawBody).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(headerSignature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function shouldRefreshCatalog(topic: string | undefined) {
  return topic === "order.create" || topic === "order.update";
}
