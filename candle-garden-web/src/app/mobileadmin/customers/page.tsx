import { listMobileOrders } from "@/lib/mobileadmin/data";
import { customerGroupKey, customerLabel } from "@/lib/mobileadmin/labels";

export default async function MobileCustomersPage() {
  const orders = await listMobileOrders();
  const customers = new Map<string, { key: string; label: string; orders: number; spent: number; last: string }>();
  for (const order of orders) {
    const key = customerGroupKey(order);
    const current = customers.get(key) || { key, label: customerLabel(order), orders: 0, spent: 0, last: "" };
    current.orders += 1;
    current.spent += Number(order.total_amount || 0);
    if (String(order.created_at || "") > current.last) current.last = order.created_at || "";
    customers.set(key, current);
  }
  return (
    <>
      <div className="mobileadmin-page-head">
        <p>Audience</p>
        <h1>Customers</h1>
        <span>Signed-in emails stay grouped. Guest checkouts stay as separate orders with the shipping details we have.</span>
      </div>
      <div className="mobileadmin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Orders</th>
              <th>Lifetime value</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {[...customers.values()].map((customer) => (
              <tr key={customer.key}>
                <td><strong>{customer.label}</strong></td>
                <td>{customer.orders}</td>
                <td>${customer.spent.toFixed(2)}</td>
                <td>{customer.last ? new Date(customer.last).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.size === 0 ? <div className="mobileadmin-empty">Customer activity will appear after the first durable app order.</div> : null}
      </div>
    </>
  );
}
