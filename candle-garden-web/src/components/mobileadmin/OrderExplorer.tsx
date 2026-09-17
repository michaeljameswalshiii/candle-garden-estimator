"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MobileOrder } from "@/lib/mobileadmin/data";

function orderChannel(order: MobileOrder) {
  if (String(order.customer_id || "").startsWith("guest:")) return "Guest checkout";
  if (order.payment_provider === "stripe") return "Signed-in Stripe";
  return order.source === "mobile" ? "Signed-in app" : order.source || "Mobile app";
}

const ORDER_STATUSES = [
  ["payment_pending", "Payment pending"],
  ["paid", "Paid"],
  ["ready_for_fulfillment", "Ready for fulfillment"],
  ["processing", "Processing"],
  ["shipped", "Shipped"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["partially_refunded", "Partially refunded"],
  ["refunded", "Refunded"],
] as const;

function customerDetails(order: MobileOrder) {
  const shipping = order.shipping || {};
  const location = [shipping.address, shipping.city, shipping.state, shipping.zip].filter(Boolean).join(", ");
  return { name: shipping.name, phone: shipping.phone, location };
}

export function OrderExplorer({ orders }: { orders: MobileOrder[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const statuses = [...new Set(orders.map((order) => order.status || "unknown"))];
  const channels = [...new Set(orders.map(orderChannel))];
  const filtered = useMemo(() => orders.filter((order) => {
    const details = customerDetails(order);
    const haystack = [order.id, order.customer_email, order.customer_id, order.status, details.name, details.phone, details.location, ...(order.tracking_numbers || []), ...(order.items || []).map((item) => item.name)].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || (order.status || "unknown") === status) && (channel === "all" || orderChannel(order) === channel);
  }), [orders, query, status, channel]);

  async function update(order: MobileOrder, action: "price" | "refund" | "labels", statusValue?: string) {
    let body: Record<string, unknown> = {};
    if (statusValue) {
      body = { status: statusValue };
    } else if (action === "price") {
      const value = window.prompt("Corrected order total", Number(order.total_amount || 0).toFixed(2));
      if (value == null) return;
      body = { total_amount: value };
    } else if (action === "refund") {
      if (!window.confirm("Issue a Stripe refund for this order? This action cannot be undone.")) return;
      const value = window.prompt("Refund amount. Leave blank for the full order total.", "");
      if (value == null) return;
      body = { action: "refund", amount: value };
    } else {
      if (!window.confirm("Purchase the lowest-cost available UPS label(s) for this paid refill order?")) return;
      body = { action: "create_labels" };
    }
    setBusy(order.id);
    try {
      const response = await fetch(`/api/mobileadmin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update order");
      if (Array.isArray(data.labels)) {
        data.labels.forEach((label: { imageBase64?: string; format?: string; key?: string }, index: number) => {
          if (!label.imageBase64) return;
          const link = document.createElement("a");
          link.href = `data:image/${label.format || "gif"};base64,${label.imageBase64}`;
          link.download = `${order.id.slice(0, 8)}-${label.key || index + 1}.gif`;
          link.click();
        });
      }
      window.alert(data.message || "Order updated");
      router.refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not update order"); }
    finally { setBusy(null); }
  }

  return <>
    <div className="mobileadmin-filters">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, email, or product…" />
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">All order channels</option>{channels.map((value) => <option key={value}>{value}</option>)}</select>
      <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
    </div>
    <div className="mobileadmin-order-list">{filtered.length ? filtered.map((order) => { const details = customerDetails(order); return <article key={order.id}>
      <div><small>{order.created_at ? new Date(order.created_at).toLocaleString() : "Date unavailable"}</small><strong>{details.name || order.customer_email || "App customer"}</strong>{details.name && order.customer_email ? <span>{order.customer_email}</span> : null}{details.phone ? <a href={`tel:${details.phone}`}>{details.phone}</a> : null}{details.location ? <span>{details.location}</span> : null}<span>#{order.id.slice(0, 8)} · {(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)} items</span><b className="mobileadmin-channel">{orderChannel(order)}</b></div>
      <div className="mobileadmin-order-items">{(order.items || []).slice(0, 3).map((item, index) => <span key={`${item.name}-${index}`}>{item.quantity || 1}× {item.name || "Item"}{item.size ? ` · ${item.size}` : ""}</span>)}</div>
      <div className="mobileadmin-order-total"><label><span>Status</span><select aria-label={`Status for order ${order.id}`} value={order.status || "payment_pending"} disabled={busy === order.id} onChange={(event) => void update(order, "price", event.target.value)}>{order.status && !ORDER_STATUSES.some(([value]) => value === order.status) ? <option value={order.status}>{order.status.replaceAll("_", " ")}</option> : null}{ORDER_STATUSES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><strong>${Number(order.total_amount || 0).toFixed(2)}</strong>{order.tracking_numbers?.map((tracking) => <a key={tracking} href={`https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`} target="_blank" rel="noreferrer">Track {tracking}</a>)}<div className="mobileadmin-order-actions"><button disabled={busy === order.id} onClick={() => void update(order, "price")}>Adjust total</button><button disabled={busy === order.id || !String(order.status || "").startsWith("paid") || order.label_status === "created" || !(order.items || []).some((item) => item.type === "refill")} onClick={() => void update(order, "labels")}>{order.label_status === "created" ? "Labels created" : "Create UPS labels"}</button><button className="is-danger" disabled={busy === order.id || !order.payment_intent_id} title={!order.payment_intent_id ? "No Stripe payment reference on this order" : "Issue refund"} onClick={() => void update(order, "refund")}>Refund</button></div></div>
    </article> }) : <div className="mobileadmin-empty">No orders match this search.</div>}</div>
  </>;
}
