import { mobileEventMetrics } from "@/lib/mobile-events";

export const dynamic = "force-dynamic";

export default async function MobileEngagementPage() {
  const data = await mobileEventMetrics();
  const metrics = [
    ["App downloads", "—", "Connect App Store Connect for authoritative installs"],
    ["Active users", String(data.activeUsers7d), "Unique app devices in the last 7 days"],
    ["Screen views", String(data.screenViews), "Recorded by the Candle Garden app"],
    ["Successful test payments", String(data.payments), "Server-verified mobile payments"],
    ["Estimate-to-order conversion", `${data.estimateConversion}%`, "Payments divided by estimator visits"],
  ];
  return <><div className="mobileadmin-page-head"><p>Growth</p><h1>Engagement</h1><span>Live first-party app usage without a third-party analytics SDK.</span></div><section className="mobileadmin-measure-grid">{metrics.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section></>;
}
