import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SOURCE = "https://www.thecandlegarden.co/candle-garden-events?format=json";

function clean(value: unknown) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classDate(title: string) {
  const match = title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (!match) return "";
  const now = new Date();
  let year = now.getUTCFullYear();
  let value = new Date(`${match[1]} ${match[2]}, ${year} 12:00:00 UTC`);
  if (value.getTime() < now.getTime() - 180 * 86400000) value = new Date(`${match[1]} ${match[2]}, ${year + 1} 12:00:00 UTC`);
  return value.toISOString().slice(0, 10);
}

function classTime(title: string) {
  return title.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i)?.[1].replace(/\s+/g, "").toUpperCase() || "";
}

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "CandleGardenCatalogAgent/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Squarespace returned ${response.status}`);
    const payload = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    const classes = (Array.isArray(payload?.items) ? payload.items : [])
      .filter((item: any) => Number(item?.recordType) === 11 || item?.recordTypeLabel === "store-item" || item?.structuredContent)
      .map((item: any) => {
        const structured = item?.structuredContent && typeof item.structuredContent === "object" ? item.structuredContent : item;
        const variant = (Array.isArray(structured?.variants) ? structured.variants : Array.isArray(item?.variants) ? item.variants : [])[0] || {};
        const label = clean(item?.title);
        const date = classDate(label);
        const available = variant.unlimited ? null : Math.max(0, Number(variant.qtyInStock || 0));
        const basePrice = Number(variant?.priceMoney?.value ?? Number(variant?.price || 0) / 100);
        const salePrice = Number(variant?.salePriceMoney?.value ?? Number(variant?.salePrice || 0) / 100);
        const price = variant?.onSale && salePrice > 0 ? salePrice : basePrice;
        return {
          id: String(item?.id || ""), title: "Candle Making Class", scheduleLabel: label, date,
          dateDisplay: label.split(/\s+at\s+/i)[0], time: classTime(label), duration: "About 1 hour",
          price, available: available ?? 0, soldOut: available !== null && available < 1,
          description: clean(item?.excerpt || item?.body).slice(0, 240), fullDescription: clean(item?.body),
          image: String(item?.assetUrl || "").replace(/^http:/, "https:"), sku: String(variant?.sku || ""),
          url: new URL(String(item?.fullUrl || "/candle-garden-events"), "https://www.thecandlegarden.co").toString(),
          location: "The Candle Garden · Atlantic Beach, FL",
        };
      })
      .filter((item: any) => item.id && item.date >= today && !/^test\b/i.test(item.scheduleLabel) && !/\bprivate\b/i.test(item.scheduleLabel) && !seen.has(item.id) && seen.add(item.id))
      .sort((a: any, b: any) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (!classes.length) throw new Error("No upcoming public classes found");
    return NextResponse.json({ classes, refreshedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Class refresh failed" }, { status: 502 });
  }
}
