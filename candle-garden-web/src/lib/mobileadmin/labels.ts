type GuestOrder = {
  id?: string;
  customer_id?: string;
  customer_email?: string;
  total_amount?: number;
  created_at?: string;
  shipping?: Record<string, string>;
};

function shortDate(value?: string) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function customerLabel(order: GuestOrder) {
  const email = String(order.customer_email || "").trim();
  if (email.includes("@")) return email;

  const shipping = order.shipping || {};
  const place = [shipping.city, shipping.state].filter(Boolean).join(", ");
  const when = shortDate(order.created_at);
  const total = Number(order.total_amount);
  const money = Number.isFinite(total) && total > 0 ? `$${total.toFixed(2)}` : "";
  const bits = [place, when, money].filter(Boolean);
  if (bits.length) return `guest (${bits.join(" · ")})`;
  return `guest (${String(order.id || "order").slice(0, 8)})`;
}

export function customerGroupKey(order: GuestOrder) {
  const email = String(order.customer_email || "").trim();
  if (email.includes("@")) return email.toLowerCase();
  return `order:${order.id}`;
}
