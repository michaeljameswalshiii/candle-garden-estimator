import { NextRequest, NextResponse } from "next/server";

export const SAAS_API_BASE = (
  process.env.CANDLE_SAAS_API_URL?.trim() ||
  "https://ry95dso7lc.execute-api.us-east-1.amazonaws.com/prod"
).replace(/\/$/, "");

export async function proxySaas(request: NextRequest, path: string) {
  const target = `${SAAS_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": request.headers.get("content-type") || "application/json",
  };
  const authorization = request.headers.get("authorization");
  const deviceId = request.headers.get("x-device-id");
  const idToken = request.headers.get("x-id-token");
  if (authorization) headers.Authorization = authorization;
  if (deviceId) headers["X-Device-Id"] = deviceId;
  if (idToken) headers["X-Id-Token"] = idToken;

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.text();

  try {
    const response = await fetch(target, { method, headers, body, cache: "no-store" });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "The shop API is temporarily unavailable. Try again in a moment." },
      { status: 502 },
    );
  }
}
