import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export type MobileOrder = {
  id: string;
  customer_id?: string;
  customer_email?: string;
  total_amount?: number;
  status?: string;
  source?: string;
  payment_provider?: string;
  payment_intent_id?: string;
  refund_id?: string;
  refunded_amount?: number;
  items?: Array<{ type?: string; productId?: string; name?: string; size?: string; quantity?: number; price?: number; ounces?: number; boxKey?: string; shippingMethod?: string; vesselCount?: number }>;
  created_at?: string;
  updated_at?: string;
  shipping?: Record<string, string>;
  label_status?: string;
  tracking_numbers?: string[];
};

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const ordersTable = process.env.CANDLE_ORDERS_TABLE || "candle-garden-orders";

export async function listMobileOrders(): Promise<MobileOrder[]> {
  try {
    const response = await client.send(new ScanCommand({
      TableName: ordersTable,
      Limit: 500,
    }));
    return ((response.Items || []) as MobileOrder[])
      .filter((order) => order.status !== "deleted")
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  } catch {
    return [];
  }
}

export function orderChannel(order: MobileOrder) {
  if (String(order.customer_id || "").startsWith("guest:")) return "Guest checkout";
  if (order.payment_provider === "stripe") return "Signed-in Stripe";
  return order.source === "mobile" ? "Signed-in app" : order.source || "Mobile app";
}

export async function updateMobileOrder(id: string, patch: { status?: string; total_amount?: number; refund_id?: string; refunded_amount?: number; label_status?: string; tracking_numbers?: string[] }) {
  const names: Record<string, string> = { "#updated": "updated_at" };
  const values: Record<string, unknown> = { ":updated": new Date().toISOString() };
  const sets = ["#updated = :updated"];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }
  await client.send(new UpdateCommand({ TableName: ordersTable, Key: { id }, UpdateExpression: `SET ${sets.join(", ")}`, ExpressionAttributeNames: names, ExpressionAttributeValues: values }));
}

export async function getMobileOrder(id: string) {
  const response = await client.send(new GetCommand({ TableName: ordersTable, Key: { id } }));
  return response.Item as MobileOrder | undefined;
}

export async function putMobileOrder(order: MobileOrder) {
  await client.send(new PutCommand({ TableName: ordersTable, Item: order, ConditionExpression: "attribute_not_exists(id)" }));
}

export async function listCustomerOrders(customerId: string) {
  const response = await client.send(new ScanCommand({
    TableName: ordersTable,
    FilterExpression: "customer_id = :customer",
    ExpressionAttributeValues: { ":customer": customerId },
    Limit: 100,
  }));
  return ((response.Items || []) as MobileOrder[]).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export async function findOrderByPaymentIntent(paymentIntentId: string) {
  const response = await client.send(new ScanCommand({
    TableName: ordersTable,
    FilterExpression: "payment_intent_id = :intent",
    ExpressionAttributeValues: { ":intent": paymentIntentId },
    Limit: 1,
  }));
  return response.Items?.[0] as MobileOrder | undefined;
}

export function mobileSnapshot(orders: MobileOrder[]) {
  const now = Date.now();
  const last30 = orders.filter((order) => {
    const created = Date.parse(order.created_at || "");
    return Number.isFinite(created) && created >= now - 30 * 86400000;
  });
  const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const customers = new Set(
    orders.map((order) => order.customer_email || order.customer_id).filter(Boolean),
  );
  const open = orders.filter((order) => !["complete", "completed", "cancelled", "refunded"].includes(String(order.status || "").toLowerCase()));
  return { orders: orders.length, last30: last30.length, revenue, customers: customers.size, open: open.length };
}
