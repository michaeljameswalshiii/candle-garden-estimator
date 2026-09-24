import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "x", "linkedin"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Facebook/Instagram Login should use this host in Meta App Domains. */
export const SOCIAL_OAUTH_ORIGIN =
  process.env.SOCIAL_OAUTH_ORIGIN?.replace(/\/$/, "") ||
  "https://candle-garden-web.vercel.app";
export const META_OAUTH_ORIGIN = SOCIAL_OAUTH_ORIGIN;
export const FACEBOOK_LOGIN_CONFIG_ID = process.env.META_FACEBOOK_LOGIN_CONFIG_ID || "";
export const CANDLE_GARDEN_FACEBOOK_PAGE_ID = process.env.META_FACEBOOK_PAGE_ID || "";
export const CANDLE_GARDEN_META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const socialClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } },
);

function usageTableName() {
  return process.env.DYNAMODB_BEDROCK_USAGE_TABLE || "turnkey-bedrock-usage";
}

function usageTenantId() {
  return process.env.AI_USAGE_TENANT_ID || "site-candle-garden";
}

function adminDocumentClient() {
  return socialClient;
}

export function oauthCallbackUrl(request: Request, platform: SocialPlatform) {
  const requestOrigin = new URL(request.url).origin.replace(/\/$/, "");
  const origin =
    requestOrigin === "http://localhost:3000" || requestOrigin === "http://127.0.0.1:3000"
      ? requestOrigin
      : SOCIAL_OAUTH_ORIGIN;
  return `${origin}/api/admin/social/${platform}/callback`;
}

export type SocialPostRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  body: string;
  mediaUrl?: string;
  media?: SocialMediaAttachment;
  platforms: SocialPlatform[];
  status: "draft" | "queued" | "published" | "partial" | "failed";
  results: Partial<Record<SocialPlatform, { status: string; note?: string; postId?: string }>>;
};

export type SocialMediaAttachment = {
  kind: "image" | "video";
  name: string;
  assetUrn: string;
};

export type SocialAppConfig = {
  clientId: string;
  clientSecret: string;
};

export type SocialToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  accountLabel?: string;
};

const localPosts: SocialPostRecord[] = [];

function pk() {
  return `TENANT#${usageTenantId()}`;
}

function key(id: string) {
  return `SOCIAL#${id}`;
}

function appConfigKey(platform: SocialPlatform) {
  return `SOCIAL_CONFIG#${platform}`;
}

function encryptionKey() {
  return createHash("sha256")
    .update(process.env.SOCIAL_CONFIG_ENCRYPTION_KEY || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "")
    .digest();
}

export function encryptSocialSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSocialSecret(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

export async function getSocialAppConfigs(): Promise<Partial<Record<SocialPlatform, SocialAppConfig>>> {
  const result: Partial<Record<SocialPlatform, SocialAppConfig>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    try {
      const item = await adminDocumentClient().send(new GetCommand({ TableName: usageTableName(), Key: { PK: pk(), SK: appConfigKey(platform) } }));
      if (item.Item?.clientId && item.Item?.clientSecret) {
        result[platform] = { clientId: String(item.Item.clientId), clientSecret: decryptSocialSecret(String(item.Item.clientSecret)) };
      }
    } catch (error) {
      console.warn(`[admin/social] could not read ${platform} app configuration`, error);
    }
  }
  return result;
}

export async function saveSocialAppConfig(platform: SocialPlatform, config: SocialAppConfig) {
  await adminDocumentClient().send(new PutCommand({
    TableName: usageTableName(),
    Item: { PK: pk(), SK: appConfigKey(platform), clientId: config.clientId, clientSecret: encryptSocialSecret(config.clientSecret), updatedAt: new Date().toISOString() },
  }));
}

export async function saveSocialToken(platform: SocialPlatform, token: SocialToken) {
  await adminDocumentClient().send(new PutCommand({
    TableName: usageTableName(),
    Item: { PK: pk(), SK: `SOCIAL_TOKEN#${platform}`, token: encryptSocialSecret(JSON.stringify(token)), updatedAt: new Date().toISOString() },
  }));
}

