import { NextResponse } from "next/server";
import { getAdminSession, isAdminConfigured } from "@/lib/admin/auth";
import { socialStatus } from "@/lib/admin/social";
import { bedrockConfigured } from "@/lib/admin/bedrock-mantle";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const social = socialStatus();
  return NextResponse.json({
    id: session.id,
    adminConfigured: isAdminConfigured(),
    grokConfigured: bedrockConfigured(),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    social,
  });
}
