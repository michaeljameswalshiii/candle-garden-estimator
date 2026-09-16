"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MobileOrder } from "@/lib/mobileadmin/data";

function orderChannel(order: MobileOrder) {
  if (String(order.customer_id || "").startsWith("guest:")) return "Guest checkout";
  if (order.payment_provider === "stripe") return "Signed-in Stripe";
  return order.source === "mobile" ? "Signed-in app" : order.source || "Mobile app";
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
    const haystack = [order.id, order.customer_email, order.customer_id, order.status, ...(order.items || []).map((item) => item.name)].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || (order.status || "unknown") === status) && (channel === "all" || orderChannel(order) === channel);
  }), [orders, query, status, channel]);

  async function update(order: MobileOrder, action: "status" | "price" | "refund") {
    let body: Record<string, unknown> = {};
    if (action === "status") {
      const value = window.prompt("New order status", order.status || "pending");
      if (!value) return;
      body = { status: value };
    } else if (action === "price") {
      const value = window.prompt("Corrected order total", Number(order.total_amount || 0).toFixed(2));
      if (value == null) return;
      body = { total_amount: value };
    } else {
      if (!window.confirm("Issue a Stripe refund for this order? This action cannot be undone.")) return;
      const value = window.prompt("Refund amount. Leave blank for the full order total.", "");
      if (value == null) return;
      body = { action: "refund", amount: value };
    }
    setBusy(order.id);
    try {
      const response = await fetch(`/api/mobileadmin/orders/${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update order");
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
    <div className="mobileadmin-order-list">{filtered.length ? filtered.map((order) => <article key={order.id}>
      <div><small>{order.created_at ? new Date(order.created_at).toLocaleString() : "Date unavailable"}</small><strong>{order.customer_email || "App customer"}</strong><span>#{order.id.slice(0, 8)} · {(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)} items</span><b className="mobileadmin-channel">{orderChannel(order)}</b></div>
      <div className="mobileadmin-order-items">{(order.items || []).slice(0, 3).map((item, index) => <span key={`${item.name}-${index}`}>{item.quantity || 1}× {item.name || "Item"}{item.size ? ` · ${item.size}` : ""}</span>)}</div>
      <div className="mobileadmin-order-total"><em className={`is-${String(order.status || "unknown").toLowerCase()}`}>{order.status || "unknown"}</em><strong>${Number(order.total_amount || 0).toFixed(2)}</strong><div className="mobileadmin-order-actions"><button disabled={busy === order.id} onClick={() => void update(order, "status")}>Status</button><button disabled={busy === order.id} onClick={() => void update(order, "price")}>Price</button><button disabled={busy === order.id || !order.payment_intent_id} title={!order.payment_intent_id ? "No Stripe payment reference on this order" : "Issue refund"} onClick={() => void update(order, "refund")}>Refund</button></div></div>
    </article>) : <div className="mobileadmin-empty">No orders match this search.</div>}</div>
  </>;
}
