import { randomUUID } from "crypto";
import { loadRecord, saveRecord } from "./store";
import { listInquiries } from "./inquiries";
import { classes, products } from "@/lib/catalog";
import { bedrockConfigured } from "./bedrock-mantle";

export type SiteVisit = {
  id: string;
  createdAt: string;
  path: string;
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  referrerHost?: string;
  device?: string;
  browser?: string;
};

const EMPTY: { items: SiteVisit[] } = { items: [] };

function clip(value: string | undefined, max: number) {
  return String(value || "").trim().slice(0, max);
}

function parseUserAgent(ua?: string) {
  const value = ua || "";
  const device = /Mobile|Android|iPhone|iPad/i.test(value) ? "Mobile" : "Desktop";
  let browser = "Other";
  if (/Edg\//.test(value)) browser = "Edge";
  else if (/Chrome\//.test(value)) browser = "Chrome";
  else if (/Safari\//.test(value)) browser = "Safari";
  else if (/Firefox\//.test(value)) browser = "Firefox";
  return { device, browser };
}

function referrerHost(referrer?: string) {
  try {
    if (!referrer) return undefined;
    return new URL(referrer).host.slice(0, 80);
  } catch {
    return undefined;
  }
}

function countBy(items: string[]) {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
}

export async function listVisits(): Promise<SiteVisit[]> {
  const data = await loadRecord("visits", EMPTY);
  return data.items || [];
}

export async function recordSiteVisit(input: {
  path?: string;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  referrer?: string;
  userAgent?: string;
}): Promise<void> {
  const path = clip(input.path, 80) || "/";
  if (path.startsWith("/admin") || path.startsWith("/api")) return;
  const visit: SiteVisit = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    path,
    ip: clip(input.ip, 80) || "unknown",
    city: clip(input.city, 80) || undefined,
    region: clip(input.region, 80) || undefined,
    country: clip(input.country, 8).toUpperCase() || undefined,
    referrerHost: referrerHost(input.referrer),
    ...parseUserAgent(input.userAgent),
  };
  const items = await listVisits();
  await saveRecord("visits", { items: [visit, ...items].slice(0, 800) });
}

export function inWindow(items: SiteVisit[], days: number) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => Date.parse(item.createdAt) >= start);
}

export async function getVisitSnapshot(days = 7) {
  const items = inWindow(await listVisits(), days);
  const ips = new Set(items.map((item) => item.ip));
  const cities = countBy(
    items.map((item) => [item.city, item.region, item.country].filter(Boolean).join(", ") || "Unknown")
  );
  const pages = countBy(items.map((item) => item.path));
  const seriesMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    seriesMap.set(day.slice(5), 0);
  }
  for (const item of items) {
    const key = item.createdAt.slice(5, 10);
    if (seriesMap.has(key)) seriesMap.set(key, (seriesMap.get(key) || 0) + 1);
  }
  return {
    days,
    items,
    uniqueVisitors: ips.size,
    uniqueLocations: cities.length,
    topCities: cities.slice(0, 8),
    topPages: pages.slice(0, 8).map((row) => ({ path: row.label, views: row.count })),
    series: [...seriesMap.entries()].map(([label, value]) => ({ label, value })),
    sources: countBy(items.map((item) => item.referrerHost || "direct")).slice(0, 8),
    devices: countBy(items.map((item) => item.device || "Other")),
    browsers: countBy(items.map((item) => item.browser || "Other")),
  };
}

export async function buildSiteReport(days = 7) {
  const snapshot = await getVisitSnapshot(days);
  const inquiries = (await listInquiries()).filter(
    (item) => Date.parse(item.createdAt) >= Date.now() - days * 86400000
  );
  return {
    days,
    generatedAt: new Date().toISOString(),
    views: snapshot.items.length,
    uniqueVisitors: snapshot.uniqueVisitors,
    uniqueLocations: snapshot.uniqueLocations,
    inquiries: inquiries.length,
    unreadInquiries: inquiries.filter((item) => item.status === "new").length,
    series: snapshot.series,
    topPages: snapshot.topPages,
    topCities: snapshot.topCities,
    sources: snapshot.sources,
    devices: snapshot.devices,
    browsers: snapshot.browsers,
  };
}

export async function buildSiteHealth() {
  const snapshot = await getVisitSnapshot(7);
  const inquiries = await listInquiries();
  const unread = inquiries.filter((item) => item.status === "new").length;
  const level = snapshot.items.length ? "good" : "watch";
  return {
    generatedAt: new Date().toISOString(),
    publicUrl: "https://candle-garden-web.vercel.app",
    headline:
      snapshot.items.length > 0
        ? `${snapshot.uniqueVisitors} visitors in the last 7 days`
        : "Waiting on the first public visits",
    level,
    visitors: snapshot,
    catalog: { candles: products.length, classes: classes.length },
    inquiries: { unread, recent: inquiries.length },
    persistence: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : process.env.VERCEL ? "temporary" : "local file",
    grokConfigured: bedrockConfigured(),
  };
}
