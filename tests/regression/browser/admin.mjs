import { adminCredentials, collect, hasText, origin } from "../helpers.mjs";

const ADMIN_PAGES = [
  ["/admin", "Site health"],
  ["/admin/reports", "Reports"],
  ["/admin/visitors", "Visitors"],
  ["/admin/messages", "Messages"],
  ["/admin/shop", "Candle catalog"],
  ["/admin/classes", "Candle classes"],
  ["/admin/practice", "Business info"],
  ["/admin/photos", "Photos"],
  ["/admin/announcements", "Announcements"],
  ["/admin/ai", "Content AI"],
  ["/admin/social", "Social Media"],
  ["/admin/staff", "Staff logins"],
  ["/admin/settings", "Settings"],
];

const MOBILE_PAGES = [
  ["/mobileadmin", "Good morning"],
  ["/mobileadmin/orders", "Orders"],
  ["/mobileadmin/customers", "Customers"],
  ["/mobileadmin/engagement", "Engagement"],
  ["/mobileadmin/operations", "App health"],
];

export default async function run(page) {
  const base = origin();
  const creds = adminCredentials();
  const report = collect();

  await page.goto(`${base}/admin`, { waitUntil: "domcontentloaded", timeout: 45000 });
  report.check("login heading", hasText(await page.locator("h1").innerText(), "Admin suite"));
  report.check("login button", (await page.getByRole("button", { name: /enter the garden/i }).count()) > 0);

  if (!creds) {
    report.note("Authenticated admin walk skipped (credentials unset).");
    return report.result({ surface: "admin-browser", base, skippedAuth: true });
  }

  await page.locator("input").nth(0).fill(creds.id);
  await page.locator("input[type='password']").fill(creds.password);
  await page.getByRole("button", { name: /enter the garden/i }).click();
  await page.waitForSelector(`text=Signed in as ${creds.id}`, { timeout: 20000 });

  for (const [path, heading] of ADMIN_PAGES) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    const text = await page.locator("h1").first().innerText();
    report.check(path, hasText(text, heading), `h1 was "${text}"`);
  }

  for (const [path, heading] of MOBILE_PAGES) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    const text = await page.locator("h1").first().innerText();
    report.check(path, hasText(text, heading), `h1 was "${text}"`);
  }

  return report.result({ surface: "admin-browser", base, skippedAuth: false });
}
