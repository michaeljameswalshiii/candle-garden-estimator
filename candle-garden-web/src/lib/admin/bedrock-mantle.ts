import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

export const MANTLE_GROK_MODEL = "xai.grok-4.3";
const REQUEST_TIMEOUT_MS = 30_000;

function region() {
  return process.env.AWS_REGION || "us-east-1";
}

export function bedrockConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

export async function invokeBedrockGrok(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
) {
  const awsRegion = region();
  const baseUrl =
    process.env.BEDROCK_MANTLE_BASE_URL?.replace(/\/$/, "") ||
    `https://bedrock-mantle.${awsRegion}.api.aws/openai/v1`;
  const modelId = process.env.BEDROCK_MANTLE_MODEL_ID || MANTLE_GROK_MODEL;
  const url = `${baseUrl}/chat/completions`;
  const body = JSON.stringify({
    model: modelId,
    temperature: 0.5,
    max_completion_tokens: 2048,
    messages,
  });
  const parsed = new URL(url);
  const signer = new SignatureV4({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "",
      sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || undefined,
    },
    region: awsRegion,
    service: "bedrock",
    sha256: Sha256,
  });
  const signed = await signer.sign(
    new HttpRequest({
      method: "POST",
      protocol: "https:",
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: {
        host: parsed.hostname,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
    }),
  );
  const response = await fetch(url, {
    method: "POST",
    headers: signed.headers as Record<string, string>,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({})) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    };
    model?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `Bedrock could not reply (${response.status}).`);
  }
  return {
    content: data.choices?.[0]?.message?.content?.trim() || "",
    modelId: data.model || modelId,
    inputTokens: data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0,
  };
}

