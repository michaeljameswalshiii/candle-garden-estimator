import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const FAIL_CLOSED = {
  success: false,
  container_detected: false,
  error: "detect_unavailable",
  tips: [
    "Estimator is temporarily unavailable",
    "Enter ounces manually",
  ],
};

export async function POST(request: NextRequest) {
  const target = process.env.DETECT_FUNCTION_URL?.trim();
  if (!target) {
    return NextResponse.json(FAIL_CLOSED, { status: 503 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") || "application/json",
  };
  const authorization = request.headers.get("authorization");
  const deviceId = request.headers.get("x-device-id");
  if (authorization) headers.Authorization = authorization;
  if (deviceId) headers["X-Device-Id"] = deviceId;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body,
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(FAIL_CLOSED, { status: 502 });
  }
}
