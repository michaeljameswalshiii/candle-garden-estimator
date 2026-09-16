import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicCatalog, fetchPublicClasses } from "../../packages/catalog/squarespace-public.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, "../../packages/catalog");

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function variantRows(products) {
  const header = [
    "productId",
    "productName",
    "variantId",
    "sku",
    "size",
    "price",
    "soldOut",
    "unlimited",
    "quantity",
    "categories",
    "subscription",
    "url",
  ];
  const lines = [header.join(",")];
  for (const product of products) {
    const variants = product.variants?.length ? product.variants : [{}];
    for (const variant of variants) {
      lines.push(
        [
          product.id,
          product.name,
          variant.id || "",
          variant.sku || product.sku || "",
          variant.size || "",
          variant.price ?? product.price,
          variant.soldOut ?? product.soldOut,
          variant.unlimited ?? "",
          variant.quantity ?? "",
          (product.categories || []).join("|"),
          product.subscription
            ? `${product.subscription.intervalValue || 1} ${product.subscription.intervalUnit || "month"} x${product.subscription.billingCycles || "open"}`
            : "",
          product.url,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

const [{ products, capture, source }, classes] = await Promise.all([fetchPublicCatalog(), fetchPublicClasses()]);
if (products.length < 5) {
  throw new Error(`Export aborted: only ${products.length} products found`);
}

await mkdir(catalogDir, { recursive: true });
await writeFile(path.join(catalogDir, "products.json"), `${JSON.stringify(products, null, 4)}\n`);
await writeFile(path.join(catalogDir, "classes.json"), `${JSON.stringify(classes, null, 4)}\n`);
await writeFile(path.join(catalogDir, "commerce-capture.json"), `${JSON.stringify({ source, ...capture, productCount: products.length, variantCount: products.reduce((n, p) => n + (p.variants?.length || 0), 0), classCount: classes.length }, null, 2)}\n`);
await writeFile(path.join(catalogDir, "variants.csv"), variantRows(products));

console.log(
  JSON.stringify(
    {
      products: products.length,
      variants: products.reduce((n, p) => n + (p.variants?.length || 0), 0),
      classes: classes.length,
      categories: [...new Set(products.flatMap((p) => p.categories))].sort(),
      subscriptions: products.filter((p) => p.isSubscribable).length,
      soldOut: products.filter((p) => p.soldOut).length,
      files: ["products.json", "classes.json", "commerce-capture.json", "variants.csv"],
    },
    null,
    2,
  ),
);
