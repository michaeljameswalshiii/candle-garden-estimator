import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.michaeljameswalshiii.candlegarden",
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
