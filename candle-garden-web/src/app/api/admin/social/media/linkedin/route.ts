import { NextResponse } from "next/server";
import { del, get, head } from "@vercel/blob";
import { getAdminSession } from "@/lib/admin/auth";
import {
  finalizeLinkedInVideoUpload,
  initializeLinkedInMediaUpload,
} from "@/lib/admin/social";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_VIDEO_BYTES = 75 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await getAdminSession()).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      kind?: "image" | "video";
      mimeType?: string;
      size?: number;
      assetUrn?: string;
      uploadToken?: string;
      uploadedPartIds?: string[];
      blobUrl?: string;
      name?: string;
    };

    if (body.action === "transfer") {
      const blobUrl = String(body.blobUrl || "");
      if (!/^https:\/\/[a-z0-9]+\.private\.blob\.vercel-storage\.com\//i.test(blobUrl)) {
        return NextResponse.json({ error: "Invalid temporary upload" }, { status: 400 });
      }
      try {
        const metadata = await head(blobUrl);
        const kind = metadata.contentType.startsWith("image/") ? "image" : metadata.contentType === "video/mp4" ? "video" : null;
        if (!kind) throw new Error("Choose a JPG, PNG, GIF, or MP4 file.");
        if (kind === "image" && (!IMAGE_TYPES.has(metadata.contentType) || metadata.size > MAX_IMAGE_BYTES)) {
          throw new Error("Images must be JPG, PNG, or GIF files no larger than 20 MB.");
        }
        if (kind === "video" && (metadata.size < MIN_VIDEO_BYTES || metadata.size > MAX_VIDEO_BYTES)) {
          throw new Error("MP4 videos must be between 75 KB and 500 MB.");
        }

        const upload = await initializeLinkedInMediaUpload({ kind, size: metadata.size });
        const uploadedPartIds: string[] = [];
        for (const instruction of upload.instructions) {
          const blobPart = await get(blobUrl, {
            access: "private",
            useCache: false,
            headers: { Range: `bytes=${instruction.firstByte}-${instruction.lastByte}` },
          });
          if (!blobPart?.stream) throw new Error("Could not read the temporary media upload.");
          const bytes = await new Response(blobPart.stream).arrayBuffer();
          const linkedInUpload = await fetch(instruction.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: bytes,
          });
          if (!linkedInUpload.ok) {
            throw new Error(`LinkedIn rejected media upload part ${uploadedPartIds.length + 1}.`);
          }
          if (kind === "video") {
            const etag = linkedInUpload.headers.get("etag");
            if (!etag) throw new Error("LinkedIn did not confirm the video upload.");
            uploadedPartIds.push(etag.replace(/^\"|\"$/g, ""));
          }
        }
        if (kind === "video") {
          await finalizeLinkedInVideoUpload({
            assetUrn: upload.assetUrn,
            uploadToken: upload.uploadToken,
            uploadedPartIds,
          });
        }
        return NextResponse.json({
          media: {
            kind,
            name: String(body.name || "Uploaded media").slice(0, 200),
            assetUrn: upload.assetUrn,
          },
        });
      } finally {
        await del(blobUrl).catch((error) => console.warn("[admin/social] could not remove staged media", error));
      }
    }

    if (body.action === "finalize") {
      if (
        !body.assetUrn?.startsWith("urn:li:video:") ||
        typeof body.uploadToken !== "string" ||
        !Array.isArray(body.uploadedPartIds) ||
        !body.uploadedPartIds.length
      ) {
        return NextResponse.json({ error: "Invalid video upload data" }, { status: 400 });
      }
      await finalizeLinkedInVideoUpload({
        assetUrn: body.assetUrn,
        uploadToken: body.uploadToken,
        uploadedPartIds: body.uploadedPartIds.map(String),
      });
      return NextResponse.json({ ok: true });
    }

    const size = Number(body.size || 0);
    if (body.kind === "image") {
      if (!IMAGE_TYPES.has(String(body.mimeType || ""))) {
        return NextResponse.json({ error: "Choose a JPG, PNG, or GIF image." }, { status: 400 });
      }
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Images must be 20 MB or smaller." }, { status: 400 });
      }
    } else if (body.kind === "video") {
      if (body.mimeType !== "video/mp4") {
        return NextResponse.json({ error: "LinkedIn video uploads must be MP4 files." }, { status: 400 });
      }
      if (!Number.isSafeInteger(size) || size < MIN_VIDEO_BYTES || size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "MP4 videos must be between 75 KB and 500 MB." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Choose a JPG, PNG, GIF, or MP4 file." }, { status: 400 });
    }

    const upload = await initializeLinkedInMediaUpload({ kind: body.kind, size });
    return NextResponse.json(upload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare media upload" },
      { status: 502 }
    );
  }
}