export async function getSocialTokens(): Promise<Partial<Record<SocialPlatform, SocialToken>>> {
  const result: Partial<Record<SocialPlatform, SocialToken>> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    try {
      const item = await adminDocumentClient().send(new GetCommand({ TableName: usageTableName(), Key: { PK: pk(), SK: `SOCIAL_TOKEN#${platform}` } }));
      if (item.Item?.token) result[platform] = JSON.parse(decryptSocialSecret(String(item.Item.token))) as SocialToken;
    } catch (error) {
      console.warn(`[admin/social] could not read ${platform} token`, error);
    }
  }
  return result;
}

export async function socialStatus() {
  const configs = await getSocialAppConfigs();
  const tokens = await getSocialTokens();
  return {
    configured: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform, Boolean(configs[platform])]),
    ),
    connected: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform, Boolean(tokens[platform])]),
    ),
  };
}

export function socialPlatformConfig() {
  return {
    instagram: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    facebook: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    x: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
    linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  } satisfies Record<SocialPlatform, boolean>;
}

export async function listSocialPosts(limit = 50): Promise<SocialPostRecord[]> {
  try {
    const result = await adminDocumentClient().send(
      new QueryCommand({
        TableName: usageTableName(),
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": pk(), ":prefix": "SOCIAL#" },
        ScanIndexForward: false,
        Limit: Math.min(Math.max(limit, 1), 100),
      })
    );
    return (result.Items || []) as SocialPostRecord[];
  } catch (error) {
    console.warn("[admin/social] history unavailable; using process-local fallback", error);
    return localPosts.slice(0, limit);
  }
}

export async function saveSocialPost(record: SocialPostRecord) {
  localPosts.unshift(record);
  try {
    await adminDocumentClient().send(
      new PutCommand({
        TableName: usageTableName(),
        Item: { PK: pk(), SK: key(record.id), ...record },
      })
    );
  } catch (error) {
    console.warn("[admin/social] could not persist history", error);
  }
}

type PublishResult = {
  status: string;
  note?: string;
  postId?: string;
};

const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || "202607";

function linkedInHeaders(accessToken: string, contentType = "application/json") {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": contentType,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function linkedInAccess() {
  const accessToken = (await getSocialTokens()).linkedin?.accessToken;
  if (!accessToken) throw new Error("Connect LinkedIn first.");
  const author = await linkedInAuthorUrn(accessToken);
  return { accessToken, author };
}

export type LinkedInUploadInstruction = {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
};

export async function initializeLinkedInMediaUpload(input: {
  kind: "image" | "video";
  size: number;
}) {
  const { accessToken, author } = await linkedInAccess();
  const endpoint = input.kind === "image" ? "images" : "videos";
  const initializeUploadRequest = input.kind === "image"
    ? { owner: author }
    : {
        owner: author,
        fileSizeBytes: input.size,
        uploadCaptions: false,
        uploadThumbnail: false,
      };
  const response = await fetch(
    `https://api.linkedin.com/rest/${endpoint}?action=initializeUpload`,
    {
      method: "POST",
      headers: linkedInHeaders(accessToken),
      body: JSON.stringify({ initializeUploadRequest }),
    }
  );
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw.slice(0, 400) || `LinkedIn could not start the ${input.kind} upload.`);
  }
  const parsed = JSON.parse(raw) as {
    value?: {
      image?: string;
      video?: string;
      uploadUrl?: string;
      uploadToken?: string;
      uploadInstructions?: LinkedInUploadInstruction[];
    };
  };
  const value = parsed.value;
  const assetUrn = input.kind === "image" ? value?.image : value?.video;
  const instructions = input.kind === "image"
    ? value?.uploadUrl
      ? [{ uploadUrl: value.uploadUrl, firstByte: 0, lastByte: input.size - 1 }]
      : []
    : value?.uploadInstructions || [];
  if (!assetUrn || !instructions.length) {
    throw new Error(`LinkedIn did not return a usable ${input.kind} upload.`);
  }
  return {
    assetUrn,
    uploadToken: value?.uploadToken || "",
    instructions,
  };
}

