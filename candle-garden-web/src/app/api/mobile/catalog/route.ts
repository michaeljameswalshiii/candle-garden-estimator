import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SOURCE = "https://www.thecandlegarden.co/shop?format=json";
const STORE = "https://www.thecandlegarden.co";

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

function money(variant: any) {
  const regular = Number(variant?.priceMoney?.value ?? Number(variant?.price || 0) / 100);
  const sale = Number(variant?.salePriceMoney?.value ?? Number(variant?.salePrice || 0) / 100);
  return variant?.onSale && sale > 0 ? sale : regular;
}

function optionLabel(variant: any) {
  const attributes = variant?.attributes && typeof variant.attributes === "object"
    ? Object.values(variant.attributes)
    : [];
  return attributes.map((value) => clean(value)).filter(Boolean).join(" / ") || null;
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
    const categoryRows = Array.isArray(payload?.nestedCategories?.categories)
      ? payload.nestedCategories.categories
      : [];
    const categoryById = new Map(
      categoryRows.map((row: any) => [String(row.id), String(row.shortSlug || row.displayName || "").toLowerCase()]),
    );
    const categories = [
      { id: "all", label: "All", sitePath: "/shop" },
      ...categoryRows.map((row: any) => ({
        id: String(row.shortSlug || row.id),
        label: clean(row.displayName),
        sitePath: String(row.fullUrl || "/shop"),
      })),
    ];

    const products = (Array.isArray(payload?.items) ? payload.items : [])
      .filter((item: any) => Number(item?.recordType) === 11)
      .map((item: any) => {
        const structured = item?.structuredContent && typeof item.structuredContent === "object"
          ? item.structuredContent
          : item;
        const variants = (Array.isArray(structured?.variants) ? structured.variants : [])
          .map((variant: any) => ({
            id: String(variant?.id || ""),
            sku: String(variant?.sku || ""),
            size: optionLabel(variant),
            price: money(variant),
            onSale: Boolean(variant?.onSale),
            soldOut: !variant?.unlimited && Number(variant?.qtyInStock || 0) < 1,
            unlimited: Boolean(variant?.unlimited),
            quantity: variant?.unlimited ? null : Math.max(0, Number(variant?.qtyInStock || 0)),
            weight: Number(variant?.weight || 0) || null,
            width: Number(variant?.width || 0) || null,
            height: Number(variant?.height || 0) || null,
            length: Number(variant?.len || variant?.length || 0) || null,
            attributes: variant?.attributes || {},
          }))
          .filter((variant: any) => variant.id && variant.price > 0);
        const prices = variants.map((variant: any) => variant.price);
        const images = [item?.assetUrl, ...(Array.isArray(item?.items) ? item.items.map((image: any) => image?.assetUrl) : [])]
          .map((url) => String(url || "").replace(/^http:/, "https:"))
          .filter(Boolean);
        const categoryIds = (Array.isArray(item?.categoryIds) ? item.categoryIds : [])
          .map((id: unknown) => categoryById.get(String(id)))
          .filter(Boolean);
        const subscription = Boolean(structured?.isSubscribable);
        return {
          id: String(item?.id || ""),
          name: clean(item?.title),
          sku: variants[0]?.sku || "",
          price: prices.length ? Math.min(...prices) : 0,
          priceMax: prices.length ? Math.max(...prices) : 0,
          soldOut: variants.length > 0 && variants.every((variant: any) => variant.soldOut),
          description: clean(item?.excerpt || item?.body),
          image: images[0] || "",
          images,
          url: new URL(String(item?.fullUrl || "/shop"), STORE).toString(),
          urlId: String(item?.urlId || ""),
          sizes: variants.map((variant: any) => variant.size).filter(Boolean),
          categories: categoryIds,
          tags: [],
          type: subscription ? "subscription" : "physical",
          isSubscribable: subscription,
          variants,
          updatedOn: item?.updatedOn ? new Date(Number(item.updatedOn)).toISOString() : null,
        };
      })
      .filter((item: any) => item.id && item.name && item.price > 0)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    if (!products.length) throw new Error("No Squarespace products found");
    return NextResponse.json(
      { products, categories, count: products.length, variantCount: products.reduce((sum: number, item: any) => sum + item.variants.length, 0), refreshedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalog refresh failed" },
      { status: 502 },
    );
  }
}
