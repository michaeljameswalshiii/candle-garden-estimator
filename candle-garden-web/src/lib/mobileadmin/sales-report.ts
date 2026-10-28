import type { MobileOrder } from "./data";

const PAID = new Set(["paid", "processing", "shipped", "completed", "ready_for_pickup", "ready_for_fulfillment", "refill_received", "refilling", "refill_returning", "partially_refunded", "refunded"]);
export const SALES_COLUMNS = ["Month", "Order count", "Gross", "Discounts", "Tax", "Shipping", "Refunds", "Net app sales", "Cumulative net", "Milestone fees triggered", "5% fee", "Total due", "Due date"];
export type SalesMonth = {
  month: string; orderCount: number; gross: number; discounts: number; tax: number;
  shipping: number; refunds: number; net: number; cumulativeNet: number;
  milestoneFees: number; percentageFee: number; totalDue: number; dueDate: string;
};
const cents = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.round(value! * 100)) : 0;

/**
 * Only explicit source=mobile is evidence of an app order; Stripe/guest labels alone
 * are not. Squarespace IDs can be app class bookings, so do not exclude those IDs.
 * Fulfillment and refund statuses imply prior payment; paid_test is excluded.
 * Amount fields are dollars; refill items.shippingCents is a whole-line amount
 * already included in subtotal_amount (not multiplied by quantity). No tax field
 * is currently written by checkout, so missing tax is zero. shipping is an address.
 * Legacy orders without subtotal use total + discount. Subtotal includes shipping;
 * gross is the pre-discount, tax-inclusive checkout amount. Net removes discounts,
 * tax, shipping and the stored dollar refund, capped at merchandise net. Full
 * refunds contribute zero. Refunds restate the original UTC order month because
 * no refund date/allocation is stored; milestone dates/fees recompute accordingly.
 * created_at is the sale date proxy because no paid_at timestamp is stored.
 */
export function calculateSalesReport(orders: readonly MobileOrder[], launchDate?: string) {
  const launch = launchDate?.trim();
  if (launch && (!/^\d{4}-\d{2}-\d{2}$/.test(launch) || !Number.isFinite(Date.parse(launch)) || new Date(launch).toISOString().slice(0, 10) !== launch)) {
    throw new Error("MOBILE_APP_LAUNCH_DATE must be a valid ISO date (YYYY-MM-DD)");
  }
  const milestones = [2000, 4000, 6000].map(amount => ({ amount, dateReached: null as string | null }));
  const months = new Map<string, SalesMonth>();
  let cumulative = 0;
  const eligible = orders.filter(order => order.source === "mobile" && PAID.has(order.status || "") && Number.isFinite(Date.parse(order.created_at || "")) && (!launch || Date.parse(order.created_at!) >= Date.parse(launch)))
    .slice().sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!) || a.id.localeCompare(b.id));
  for (const order of eligible) {
    const date = new Date(order.created_at!).toISOString();
    const month = date.slice(0, 7);
    let row = months.get(month);
    if (!row) {
      const due = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 8));
      row = { month, orderCount: 0, gross: 0, discounts: 0, tax: 0, shipping: 0, refunds: 0, net: 0, cumulativeNet: 0, milestoneFees: 0, percentageFee: 0, totalDue: 0, dueDate: due.toISOString().slice(0, 10) };
      months.set(month, row);
    }
    const discount = cents(order.discount_amount);
    const tax = cents(order.tax_amount);
    const shipping = (order.items || []).reduce((sum, item) => sum + cents((item.shippingCents || 0) / 100), 0);
    const gross = order.subtotal_amount == null ? cents(order.total_amount) + discount : cents(order.subtotal_amount);
    const merchandise = Math.max(0, gross - discount - tax - shipping);
    const refund = order.status === "refunded" ? merchandise : Math.min(merchandise, cents(order.refunded_amount));
    const net = merchandise - refund;
    row.orderCount++;
    row.gross += gross; row.discounts += discount; row.tax += tax;
    row.shipping += shipping; row.refunds += refund; row.net += net;
    cumulative += net;
    for (const milestone of milestones) {
      if (!milestone.dateReached && cumulative >= milestone.amount * 100) {
        milestone.dateReached = date.slice(0, 10);
        row.milestoneFees += 100000;
      }
    }
    row.cumulativeNet = cumulative;
  }
  let prior = 0;
  const monthly = [...months.values()].map(row => {
    // Round once per month, charging only that month's portion above $6,000.
    row.percentageFee = Math.round((Math.max(0, row.cumulativeNet - 600000) - Math.max(0, prior - 600000)) * 0.05);
    row.totalDue = row.milestoneFees + row.percentageFee;
    prior = row.cumulativeNet;
    for (const key of ["gross", "discounts", "tax", "shipping", "refunds", "net", "cumulativeNet", "milestoneFees", "percentageFee", "totalDue"] as const) row[key] /= 100;
    return row;
  });
  return { launchDate: launch || null, cumulativeNet: cumulative / 100, milestones, monthly };
}

export function salesMonthValues(row: SalesMonth) {
  return [row.month, row.orderCount, ...[row.gross, row.discounts, row.tax, row.shipping, row.refunds, row.net, row.cumulativeNet, row.milestoneFees, row.percentageFee, row.totalDue].map(value => value.toFixed(2)), row.dueDate];
}

export function salesReportCsv(rows: readonly SalesMonth[]) {
  return [SALES_COLUMNS, ...rows.map(salesMonthValues)].map(row => row.join(",")).join("\r\n") + "\r\n";
}
