import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getSocialAppConfigs,
  SOCIAL_PLATFORMS,
  saveSocialAppConfig,
  type SocialPlatform,
} from "@/lib/admin/social";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession()).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configs = await getSocialAppConfigs();
  return NextResponse.json({
    configured: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform, Boolean(configs[platform])])
    ),
  });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    platform?: string;
    clientId?: string;
    clientSecret?: string;
  };
  const platform = body.platform as SocialPlatform;
  const clientId = String(body.clientId || "").trim();
  const clientSecret = String(body.clientSecret || "").trim();
  if (!SOCIAL_PLATFORMS.includes(platform) || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Platform, client ID, and client secret are required" },
      { status: 400 }
    );
  }
  try {
    await saveSocialAppConfig(platform, { clientId, clientSecret });
    return NextResponse.json({ ok: true, platform });
  } catch (error) {
    console.error("[admin/social/settings] save failed", error);
    return NextResponse.json(
      {
        error:
          "Could not securely save the platform setup. Check server storage configuration.",
      },
      { status: 500 }
    );
  }
}
