import { getAdminSession } from "@/lib/admin/auth";
import { OrderExplorer } from "@/components/mobileadmin/OrderExplorer";
import { listMobileOrders } from "@/lib/mobileadmin/data";

export default async function MobileOrdersPage() {
  // Layouts are not an auth boundary: check the session here so data never streams to signed-out visitors.
  if (!(await getAdminSession()).ok) return null;
 
  const orders = await listMobileOrders();
  return <><div className="mobileadmin-page-head"><p>Commerce</p><h1>Orders</h1><span>Find an order, open it for the full details, and print the Shippo label saved on it.</span></div><OrderExplorer orders={orders} /></>;
}
