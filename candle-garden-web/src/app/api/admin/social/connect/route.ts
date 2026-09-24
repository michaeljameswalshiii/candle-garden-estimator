import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getSocialAppConfigs,
  FACEBOOK_LOGIN_CONFIG_ID,
  META_OAUTH_ORIGIN,
  oauthCallbackUrl,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/admin/social";

export const dynamic = "force-dynamic";

function base64url(value: Buffer) {
  return value.toString("base64url");
}

export async function GET(request: Request) {
  if (!(await getAdminSession()).ok) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  const platform = new URL(request.url).searchParams.get(
    "platform"
  ) as SocialPlatform;
  if (!SOCIAL_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  }
  if (platform === "facebook" || platform === "instagram") {
    const origin = new URL(request.url).origin.replace(/\/$/, "");
    if (origin !== META_OAUTH_ORIGIN) {
      return NextResponse.redirect(
        `${META_OAUTH_ORIGIN}/api/admin/social/connect?platform=${platform}`,
      );
    }
  }
  const config = (await getSocialAppConfigs())[platform];
  if (!config) {
    return NextResponse.redirect(
      new URL(`/admin/social?setup=${platform}`, request.url)
    );
  }
  const state = base64url(randomBytes(24));
  const jar = await cookies();
  jar.set(`social_oauth_${platform}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  let authorization: URL;
  if (platform === "x") {
    const verifier = base64url(randomBytes(32));
    jar.set("social_oauth_x_verifier", verifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    authorization = new URL("https://x.com/i/oauth2/authorize");
    authorization.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: oauthCallbackUrl(request, platform),
      scope: "tweet.read tweet.write users.read offline.access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
  } else if (platform === "linkedin") {
    authorization = new URL("https://www.linkedin.com/oauth/v2/authorization");
    authorization.search = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: oauthCallbackUrl(request, platform),
      scope: "openid profile w_member_social",
      state,
    }).toString();
  } else if (platform === "instagram") {
    authorization = new URL("https://www.instagram.com/oauth/authorize");
    authorization.search = new URLSearchParams({
      enable_fb_login: "0",
      force_authentication: "1",
      client_id: config.clientId,
      redirect_uri: oauthCallbackUrl(request, platform),
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_content_publish",
      state,
    }).toString();
  } else {
    authorization = new URL("https://www.facebook.com/v24.0/dialog/oauth");
    const parameters: Record<string, string> = {
      client_id: config.clientId,
      redirect_uri: oauthCallbackUrl(request, platform),
      state,
      auth_type: "rerequest",
    };
    if (FACEBOOK_LOGIN_CONFIG_ID) {
      parameters.config_id = FACEBOOK_LOGIN_CONFIG_ID;
    } else {
      parameters.scope =
        "pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_metadata,business_management";
    }
    authorization.search = new URLSearchParams(parameters).toString();
  }
  return NextResponse.redirect(authorization);
}
