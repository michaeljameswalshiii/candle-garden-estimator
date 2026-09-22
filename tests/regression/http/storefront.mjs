import { collect, origin } from "../helpers.mjs";

const ROUTES = [
  {
    path: "/",
    titleBits: ["The Candle Garden"],
    bodyBits: ["Candles with heart", "Shop candles", "Book a class", "100% soy wax"],
  },
  {
    path: "/shop",
    titleBits: ["Shop"],
    bodyBits: ["Small-batch candles", "candles", "Atlantic Beach"],
  },
  {
    path: "/classes",
    titleBits: ["Class"],
    bodyBits: ["Candle-making classes", "Pour something together"],
  },
  {
    path: "/our-story",
    titleBits: ["Story"],
    bodyBits: ["kitchen spark", "flying pig"],
  },
  {
    path: "/contact",
    titleBits: ["Visit"],
    bodyBits: ["We saved you a spot", "Write us", "363 Atlantic"],
  },
];

export async function runStorefrontHttp(base = origin()) {
  const report = collect();
  for (const route of ROUTES) {
    const url = `${base}${route.path}`;
    let response;
    try {
      response = await fetch(url, { redirect: "follow" });
    } catch (error) {
      report.check(route.path, false, error.message);
      continue;
    }
    report.check(route.path, response.ok, `HTTP ${response.status}`);
    const html = await response.text();
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || "";
    for (const bit of route.titleBits) {
      report.check(`${route.path} title`, title.includes(bit) || html.includes(bit), `missing "${bit}"`);
    }
    for (const bit of route.bodyBits) {
      report.check(`${route.path} body`, html.includes(bit), `missing "${bit}"`);
    }
  }

  const shop = await fetch(`${base}/shop`).then((res) => res.text()).catch(() => "");
  report.check("shop count", /\d+(?:<!-- -->)?\s*candles/.test(shop), "missing candle count");
  report.check("shop grid", shop.includes("product-card") || shop.includes("Atlantic Beach"), "missing product cards");

  const classes = await fetch(`${base}/classes`).then((res) => res.text()).catch(() => "");
  const hasDates = classes.includes("seats available") || classes.includes("Sold out");
  const emptyState = classes.includes("New dates are coming soon");
  report.check("classes content", hasDates || emptyState, "missing dates or empty state");
  if (emptyState) report.note("Public classes page is showing the empty upcoming-dates state.");

  const contact = await fetch(`${base}/contact`).then((res) => res.text()).catch(() => "");
  report.check("contact form", contact.includes("contact-form") && contact.includes("Write us"), "missing contact form");

  return report.result({ surface: "storefront-http", base });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("storefront.mjs")) {
  const result = await runStorefrontHttp();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
