import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isAdminConfigured,
  sessionCookieOptions,
  verifyCredentials,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Admin is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || body.email || body.user || "").trim();
  const password = String(body.password || "");
  const result = await verifyCredentials(id, password);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  let token: string;
  try {
    token = createSessionToken(result.id);
  } catch {
    return NextResponse.json({ error: "Staff sign-in is not configured." }, { status: 503 });
  }
  const res = NextResponse.json({ ok: true, id: result.id });
  const cookie = sessionCookieOptions(token);
  res.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return res;
}
