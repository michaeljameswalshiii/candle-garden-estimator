import { collect, hasText, origin } from "../helpers.mjs";

export default async function run(page) {
  const base = origin();
  const report = collect();

  async function open(path) {
    const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    report.check(path, Boolean(response && response.ok()), `HTTP ${response?.status()}`);
    await page.waitForSelector("body", { timeout: 15000 });
    return page.locator("body").innerText();
  }

  const home = await open("/");
  report.check("home hero", hasText(home, "Candles with heart"));
  report.check("home shop cta", hasText(home, "Shop candles"));
  report.check("home class cta", hasText(home, "Book a class"));
  report.check("home nav", hasText(home, "Shop") && hasText(home, "Classes") && hasText(home, "Visit"));

  await page.getByRole("link", { name: "Shop", exact: true }).first().click();
  await page.waitForURL(/\/shop/, { timeout: 20000 });
  const shop = await page.locator("body").innerText();
  report.check("shop heading", hasText(shop, "Small-batch candles"));
  report.check("shop count", /\d+\s+candles/i.test(shop));
  report.check("shop product", hasText(shop, "Atlantic Beach"));

  await page.goto(`${base}/classes`, { waitUntil: "domcontentloaded" });
  const classes = await page.locator("body").innerText();
  report.check(
    "classes page",
    hasText(classes, "Candle-making classes") &&
      (hasText(classes, "Save your seat") || hasText(classes, "New dates are coming soon")),
  );

  await page.goto(`${base}/our-story`, { waitUntil: "domcontentloaded" });
  const story = await page.locator("body").innerText();
  report.check("story page", hasText(story, "kitchen spark") && hasText(story, "pig"));

  await page.goto(`${base}/contact`, { waitUntil: "domcontentloaded" });
  const contact = await page.locator("body").innerText();
  report.check("contact page", hasText(contact, "We saved you a spot") && hasText(contact, "Write us"));
  report.check("contact form", (await page.locator("form.contact-form").count()) > 0);

  const desktop = { width: 1280, height: 800 };
  const mobile = { width: 390, height: 844 };
  await page.setViewportSize(mobile);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  report.check("mobile menu", (await page.locator("details.mobile-menu").count()) > 0);
  await page.setViewportSize(desktop);

  return report.result({ surface: "storefront-browser", base });
}
