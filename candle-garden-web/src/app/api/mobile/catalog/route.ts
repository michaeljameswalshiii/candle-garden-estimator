import { NextResponse } from "next/server";
import { getProductCatalog } from "@/lib/jobs/product-refresh";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await getProductCatalog();
  return NextResponse.json(
    {
      products,
      categories: [
        { id: "all", label: "All", sitePath: "/shop" },
        { id: "fall", label: "Fall", sitePath: "/shop/fall" },
        { id: "summer", label: "Summer", sitePath: "/shop/summer" },
        { id: "classic", label: "Classic", sitePath: "/shop/classic" },
        { id: "subscription", label: "Subscriptions", sitePath: "/shop/subscription-boxes" },
        { id: "gift-card", label: "Gift cards", sitePath: "/giftcard" },
      ],
      count: products.length,
      variantCount: products.reduce((count, product) => count + (product.variants?.length || 0), 0),
      refreshedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=1800",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