export async function finalizeLinkedInVideoUpload(input: {
  assetUrn: string;
  uploadToken: string;
  uploadedPartIds: string[];
}) {
  const { accessToken } = await linkedInAccess();
  const response = await fetch(
    "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    {
      method: "POST",
      headers: linkedInHeaders(accessToken),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: input.assetUrn,
          uploadToken: input.uploadToken,
          uploadedPartIds: input.uploadedPartIds,
        },
      }),
    }
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(detail || "LinkedIn could not finish the video upload.");
  }
}

async function linkedInAuthorUrn(accessToken: string): Promise<string> {
  const userinfo = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (userinfo.ok) {
    const profile = (await userinfo.json()) as { sub?: string };
    if (profile.sub) return `urn:li:person:${profile.sub}`;
  }
  const me = await fetch("https://api.linkedin.com/v2/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (me.ok) {
    const profile = (await me.json()) as { id?: string };
    if (profile.id) return `urn:li:person:${profile.id}`;
  }
  throw new Error("Could not read the LinkedIn member id. Click Reconnect and approve OpenID / profile.");
}

export async function publishToLinkedIn(
  text: string,
  mediaUrl?: string,
  media?: SocialMediaAttachment
): Promise<PublishResult> {
  const tokens = await getSocialTokens();
  const accessToken = tokens.linkedin?.accessToken;
  if (!accessToken) {
    return { status: "needs_connection", note: "Connect LinkedIn first." };
  }

  let author: string;
  try {
    author = await linkedInAuthorUrn(accessToken);
  } catch (error) {
    return {
      status: "failed",
      note: error instanceof Error ? error.message : "LinkedIn profile lookup failed.",
    };
  }

  const commentary = mediaUrl ? `${text.trim()}\n${mediaUrl}` : text.trim();
  const headers = linkedInHeaders(accessToken);
  const content = media
    ? {
        media: {
          id: media.assetUrn,
          title: media.name,
        },
      }
    : undefined;

  const rest = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      commentary,
      ...(content ? { content } : {}),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (rest.ok) {
    return {
      status: "published",
      note: "Posted to your LinkedIn profile.",
      postId: rest.headers.get("x-restli-id") || undefined,
    };
  }
  const restError = await rest.text();

  if (media) {
    const detail = restError.slice(0, 400);
    return {
      status: "failed",
      note: detail || "LinkedIn rejected the media post. Reconnect LinkedIn and try again.",
    };
  }

  const ugc = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: commentary },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });
  if (ugc.ok) {
    return {
      status: "published",
      note: "Posted to your LinkedIn profile.",
      postId: ugc.headers.get("x-restli-id") || undefined,
    };
  }

  const detail = ((await ugc.text()) || restError).slice(0, 400);
  return {
    status: "failed",
    note:
      detail ||
      "LinkedIn rejected the post. Confirm Share on LinkedIn is added to the developer app, then Reconnect.",
  };
}

async function publishToFacebook(
  text: string,
  mediaUrl?: string
): Promise<PublishResult> {
  const token = (await getSocialTokens()).facebook;
  if (!token?.accessToken || !token.accountId) {
    return {
      status: "needs_connection",
      note: "Reconnect Facebook so The Candle Garden can select the Page account.",
    };
  }

  const endpoint = `https://graph.facebook.com/v24.0/${encodeURIComponent(token.accountId)}/feed`;
  const body = new URLSearchParams({
    message: text.trim(),
    access_token: token.accessToken,
  });
  if (mediaUrl) body.set("link", mediaUrl);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      detail = parsed.error?.message || raw;
    } catch {}
    const missingPagePermission =
      detail.includes("(#283)") ||
      detail.toLowerCase().includes("pages_read_engagement");
    return {
      status: "failed",
      note: missingPagePermission
        ? "Facebook authorization is missing Page access. Click Reconnect for Facebook Page, approve all requested Page permissions, then post again."
        : detail.slice(0, 400) || "Facebook rejected the Page post.",
    };
  }
  const result = JSON.parse(raw) as { id?: string };
  return {
    status: "published",
    note: `Posted to ${token.accountLabel || "the Candle Garden Facebook Page"}.`,
    postId: result.id,
  };
}

