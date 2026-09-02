import { promises as fs } from "fs";
import path from "path";

function diskDir() {
  if (process.env.VERCEL) return path.join("/tmp", "candle-garden-admin");
  return path.join(process.cwd(), ".data");
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function loadRecord<T>(name: string, fallback: T): Promise<T> {
  const key = `admin/${name}.json`;
  if (blobEnabled()) {
    try {
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
      access: "public",
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
