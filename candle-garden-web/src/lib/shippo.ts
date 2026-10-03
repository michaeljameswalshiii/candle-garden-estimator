export type Party = {
  name?: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  email?: string;
  residential?: boolean;
};

export type ShippoRate = {
  objectId: string;
  cents: number;
  provider: string;
  service: string;
  token: string;
};

const ORIGIN: Party = {
  name: "The Candle Garden",
  address: "363 Atlantic Boulevard, Suite 8",
  address2: "",
  city: "Atlantic Beach",
  state: "FL",
  zip: "32233",
  phone: "9043167608",
  email: "jordan@thecandlegarden.co",
};

function token() {
  const value = process.env.SHIPPO_API_TOKEN?.trim();
  if (!value) throw new Error("Shippo is not configured");
  return value;
}

export function shippoConfigured() {
  return Boolean(process.env.SHIPPO_API_TOKEN?.trim());
}

function allowUps() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SHIPPO_ALLOW_UPS || "").toLowerCase());
}

function addr(party: Party) {
  return {
    name: party.name || "Recipient",
    street1: party.address || "1 Main St",
    street2: party.address2 || "",
    city: party.city || "",
    state: String(party.state || "").slice(0, 2).toUpperCase(),
    zip: party.zip.replace(/\D/g, "").slice(0, 5),
    country: "US",
    phone: (party.phone || "").replace(/\D/g, "").slice(0, 15),
    email: party.email || "jordan@thecandlegarden.co",
    is_residential: Boolean(party.residential),
  };
}

async function shippo<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.goshippo.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `ShippoToken ${token()}`,
      "Content-Type": "application/json",
      "SHIPPO-API-VERSION": "2018-02-08",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.message || "Shippo request failed");
  }
  return payload as T;
}

const SKIP = new Set(["canada post", "dhl express", "dhl ecommerce"]);

export function pickRate(rates: any[]): ShippoRate {
  const usable = (rates || []).flatMap((row) => {
    const cents = Math.round(Number(row?.amount) * 100);
    const provider = String(row?.provider || "");
    const key = provider.toLowerCase();
    if (!Number.isFinite(cents) || cents <= 0 || !row?.object_id) return [];
    if (SKIP.has(key)) return [];
    if (key.startsWith("ups") && !allowUps()) return [];
    return [{
      objectId: String(row.object_id),
      cents,
      provider,
      service: String(row?.servicelevel?.name || provider),
      token: String(row?.servicelevel?.token || ""),
    }];
  });
  if (!usable.length) throw new Error("Shippo returned no usable rates");
  const preferred = usable.filter((row) => row.provider.toLowerCase() === "usps");
  const pool = preferred.length ? preferred : usable;
  return pool.sort((a, b) => a.cents - b.cents)[0];
}

export async function lowestRate(
  from: Party,
  to: Party,
  weightLb: number,
  dimensions: [number, number, number],
  isReturn = false,
): Promise<ShippoRate> {
  const [length, width, height] = dimensions;
  const shipment = await shippo<{ rates?: any[] }>("/shipments/", {
    address_from: addr(from),
    address_to: addr(to),
    parcels: [{
      length: String(Math.max(1, Math.round(length))),
      width: String(Math.max(1, Math.round(width))),
      height: String(Math.max(1, Math.round(height))),
      distance_unit: "in",
      weight: String(Math.max(1, Math.ceil(weightLb))),
      mass_unit: "lb",
    }],
    async: false,
    extra: {
      ...(isReturn ? { is_return: true } : {}),
      ...(token().startsWith("shippo_test_") ? { bypass_address_validation: true } : {}),
    },
  });
  return pickRate(shipment.rates || []);
}

export function candleGardenOrigin() {
  return { ...ORIGIN };
}

export async function createLabel(
  from: Party,
  to: Party,
  weightLb: number,
  dimensions: [number, number, number],
  description: string,
  returnLabel = false,
) {
  const rate = await lowestRate(from, to, weightLb, dimensions, returnLabel);
  const transaction = await shippo<{
    status?: string;
    tracking_number?: string;
    tracking_url_provider?: string;
    label_url?: string;
    messages?: Array<{ text?: string }>;
    test?: boolean;
  }>("/transactions/", {
    rate: rate.objectId,
    async: false,
    label_file_type: "PNG",
    metadata: description.slice(0, 100),
  });
  if (transaction.status && transaction.status !== "SUCCESS" && transaction.status !== "QUEUED") {
    throw new Error(transaction.messages?.[0]?.text || "Shippo could not purchase a label");
  }
  if (!transaction.tracking_number) throw new Error("Shippo did not return a tracking number");
  let imageBase64 = "";
  let format = "png";
  if (transaction.label_url) {
    try {
      const file = await fetch(transaction.label_url, { cache: "no-store" });
      const buffer = Buffer.from(await file.arrayBuffer());
      imageBase64 = buffer.toString("base64");
      const type = file.headers.get("content-type") || "";
      if (type.includes("pdf") || transaction.label_url.toLowerCase().endsWith(".pdf")) format = "pdf";
    } catch {
      imageBase64 = "";
    }
  }
  return {
    trackingNumber: transaction.tracking_number,
    trackingUrl: transaction.tracking_url_provider || "",
    labelUrl: transaction.label_url || "",
    imageBase64,
    format,
    service: `${rate.provider} ${rate.service}`.trim(),
    test: Boolean(transaction.test),
  };
}
