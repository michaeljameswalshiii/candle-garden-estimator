import { OrderExplorer } from "@/components/mobileadmin/OrderExplorer";
import { listMobileOrders } from "@/lib/mobileadmin/data";

export default async function MobileOrdersPage() {
  const orders = await listMobileOrders();
  return <><div className="mobileadmin-page-head"><p>Commerce</p><h1>Orders</h1><span>Find an order, reprint the shipping labels saved on it, or send a Pirate Ship CSV and paste tracking back.</span></div><OrderExplorer orders={orders} /></>;
}
