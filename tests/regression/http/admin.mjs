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

async function read(url, headers) {
  const response = await fetch(url, { headers, redirect: "follow" });
  const text = await response.text();
  return { response, text };
}

export async function runAdminHttp(base = origin()) {
  const report = collect();
  const login = await read(`${base}/admin`);
  report.check("/admin login", login.response.ok, `HTTP ${login.response.status}`);
  report.check("/admin login copy", login.text.includes("Admin suite") && login.text.includes("Enter the garden"));

  const mobileLogin = await read(`${base}/mobileadmin`);
  report.check("/mobileadmin login", mobileLogin.response.ok, `HTTP ${mobileLogin.response.status}`);
  report.check("/mobileadmin login copy", mobileLogin.text.includes("Admin suite"));

  const rejected = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "not-a-user", password: "wrong" }),
  });
  report.check("invalid login", rejected.status === 401, `expected 401, got ${rejected.status}`);

  const creds = adminCredentials();
  if (!creds) {
    report.note("Admin authenticated pages skipped (CANDLE_GARDEN_ADMIN_ID / CANDLE_GARDEN_ADMIN_PASSWORD unset).");
    return report.result({ surface: "admin-http", base, skippedAuth: true });
  }

  const session = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: creds.id, password: creds.password }),
  });
  report.check("admin login", session.ok, `HTTP ${session.status}`);
  const cookies = typeof session.headers.getSetCookie === "function" ? session.headers.getSetCookie() : [];
  const cookieHeader = cookies.map((item) => item.split(";")[0]).join("; ");
  report.check("admin cookie", /cg_admin_session=/i.test(cookieHeader), "missing session cookie");

  for (const [path, heading] of [...ADMIN_PAGES, ...MOBILE_PAGES]) {
    const page = await read(`${base}${path}`, { cookie: cookieHeader });
    report.check(path, page.response.ok, `HTTP ${page.response.status}`);
    const html = page.text.replace(/<!--.*?-->/gs, " ").replace(/&nbsp;/g, " ");
    report.check(`${path} heading`, hasText(html, heading), `missing "${heading}"`);
  }

  return report.result({ surface: "admin-http", base, skippedAuth: false });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("admin.mjs")) {
  const result = await runAdminHttp();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
