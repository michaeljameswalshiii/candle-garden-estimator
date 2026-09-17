import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";

const issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_WTA7ZWxcr";
const clientId = "19gc38poajblf8qsagv3s93nvu";
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export type MobileIdentity = JWTPayload & { sub: string; email?: string; name?: string };

export async function mobileIdentity(request: NextRequest): Promise<MobileIdentity | null> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), keys, { issuer, audience: clientId });
    if (payload.token_use !== "id" || !payload.sub) return null;
    return payload as MobileIdentity;
  } catch {
    return null;
  }
}
