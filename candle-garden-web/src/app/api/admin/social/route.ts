import { NextResponse } from "next/server";
import { requireAdmin, getAdminSession } from "@/lib/admin/auth";
import {
  getSocialAppConfigs,
  getSocialTokens,
  listSocialPosts,
  publishToPlatforms,
  saveSocialPost,
  SOCIAL_PLATFORMS,
  type SocialMediaAttachment,
  type SocialPlatform,
} from "@/lib/admin/social";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin()).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configs = await getSocialAppConfigs();
  const tokens = await getSocialTokens();
  return NextResponse.json({
    posts: await listSocialPosts(),
    platforms: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform, Boolean(configs[platform])])
    ),
    connected: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform, Boolean(tokens[platform])])
    ),
  });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    body?: string;
    mediaUrl?: string;
    media?: SocialMediaAttachment;
    platforms?: string[];
  };
  const text = String(body.body || "").trim();
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(
    (p): p is SocialPlatform => SOCIAL_PLATFORMS.includes(p as SocialPlatform)
  );
  if (!text) {
    return NextResponse.json({ error: "Post text is required" }, { status: 400 });
  }
  if (!platforms.length) {
    return NextResponse.json(
      { error: "Choose at least one platform" },
      { status: 400 }
    );
  }
  const mediaUrl = String(body.mediaUrl || "").trim() || undefined;
  const media = body.media &&
    (body.media.kind === "image" || body.media.kind === "video") &&
    String(body.media.name || "").trim() &&
    body.media.assetUrn?.startsWith(`urn:li:${body.media.kind}:`)
      ? {
          kind: body.media.kind,
          name: String(body.media.name).trim().slice(0, 200),
          assetUrn: body.media.assetUrn,
        }
      : undefined;
  if (body.media && !media) {
    return NextResponse.json({ error: "Invalid media attachment" }, { status: 400 });
  }
  const results = await publishToPlatforms({
    text,
    mediaUrl,
    media,
    platforms,
  });
  const statuses = Object.values(results).map((item) => item.status);
  const published = statuses.filter((status) => status === "published").length;
  const failed = statuses.filter((status) => status === "failed").length;
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    createdBy: session.id || "admin",
    body: text,
    mediaUrl,
    media,
    platforms,
    status: published && !failed ? "published" : published ? "partial" : failed ? "failed" : "draft",
    results,
  } as const;
  await saveSocialPost(record);
  return NextResponse.json({ post: record });
}
