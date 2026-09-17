export type Party = { name?: string; address: string; city: string; state: string; zip: string; phone?: string; residential?: boolean };

export type UpsRate = { code: string; service: string; cents: number };

const ORIGIN: Party = {
  name: "The Candle Garden", address: "363 Atlantic Boulevard, Suite 8", city: "Atlantic Beach",
  state: "FL", zip: "32233", phone: "9043167608",
};

function credentials() {
  const clientId = process.env.UPS_CLIENT_ID?.trim();
  const clientSecret = process.env.UPS_CLIENT_SECRET?.trim();
  const accountNumber = process.env.UPS_ACCOUNT_NUMBER?.trim();
  if (!clientId || !clientSecret || !accountNumber) throw new Error("UPS is not configured");
  return { clientId, clientSecret, accountNumber };
}

function party(value: Party) {
  return {
    Name: value.name || "Recipient",
    Address: {
      AddressLine: [value.address], City: value.city, StateProvinceCode: value.state,
      PostalCode: value.zip.replace(/\D/g, "").slice(0, 5), CountryCode: "US",
      ...(value.residential ? { ResidentialAddressIndicator: "Y" } : {}),
    },
    ...(value.phone ? { Phone: { Number: value.phone.replace(/\D/g, "").slice(0, 15) } } : {}),
  };
}

async function token() {
  const { clientId, clientSecret, accountNumber } = credentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "x-merchant-id": accountNumber },
    body: "grant_type=client_credentials", cache: "no-store",
  });
  if (!response.ok) throw new Error("UPS authorization failed");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("UPS did not return an access token");
  return payload.access_token;
}

const SERVICE_NAMES: Record<string, string> = {
  "01": "UPS Next Day Air", "02": "UPS 2nd Day Air", "03": "UPS Ground", "12": "UPS 3 Day Select",
  "13": "UPS Next Day Air Saver", "14": "UPS Next Day Air Early", "59": "UPS 2nd Day Air A.M.", "93": "UPS Ground Saver",
};

/** Returns every domestic service UPS makes available to this shipper, sorted by price. */
export async function availableRates(from: Party, to: Party, weightLb: number, dimensions: [number, number, number]): Promise<UpsRate[]> {
  const { accountNumber } = credentials();
  const accessToken = await token();
  const [length, width, height] = dimensions;
  const body = { RateRequest: { Request: { TransactionReference: { CustomerContext: "candle-garden-refill" } }, Shipment: {
    Shipper: { ...party(from), ShipperNumber: accountNumber }, ShipFrom: party(from), ShipTo: party(to),
    PaymentDetails: { ShipmentCharge: [{ Type: "01", BillShipper: { AccountNumber: accountNumber } }] },
    NumOfPieces: "1", Package: [{ PackagingType: { Code: "02" }, Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(length), Width: String(width), Height: String(height) }, PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(Math.max(1, Math.ceil(weightLb))) } }],
    ShipmentRatingOptions: { NegotiatedRatesIndicator: "Y" },
  } } };
  const response = await fetch("https://onlinetools.ups.com/api/rating/v2409/Shop", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", transId: crypto.randomUUID(), transactionSrc: "candle-garden-app" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.response?.errors?.[0]?.message || "UPS could not return rates");
  const shipments = payload?.RateResponse?.RatedShipment;
  const rows = (Array.isArray(shipments) ? shipments : [shipments]).map((row: any) => {
    const charge = row?.NegotiatedRateCharges?.TotalCharge || row?.TotalCharges;
    const cents = Math.round(Number(charge?.MonetaryValue) * 100);
    const code = String(row?.Service?.Code || "");
    return { code, service: row?.Service?.Description || SERVICE_NAMES[code] || `UPS service ${code}`, cents };
  }).filter((row: UpsRate) => Number.isFinite(row.cents) && row.cents > 0);
  if (!rows.length) throw new Error("UPS returned no available shipping services");
  return rows.sort((a, b) => a.cents - b.cents);
}

export function candleGardenOrigin() { return { ...ORIGIN }; }

export async function createLabel(from: Party, to: Party, weightLb: number, dimensions: [number, number, number], serviceCode: string, description: string, returnLabel = false) {
  const { accountNumber } = credentials();
  const accessToken = await token();
  const [length, width, height] = dimensions;
  const shipment: any = {
    Description: description.slice(0, 50), Shipper: { ...party(from), ShipperNumber: accountNumber }, ShipFrom: party(from), ShipTo: party(to),
    PaymentInformation: { ShipmentCharge: { Type: "01", BillShipper: { AccountNumber: accountNumber } } },
    Service: { Code: serviceCode }, Package: { Description: description.slice(0, 35), Packaging: { Code: "02" }, Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(length), Width: String(width), Height: String(height) }, PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(Math.max(1, Math.ceil(weightLb))) } },
  };
  if (returnLabel) shipment.ReturnService = { Code: "9" };
  const response = await fetch("https://onlinetools.ups.com/api/shipments/v2409/ship", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", transId: crypto.randomUUID(), transactionSrc: "candle-garden-admin" }, body: JSON.stringify({ ShipmentRequest: { Request: { RequestOption: "nonvalidate" }, Shipment: shipment, LabelSpecification: { LabelImageFormat: { Code: "GIF" }, LabelStockSize: { Height: "6", Width: "4" } } } }), cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(payload?.response?.errors?.[0]?.message || "UPS could not create the label");
  const results = payload?.ShipmentResponse?.ShipmentResults;
  const packageResult = Array.isArray(results?.PackageResults) ? results.PackageResults[0] : results?.PackageResults;
  return { trackingNumber: packageResult?.TrackingNumber || results?.ShipmentIdentificationNumber, imageBase64: packageResult?.ShippingLabel?.GraphicImage, format: "gif" };
}
