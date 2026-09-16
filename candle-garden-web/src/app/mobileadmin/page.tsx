import Link from "next/link";
import { listMobileOrders, mobileSnapshot } from "@/lib/mobileadmin/data";

export default async function MobileAdminHome() {
  const orders = await listMobileOrders();
  const metrics = mobileSnapshot(orders);
  return <>
    <div className="mobileadmin-heading"><div><p>Mobile business</p><h1>Good morning. Here’s what is happening in the app.</h1></div><Link href="/mobileadmin/orders">View all orders</Link></div>
    <section className="mobileadmin-stats"><article><span>Orders · 30 days</span><strong>{metrics.last30}</strong><small>{metrics.orders} all time</small></article><article><span>Open orders</span><strong>{metrics.open}</strong><small>May need attention</small></article><article><span>App customers</span><strong>{metrics.customers}</strong><small>Known ordering accounts</small></article><article><span>Order value</span><strong>${metrics.revenue.toFixed(2)}</strong><small>Recorded all time</small></article></section>
    <section className="mobileadmin-dashboard-grid"><article><p>Owner focus</p><h2>{metrics.open ? `${metrics.open} open order${metrics.open === 1 ? "" : "s"}` : "Orders are caught up"}</h2><span>Search orders by customer, item, order number, or status.</span><Link href="/mobileadmin/orders">Open order desk →</Link></article><article><p>Growth tracking</p><h2>Connect app analytics</h2><span>Downloads, screen views, retention, and conversion need an app analytics connection before they can be reported accurately.</span><Link href="/mobileadmin/operations">Review tracking setup →</Link></article></section>
  </>;
}
