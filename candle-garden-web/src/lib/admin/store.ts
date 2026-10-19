import { promises as fs } from "fs";
import path from "path";

function diskDir() {
  if (process.env.VERCEL) return path.join("/tmp", "candle-garden-admin");
  return path.join(process.cwd(), ".data");
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

const ADMIN_FILES = ["staff", "alerts", "content", "announcements", "inquiries", "photos", "visits"];
let migration: Promise<void> | null = null;

async function readPrivate(key: string): Promise<string | undefined> {
  const { get } = await import("@vercel/blob");
  const result = await get(key, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return undefined;
  return new Response(result.stream).text();
}

async function migrateAdminBlobs(): Promise<void> {
  if (!blobEnabled()) return;
  if (!migration) {
    migration = (async () => {
      const { list, put, del } = await import("@vercel/blob");
      for (const name of ADMIN_FILES) {
        const key = `admin/${name}.json`;
        try {
          if (await readPrivate(key)) continue;
          const listed = await list({ prefix: key, limit: 20 });
          const match = listed.blobs.find(
            (blob) => blob.pathname === key || blob.pathname.endsWith(`/${key}`)
          );
          if (!match?.url) continue;
          const res = await fetch(match.url, { cache: "no-store" });
          if (!res.ok) continue;
          const json = await res.text();
          JSON.parse(json);
          const written = await put(key, json, {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/json",
            cacheControlMaxAge: 15,
          });
          if (written.url !== match.url) await del(match.url);
        } catch {
          /* Keep the existing copy when a private rewrite is not available. */
        }
      }
    })();
  }
  await migration;
}

export async function loadRecord<T>(name: string, fallback: T): Promise<T> {
  const key = `admin/${name}.json`;
  if (blobEnabled()) {
    try {
      await migrateAdminBlobs();
      const json = await readPrivate(key);
      if (json) return JSON.parse(json) as T;
      const { list } = await import("@vercel/blob");
      const listed = await list({ prefix: key, limit: 20 });
      const match = listed.blobs.find(
        (blob) => blob.pathname === key || blob.pathname.endsWith(`/${key}`)
      );
      if (match?.url) {
        const res = await fetch(match.url, { cache: "no-store" });
        if (res.ok) return (await res.json()) as T;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = await fs.readFile(path.join(diskDir(), `${name}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function saveRecord<T>(name: string, data: T): Promise<void> {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const key = `admin/${name}.json`;
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    await put(key, json, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 15,
    });
    return;
  }
  const full = path.join(diskDir(), `${name}.json`);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, json, "utf8");
}
