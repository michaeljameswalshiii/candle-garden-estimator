"use client";

import { useMemo, useState } from "react";
import type { MobileOrder } from "@/lib/mobileadmin/data";

export function OrderExplorer({ orders }: { orders: MobileOrder[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = [...new Set(orders.map((order) => order.status || "unknown"))];
  const filtered = useMemo(() => orders.filter((order) => {
    const haystack = [order.id, order.customer_email, order.customer_id, order.status, ...(order.items || []).map((item) => item.name)].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || (order.status || "unknown") === status);
  }), [orders, query, status]);

  return <>
    <div className="mobileadmin-filters">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, email, or product…" />
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
      <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
    </div>
    <div className="mobileadmin-order-list">{filtered.length ? filtered.map((order) => <article key={order.id}>
      <div><small>{order.created_at ? new Date(order.created_at).toLocaleString() : "Date unavailable"}</small><strong>{order.customer_email || "App customer"}</strong><span>#{order.id.slice(0, 8)} · {(order.items || []).reduce((sum, item) => sum + Number(item.quantity || 1), 0)} items</span></div>
      <div className="mobileadmin-order-items">{(order.items || []).slice(0, 3).map((item, index) => <span key={`${item.name}-${index}`}>{item.quantity || 1}× {item.name || "Item"}{item.size ? ` · ${item.size}` : ""}</span>)}</div>
      <div className="mobileadmin-order-total"><em className={`is-${String(order.status || "unknown").toLowerCase()}`}>{order.status || "unknown"}</em><strong>${Number(order.total_amount || 0).toFixed(2)}</strong></div>
    </article>) : <div className="mobileadmin-empty">No orders match this search.</div>}</div>
  </>;
}
