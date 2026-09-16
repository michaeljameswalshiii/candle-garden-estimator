import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = "com.michaeljameswalshiii.candlegarden";
  const details = teamId
    ? [
        {
          appID: `${teamId}.${bundleId}`,
          paths: ["/", "/shop", "/shop/*", "/classes", "/privacy", "/privacy/*", "/terms", "/app/return", "/app/return/*"],
        },
      ]
    : [];

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details,
      },
      webcredentials: teamId ? { apps: [`${teamId}.${bundleId}`] } : { apps: [] },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
