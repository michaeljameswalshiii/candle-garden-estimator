import { OrderExplorer } from "@/components/mobileadmin/OrderExplorer";
import { listMobileOrders } from "@/lib/mobileadmin/data";

export default async function MobileOrdersPage() {
  const orders = await listMobileOrders();
  return <><div className="mobileadmin-page-head"><p>Commerce</p><h1>Orders</h1><span>Find orders, send a Pirate Ship CSV for labels, then paste tracking back onto the order.</span></div><OrderExplorer orders={orders} /></>;
}
