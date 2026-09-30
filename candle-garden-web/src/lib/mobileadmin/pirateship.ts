type ShipOrder = {
  id: string;
  customer_email?: string;
  items?: Array<{ type?: string; ounces?: number; quantity?: number; boxKey?: string }>;
  shipping?: Record<string, string>;
};

const BOXES: Record<string, [number, number, number]> = {
  ups_small: [10, 8, 6],
  ups_medium: [12, 10, 8],
  ups_large: [14, 12, 10],
};

const HEADERS = [
  "Order ID",
  "Name",
  "Address",
  "Address Line 2",
  "City",
  "State",
  "Zipcode",
  "Country",
  "Email",
  "Phone",
  "Weight Ounces",
  "Length",
  "Width",
  "Height",
  "Rubber Stamp",
] as const;

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function packageHints(order: ShipOrder) {
  const refill = (order.items || []).find((item) => Number(item.ounces) > 0) || (order.items || [])[0];
  const dims = BOXES[String(refill?.boxKey || "")] || BOXES.ups_medium;
  const ounces = Number(refill?.ounces || 0) * Math.max(1, Number(refill?.quantity || 1));
  return {
    ounces: Number.isFinite(ounces) && ounces > 0 ? String(Math.round(ounces * 10) / 10) : "",
    length: String(dims[0]),
    width: String(dims[1]),
    height: String(dims[2]),
  };
}

export function pirateshipRow(order: ShipOrder) {
  const shipping = order.shipping || {};
  const email = String(shipping.email || order.customer_email || "");
  const hints = packageHints(order);
  return {
    "Order ID": order.id,
    Name: String(shipping.name || "").trim() || "Guest",
    Address: String(shipping.address || "").trim(),
    "Address Line 2": String(shipping.address2 || "").trim(),
    City: String(shipping.city || "").trim(),
    State: String(shipping.state || "").trim().slice(0, 2).toUpperCase(),
    Zipcode: String(shipping.zip || "").replace(/\D/g, "").slice(0, 5),
    Country: String(shipping.country || "US"),
    Email: email.includes("@") ? email : "",
    Phone: String(shipping.phone || "").trim(),
    "Weight Ounces": hints.ounces,
    Length: hints.length,
    Width: hints.width,
    Height: hints.height,
    "Rubber Stamp": order.id.slice(0, 8),
  };
}

export function pirateshipReady(order: ShipOrder) {
  const row = pirateshipRow(order);
  return Boolean(row.Address && row.City && row.State && row.Zipcode.length === 5);
}

export function pirateshipCsv(orders: ShipOrder[]) {
  const rows = orders.filter(pirateshipReady).map(pirateshipRow);
  const lines = [
    HEADERS.join(","),
    ...rows.map((row) => HEADERS.map((header) => csvCell(row[header])).join(",")),
  ];
  return { csv: `${lines.join("\r\n")}\r\n`, count: rows.length, skipped: orders.length - rows.length };
}

export function trackingUrl(tracking: string) {
  const value = tracking.trim();
  if (/^1Z/i.test(value)) return `https://www.ups.com/track?tracknum=${encodeURIComponent(value)}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(value)}`;
}
