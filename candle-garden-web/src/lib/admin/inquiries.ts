import { randomUUID } from "crypto";
import { loadRecord, saveRecord } from "./store";

export type SiteInquiry = {
  id: string;
  createdAt: string;
  name: string;
  email?: string;
  phone?: string;
  message: string;
  status: "new" | "read";
};

const EMPTY: { items: SiteInquiry[] } = { items: [] };

export async function listInquiries(): Promise<SiteInquiry[]> {
  const data = await loadRecord("inquiries", EMPTY);
  return (data.items || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveInquiry(input: {
  name: string;
  email?: string;
  phone?: string;
  message: string;
}): Promise<SiteInquiry> {
  const item: SiteInquiry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    name: String(input.name || "Visitor").slice(0, 120),
    email: input.email?.slice(0, 160) || undefined,
    phone: input.phone?.slice(0, 40) || undefined,
    message: String(input.message || "").slice(0, 4000),
    status: "new",
  };
  const items = await listInquiries();
  await saveRecord("inquiries", { items: [item, ...items].slice(0, 400) });
  return item;
}

export async function markInquiryRead(id: string): Promise<void> {
  const items = await listInquiries();
  await saveRecord("inquiries", {
    items: items.map((item) => (item.id === id ? { ...item, status: "read" as const } : item)),
  });
}
