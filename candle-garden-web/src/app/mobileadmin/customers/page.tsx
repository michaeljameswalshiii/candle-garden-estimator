import { getAdminSession } from "@/lib/admin/auth";
import { listMobileOrders } from "@/lib/mobileadmin/data";
import { customerGroupKey, customerLabel } from "@/lib/mobileadmin/labels";

function mailingAddress(shipping?: Record<string, string>) {
  if (!shipping) return "";
  const cityLine = [shipping.city, shipping.state, shipping.zip].filter(Boolean).join(" ");
  return [shipping.address, shipping.address2, cityLine].filter(Boolean).join(", ");
}

export default async function MobileCustomersPage() {
  // Layouts are not an auth boundary: check the session here so data never streams to signed-out visitors.
  if (!(await getAdminSession()).ok) return null;
 
  const orders = await listMobileOrders();
  const customers = new Map<string, { key: string; label: string; phone: string; address: string; orders: number; spent: number; last: string }>();
  for (const order of orders) {
    const key = customerGroupKey(order);
    const current = customers.get(key) || { key, label: customerLabel(order), phone: "", address: "", orders: 0, spent: 0, last: "" };
    current.orders += 1;
    current.spent += Number(order.total_amount || 0);
    const stamp = String(order.created_at || "");
    const newer = stamp >= current.last;
    if (newer) current.last = stamp;
    const phone = String(order.shipping?.phone || "").trim();
    const address = mailingAddress(order.shipping);
    if (phone && (newer || !current.phone)) current.phone = phone;
    if (address && (newer || !current.address)) current.address = address;
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
              <th>Phone</th>
              <th>Address</th>
              <th>Orders</th>
              <th>Lifetime value</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {[...customers.values()].map((customer) => (
              <tr key={customer.key}>
                <td><strong>{customer.label}</strong></td>
                <td>{customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : "—"}</td>
                <td>{customer.address || "—"}</td>
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
