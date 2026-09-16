import { listMobileOrders } from "@/lib/mobileadmin/data";

export default async function MobileCustomersPage() {
  const orders = await listMobileOrders();
  const customers = new Map<string, { email: string; orders: number; spent: number; last: string }>();
  for (const order of orders) { const key = order.customer_email || order.customer_id || "Unknown"; const current = customers.get(key) || { email: key, orders: 0, spent: 0, last: "" }; current.orders += 1; current.spent += Number(order.total_amount || 0); if (String(order.created_at || "") > current.last) current.last = order.created_at || ""; customers.set(key, current); }
  return <><div className="mobileadmin-page-head"><p>Audience</p><h1>Customers</h1><span>A practical view of known customers based on app orders.</span></div><div className="mobileadmin-table-wrap"><table><thead><tr><th>Customer</th><th>Orders</th><th>Lifetime value</th><th>Last order</th></tr></thead><tbody>{[...customers.values()].map((customer) => <tr key={customer.email}><td><strong>{customer.email}</strong></td><td>{customer.orders}</td><td>${customer.spent.toFixed(2)}</td><td>{customer.last ? new Date(customer.last).toLocaleDateString() : "—"}</td></tr>)}</tbody></table>{customers.size === 0 ? <div className="mobileadmin-empty">Customer activity will appear after the first durable app order.</div> : null}</div></>;
}
