import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getSocialAppConfigs,
  oauthCallbackUrl,
  CANDLE_GARDEN_FACEBOOK_PAGE_ID,
  CANDLE_GARDEN_META_BUSINESS_ID,
  saveSocialToken,
  type SocialPlatform,
} from "@/lib/admin/social";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  if (!(await getAdminSession()).ok) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  const platform = (await context.params).platform as SocialPlatform;
  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get(`social_oauth_${platform}`)?.value;
  if (!expectedState || expectedState !== url.searchParams.get("state")) {
    return NextResponse.redirect(
      new URL("/admin/social?oauth=state_error", request.url)
    );
  }
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(
      new URL(`/admin/social?oauth=denied&platform=${platform}`, request.url)
    );
  }
  const code = url.searchParams.get("code");
  const config = (await getSocialAppConfigs())[platform];
  if (!code || !config) {
    return NextResponse.redirect(
      new URL(`/admin/social?oauth=missing&platform=${platform}`, request.url)
    );
  }
  let tokenResponse: Response;
  if (platform === "x") {
    const verifier = jar.get("social_oauth_x_verifier")?.value || "";
    tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: oauthCallbackUrl(request, platform),
        code_verifier: verifier,
      }),
    });
  } else if (platform === "linkedin") {
    tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: oauthCallbackUrl(request, platform),
        }),
      }
    );
  } else if (platform === "instagram") {
    tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        redirect_uri: oauthCallbackUrl(request, platform),
        code,
      }),
    });
  } else {
    tokenResponse = await fetch(
      "https://graph.facebook.com/v24.0/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: oauthCallbackUrl(request, platform),
          code,
        }),
      }
    );
  }
  if (!tokenResponse.ok) {
    console.error(
      "[admin/social] token exchange failed",
      platform,
      await tokenResponse.text()
    );
    return NextResponse.redirect(
      new URL(
        `/admin/social?oauth=exchange_error&platform=${platform}`,
        request.url
      )
    );
  }
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: string | number;
  };
  if (!token.access_token) {
    return NextResponse.redirect(
      new URL(`/admin/social?oauth=no_token&platform=${platform}`, request.url)
    );
  }
  if (platform === "facebook") {
    let userAccessToken = token.access_token;
    const longLived = new URL(
      "https://graph.facebook.com/v24.0/oauth/access_token"
    );
    longLived.search = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      fb_exchange_token: userAccessToken,
    }).toString();
    const longLivedResponse = await fetch(longLived);
    if (longLivedResponse.ok) {
      const exchanged = (await longLivedResponse.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (exchanged.access_token) {
        userAccessToken = exchanged.access_token;
        token.expires_in = exchanged.expires_in || token.expires_in;
      }
    }

    const accountsUrl = new URL("https://graph.facebook.com/v24.0/me/accounts");
    accountsUrl.search = new URLSearchParams({
      fields: "id,name,access_token,tasks",
      access_token: userAccessToken,
    }).toString();
    const accountsResponse = await fetch(accountsUrl);
    if (!accountsResponse.ok) {
      console.error(
        "[admin/social] Facebook Page lookup failed",
        await accountsResponse.text()
      );
      return NextResponse.redirect(
        new URL("/admin/social?oauth=page_lookup_error&platform=facebook", request.url)
      );
    }
    const accounts = (await accountsResponse.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
        tasks?: string[];
      }>;
    };
    const businessPages: NonNullable<typeof accounts.data> = [];
    if (!accounts.data?.length && CANDLE_GARDEN_META_BUSINESS_ID) {
      for (const edge of ["owned_pages", "client_pages"] as const) {
        const businessPagesUrl = new URL(
          `https://graph.facebook.com/v24.0/${CANDLE_GARDEN_META_BUSINESS_ID}/${edge}`
        );
        businessPagesUrl.search = new URLSearchParams({
          fields: "id,name,access_token,tasks",
          access_token: userAccessToken,
        }).toString();
        const businessPagesResponse = await fetch(businessPagesUrl);
        if (businessPagesResponse.ok) {
          const result = (await businessPagesResponse.json()) as {
            data?: NonNullable<typeof accounts.data>;
          };
          businessPages.push(...(result.data || []));
        } else {
          console.warn(
            `[admin/social] Facebook ${edge} lookup failed`,
            await businessPagesResponse.text()
          );
        }
      }
    }
    const returnedPages = [...(accounts.data || []), ...businessPages];
    const availablePages = returnedPages.filter(
      (item) => item.id && item.access_token
    );
    console.info(
      "[admin/social] Facebook Pages available",
      returnedPages.map((item) => ({
        id: item.id,
        name: item.name,
        hasAccessToken: Boolean(item.access_token),
        tasks: item.tasks,
      }))
    );
    const page =
      availablePages.find((item) => item.id === CANDLE_GARDEN_FACEBOOK_PAGE_ID) ||
      availablePages.find((item) =>
        item.name?.toLowerCase().includes("candle garden")
      ) ||
      (availablePages.length === 1 ? availablePages[0] : undefined);
    if (!page?.id || !page.access_token) {
      return NextResponse.redirect(
        new URL("/admin/social?oauth=page_not_found&platform=facebook", request.url)
      );
    }
    await saveSocialToken(platform, {
      accessToken: page.access_token,
      accountId: page.id,
      accountLabel: page.name || "The Candle Garden",
      expiresAt: token.expires_in
        ? Date.now() + token.expires_in * 1000
        : undefined,
    });
    return NextResponse.redirect(
      new URL("/admin/social?oauth=connected&platform=facebook", request.url)
    );
  }
  if (platform === "instagram") {
    let accessToken = token.access_token;
    const longLivedUrl = new URL("https://graph.instagram.com/access_token");
    longLivedUrl.search = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: config.clientSecret,
      access_token: accessToken,
    }).toString();
    const longLivedResponse = await fetch(longLivedUrl);
    if (longLivedResponse.ok) {
      const exchanged = (await longLivedResponse.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (exchanged.access_token) {
        accessToken = exchanged.access_token;
        token.expires_in = exchanged.expires_in || token.expires_in;
      }
    }

    const profileUrl = new URL("https://graph.instagram.com/v24.0/me");
    profileUrl.search = new URLSearchParams({
      fields: "id,user_id,username",
      access_token: accessToken,
    }).toString();
    const profileResponse = await fetch(profileUrl);
    if (!profileResponse.ok) {
      console.error(
        "[admin/social] Instagram profile lookup failed",
        await profileResponse.text()
      );
      return NextResponse.redirect(
        new URL("/admin/social?oauth=profile_error&platform=instagram", request.url)
      );
    }
    const profile = (await profileResponse.json()) as {
      id?: string;
      user_id?: string;
      username?: string;
    };
    const accountId = profile.user_id || profile.id || String(token.user_id || "");
    if (!accountId) {
      return NextResponse.redirect(
        new URL("/admin/social?oauth=no_account&platform=instagram", request.url)
      );
    }
    await saveSocialToken(platform, {
      accessToken,
      accountId,
      accountLabel: profile.username ? `@${profile.username}` : "The Candle Garden",
      expiresAt: token.expires_in
        ? Date.now() + token.expires_in * 1000
        : undefined,
    });
    return NextResponse.redirect(
      new URL("/admin/social?oauth=connected&platform=instagram", request.url)
    );
  }
  await saveSocialToken(platform, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in
      ? Date.now() + token.expires_in * 1000
      : undefined,
  });
  return NextResponse.redirect(
    new URL(`/admin/social?oauth=connected&platform=${platform}`, request.url)
  );
}
