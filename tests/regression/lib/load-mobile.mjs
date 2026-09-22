import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../helpers.mjs";

const LIB = path.join(ROOT, "candle-garden-mobile/lib");
const FILES = ["upsRates.js", "shippingConfig.js", "pricing.js", "shopCatalog.js", "classesCatalog.js"];

let cache;

function rewrite(source) {
  return source
    .replaceAll("from './upsRates'", "from './upsRates.mjs'")
    .replaceAll('from "./upsRates"', 'from "./upsRates.mjs"')
    .replaceAll("from './shippingConfig'", "from './shippingConfig.mjs'")
    .replaceAll('from "./shippingConfig"', 'from "./shippingConfig.mjs"')
    .replace(
      /from ['"]\.\.\/\.\.\/packages\/catalog\/([^'"]+)['"]/g,
      (_match, file) =>
        `from ${JSON.stringify(pathToFileURL(path.join(ROOT, "packages/catalog", file)).href)} with { type: "json" }`,
    );
}

export async function loadMobileLib() {
  if (cache) return cache;
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "cg-mobile-lib-"));
  for (const name of FILES) {
    const rewritten = rewrite(fs.readFileSync(path.join(LIB, name), "utf8"));
    fs.writeFileSync(path.join(dest, name.replace(/\.js$/, ".mjs")), rewritten);
  }
  cache = {
    pricing: await import(pathToFileURL(path.join(dest, "pricing.mjs")).href),
    shop: await import(pathToFileURL(path.join(dest, "shopCatalog.mjs")).href),
    classes: await import(pathToFileURL(path.join(dest, "classesCatalog.mjs")).href),
    rates: await import(pathToFileURL(path.join(dest, "upsRates.mjs")).href),
    shipping: await import(pathToFileURL(path.join(dest, "shippingConfig.mjs")).href),
  };
  return cache;
}