async function publishToInstagram(
  text: string,
  mediaUrl?: string
): Promise<PublishResult> {
  const token = (await getSocialTokens()).instagram;
  if (!token?.accessToken || !token.accountId) {
    return {
      status: "needs_connection",
      note: "Connect The Candle Garden Instagram account first.",
    };
  }
  if (!mediaUrl) {
    return {
      status: "failed",
      note: "Instagram requires a publicly accessible image or MP4 URL.",
    };
  }

  let isVideo = false;
  try {
    isVideo = new URL(mediaUrl).pathname.toLowerCase().endsWith(".mp4");
  } catch {
    return { status: "failed", note: "Enter a valid public media URL for Instagram." };
  }
  const createBody = new URLSearchParams({
    caption: text.trim(),
    access_token: token.accessToken,
  });
  if (isVideo) {
    createBody.set("media_type", "REELS");
    createBody.set("video_url", mediaUrl);
  } else {
    createBody.set("image_url", mediaUrl);
  }
  const createResponse = await fetch(
    `https://graph.instagram.com/v24.0/${encodeURIComponent(token.accountId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createBody,
    }
  );
  const createRaw = await createResponse.text();
  if (!createResponse.ok) {
    let detail = createRaw;
    try {
      const parsed = JSON.parse(createRaw) as { error?: { message?: string } };
      detail = parsed.error?.message || createRaw;
    } catch {}
    return { status: "failed", note: detail.slice(0, 400) };
  }
  const container = JSON.parse(createRaw) as { id?: string };
  if (!container.id) {
    return { status: "failed", note: "Instagram did not create a media container." };
  }

  const publishResponse = await fetch(
    `https://graph.instagram.com/v24.0/${encodeURIComponent(token.accountId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: token.accessToken,
      }),
    }
  );
  const publishRaw = await publishResponse.text();
  if (!publishResponse.ok) {
    let detail = publishRaw;
    try {
      const parsed = JSON.parse(publishRaw) as { error?: { message?: string } };
      detail = parsed.error?.message || publishRaw;
    } catch {}
    return { status: "failed", note: detail.slice(0, 400) };
  }
  const published = JSON.parse(publishRaw) as { id?: string };
  return {
    status: "published",
    note: `Posted to ${token.accountLabel || "Instagram"}.`,
    postId: published.id,
  };
}

export async function publishToPlatforms(input: {
  text: string;
  mediaUrl?: string;
  media?: SocialMediaAttachment;
  platforms: SocialPlatform[];
}): Promise<SocialPostRecord["results"]> {
  const tokens = await getSocialTokens();
  const results: SocialPostRecord["results"] = {};
  for (const platform of input.platforms) {
    if (platform === "linkedin") {
      results[platform] = await publishToLinkedIn(input.text, input.mediaUrl, input.media);
      continue;
    }
    if (platform === "facebook") {
      results[platform] = await publishToFacebook(input.text, input.mediaUrl);
      continue;
    }
    if (platform === "instagram") {
      results[platform] = await publishToInstagram(input.text, input.mediaUrl);
      continue;
    }
    if (!tokens[platform]) {
      results[platform] = {
        status: "skipped",
        note: "Not connected yet — skipped so LinkedIn can still publish.",
      };
      continue;
    }
    results[platform] = {
      status: "not_implemented",
      note: "This network is connected but live publishing is not enabled yet.",
    };
  }
  return results;
}
