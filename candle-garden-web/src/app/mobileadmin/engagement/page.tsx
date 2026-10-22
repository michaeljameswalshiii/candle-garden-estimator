import { getAdminSession } from "@/lib/admin/auth";
import { mobileEventMetrics, recentTrackingActivity } from "@/lib/mobile-events";

const etFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
function formatEt(iso: string) { const t = Date.parse(iso); return Number.isNaN(t) ? iso || "—" : etFormat.format(new Date(t)); }

export const dynamic = "force-dynamic";

export default async function MobileEngagementPage() {
  // Layouts are not an auth boundary in the App Router: the page payload streams even when the layout shows the login form.
  if (!(await getAdminSession()).ok) return null;
  const [data, activity] = await Promise.all([mobileEventMetrics(), recentTrackingActivity(100)]);
  const rejectedCount = activity.filter((row) => row.status !== "accepted").length;
  const metrics = [
    ["App downloads", "—", "Connect App Store Connect for authoritative installs"],
    ["Active users", String(data.activeUsers7d), "Unique app devices in the last 7 days"],
    ["Screen views", String(data.screenViews), "Recorded by the Candle Garden app"],
    ["Successful test payments", String(data.payments), "Orders with status paid or paid_test"],
    ["Estimate-to-order conversion", `${data.estimateConversion}%`, "Payments divided by estimator visits"],
  ];
  return <><div className="mobileadmin-page-head"><p>Growth</p><h1>Engagement</h1><span>Live first-party app usage without a third-party analytics SDK.</span></div><section className="mobileadmin-measure-grid">{metrics.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
    <section id="tracking-activity" style={{ marginTop: 32 }}>
      <h2>Recent tracking activity</h2>
      <p><small>Latest {activity.length} requests to the app events endpoint (POST /events), newest first. {rejectedCount} rejected or failed. Times in ET.</small></p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>{["Time (ET)", "Status", "Event", "Device", "Reason / detail", "App version / agent"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>{h}</th>)}</tr></thead>
          <tbody>
            {activity.length === 0 ? <tr><td colSpan={6} style={{ padding: 8 }}>No tracking requests recorded yet.</td></tr> : activity.map((row) => (
              <tr key={row.id} style={{ background: row.status === "accepted" ? undefined : "#fff4f2" }}>
                <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatEt(row.createdAt)}</td>
                <td style={{ padding: "6px 8px", fontWeight: 600, color: row.status === "accepted" ? "#1b7f3b" : "#b42318" }}>{row.status}</td>
                <td style={{ padding: "6px 8px" }}>{row.name}{row.screen ? ` · ${row.screen}` : ""}</td>
                <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{row.deviceId}</td>
                <td style={{ padding: "6px 8px" }}>{row.reason || "—"}</td>
                <td style={{ padding: "6px 8px" }}><small>{[row.appVersion, row.userAgent].filter(Boolean).join(" · ") || "—"}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section></>;
}
