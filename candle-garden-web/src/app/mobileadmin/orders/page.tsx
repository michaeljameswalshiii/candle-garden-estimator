import { OrderExplorer } from "@/components/mobileadmin/OrderExplorer";
import { listMobileOrders } from "@/lib/mobileadmin/data";

export default async function MobileOrdersPage() {
  const orders = await listMobileOrders();
  return <><div className="mobileadmin-page-head"><p>Commerce</p><h1>Orders</h1><span>Find current and past mobile orders without digging through customer accounts.</span></div><OrderExplorer orders={orders} /></>;
}
