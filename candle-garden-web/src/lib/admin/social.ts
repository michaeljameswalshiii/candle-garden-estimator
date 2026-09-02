import { randomUUID } from "crypto";
import { loadRecord, saveRecord } from "./store";

export type SocialDraft = {
  id: string;
  body: string;
  platforms: string[];
  createdAt: string;
  status: "draft" | "posted" | "failed";
  note?: string;
};

export function socialStatus() {
  return {
    configured: {
      instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID),
      facebook: Boolean(process.env.FACEBOOK_PAGE_TOKEN && process.env.FACEBOOK_PAGE_ID),
    },
    connected: {
      instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
      facebook: Boolean(process.env.FACEBOOK_PAGE_TOKEN),
    },
  };
}

export async function listDrafts(): Promise<SocialDraft[]> {
  const data = await loadRecord("social", { items: [] as SocialDraft[] });
  return data.items || [];
}

export async function saveDraft(input: { body: string; platforms: string[] }): Promise<SocialDraft> {
  const draft: SocialDraft = {
    id: randomUUID(),
    body: String(input.body || "").slice(0, 2200),
    platforms: input.platforms.filter(Boolean).slice(0, 4),
    createdAt: new Date().toISOString(),
    status: "draft",
  };
  const items = await listDrafts();
  await saveRecord("social", { items: [draft, ...items].slice(0, 80) });
  return draft;
}

export async function markDraft(id: string, patch: Partial<SocialDraft>): Promise<void> {
  const items = await listDrafts();
  await saveRecord("social", {
    items: items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}
