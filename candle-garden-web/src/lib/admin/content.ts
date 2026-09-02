import { hours as defaultHours, site as defaults } from "@/lib/site";
import { loadRecord, saveRecord } from "./store";

export type HourRow = { days: string; time: string };

export type GardenContent = {
  phone: string;
  email: string;
  address: string;
  city: string;
  mapUrl: string;
  instagram: string;
  facebook: string;
  hours: HourRow[];
  banner: string;
  closedToday: boolean;
  closedMessage: string;
  aboutQuote: string;
  aboutLeft: string;
  aboutRight: string;
  heroUrl: string;
  heroAlt: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  date: string;
  published: boolean;
};

export const defaultContent = (): GardenContent => ({
  phone: defaults.phone,
  email: defaults.email,
  address: defaults.address,
  city: defaults.city,
  mapUrl: defaults.mapUrl,
  instagram: defaults.instagram,
  facebook: defaults.facebook,
  hours: defaultHours.map((row) => ({ ...row })),
  banner: "Free shipping on orders over $50",
  closedToday: false,
  closedMessage: "Closed today — see you next open day.",
  aboutQuote:
    "We don’t just pour candles; we pour heart, stories, and a little bit of ‘anything is possible’ into each one.",
  aboutLeft:
    "The Candle Garden began in Jordan’s kitchen more than ten years ago—with curiosity, determination, and a love for making everyday spaces feel warmer.",
  aboutRight:
    "The flying pig was drawn by Jordan’s husband. It became the perfect mark for the business: a playful reminder that the things people call impossible are often just waiting for someone to begin.",
  heroUrl: defaults.hero,
  heroAlt: "The Candle Garden storefront in Atlantic Beach",
});

export async function getGardenContent(): Promise<GardenContent> {
  const stored = await loadRecord<Partial<GardenContent>>("content", {});
  return { ...defaultContent(), ...stored, hours: stored.hours?.length ? stored.hours : defaultContent().hours };
}

export async function saveGardenContent(next: GardenContent): Promise<GardenContent> {
  const cleaned: GardenContent = {
    ...defaultContent(),
    ...next,
    hours: (next.hours || []).filter((row) => row.days.trim() && row.time.trim()).slice(0, 8),
  };
  await saveRecord("content", cleaned);
  return cleaned;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const data = await loadRecord("announcements", { items: [] as Announcement[] });
  return (data.items || []).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveAnnouncements(items: Announcement[]): Promise<Announcement[]> {
  const cleaned = items
    .map((item) => ({
      id: item.id || `post-${Date.now()}`,
      title: String(item.title || "").slice(0, 160),
      body: String(item.body || "").slice(0, 8000),
      date: item.date || new Date().toISOString(),
      published: Boolean(item.published),
    }))
    .filter((item) => item.title);
  await saveRecord("announcements", { items: cleaned });
  return cleaned;
}
