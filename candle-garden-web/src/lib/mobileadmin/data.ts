import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { notifyOrderStatus } from "@/lib/mobile-push";

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
  gift_checkout?: boolean;
  gift_card_cents?: number;
  stripe_amount_cents?: number;
  gift_refund_review?: boolean;
  items?: Array<{ type?: string; shippingCents?: number; productId?: string; name?: string; size?: string; quantity?: number; price?: number; ounces?: number; boxKey?: string; shippingMethod?: string; vesselCount?: number; speed?: string; vesselScents?: import("../../../../packages/catalog/refillScents").VesselScent[] }>;
  created_at?: string;
  updated_at?: string;
  shipping?: Record<string, string>;
  fulfillment_method?: string;
  tax_amount?: number;
  subtotal_amount?: number;
  discount_amount?: number;
  promotion_code?: string;
  label_status?: string;
  tracking_numbers?: string[];
  squarespace_order_id?: string;
  squarespace_order_number?: string;
  squarespace_inventory_adjusted?: boolean;
  squarespace_booking_error?: string;
  shipping_labels?: Array<{ key?: string; title?: string; status?: string; trackingNumber?: string; trackingUrl?: string; labelUrl?: string; service?: string; format?: string; purchasedAt?: string; error?: string; recipient?: string; recipientAddress?: string }>;
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

const REFUND_LOCKED = new Set(["paid", "paid_test", "processing", "shipped", "completed", "ready_for_pickup", "ready_for_fulfillment", "refill_received", "refilling", "refill_returning"]);

export function claimAttribute(legKey: string) {
  const safe = String(legKey || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!safe) throw new Error("Unknown shipping leg");
  return `label_claim_${safe}`;
}

export async function claimShippingLeg(orderId: string, legKey: string): Promise<boolean> {
  const now = Date.now();
  try {
    await client.send(new UpdateCommand({
      TableName: ordersTable,
      Key: { id: orderId },
      UpdateExpression: "SET #claim = :until",
      ConditionExpression: "attribute_not_exists(#claim) OR #claim < :now",
      ExpressionAttributeNames: { "#claim": claimAttribute(legKey) },
      ExpressionAttributeValues: { ":until": now + 120000, ":now": now },
    }));
    return true;
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

export async function holdShippingLeg(orderId: string, legKey: string, durationMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  try {
    await client.send(new UpdateCommand({
      TableName: ordersTable,
      Key: { id: orderId },
      UpdateExpression: "SET #claim = :until",
      ConditionExpression: "attribute_exists(#claim) AND #claim >= :now",
      ExpressionAttributeNames: { "#claim": claimAttribute(legKey) },
      ExpressionAttributeValues: { ":until": now + durationMs, ":now": now },
    }));
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "ConditionalCheckFailedException") return;
    throw error;
  }
}

export async function releaseShippingLeg(orderId: string, legKey: string) {
  await client.send(new UpdateCommand({
    TableName: ordersTable,
    Key: { id: orderId },
    UpdateExpression: "REMOVE #claim",
    ExpressionAttributeNames: { "#claim": claimAttribute(legKey) },
  }));
}

export async function updateMobileOrder(id: string, patch: { status?: string; total_amount?: number; refund_id?: string; refunded_amount?: number; label_status?: string; tracking_numbers?: string[]; shipping_labels?: MobileOrder["shipping_labels"] }) {
  const prior = patch.status ? await getMobileOrder(id) : undefined;
  const names: Record<string, string> = { "#updated": "updated_at" };
  const values: Record<string, unknown> = { ":updated": new Date().toISOString() };
  const sets = ["#updated = :updated"];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }
  let condition: string | undefined;
  if (patch.status && REFUND_LOCKED.has(patch.status)) {
    names["#status"] = "status";
    values[":refunded"] = "refunded";
    values[":partial"] = "partially_refunded";
    condition = "attribute_not_exists(#status) OR (#status <> :refunded AND #status <> :partial)";
  }
  try {
    await client.send(new UpdateCommand({
      TableName: ordersTable,
      Key: { id },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(condition ? { ConditionExpression: condition } : {}),
    }));
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "ConditionalCheckFailedException") {
      throw new Error("Refunded orders stay refunded.");
    }
    throw error;
  }
  if(patch.status && prior?.customer_id && prior.status!==patch.status) {
    try { await notifyOrderStatus(prior.customer_id,id,patch.status); } catch { /* Delivery failures do not undo fulfillment updates. */ }
  }
}

export async function getMobileOrder(id: string) {
  const response = await client.send(new GetCommand({ TableName: ordersTable, Key: { id }, ConsistentRead: true }));
  return response.Item as MobileOrder | undefined;
}

export async function putMobileOrder(order: MobileOrder) {
  await client.send(new PutCommand({ TableName: ordersTable, Item: order, ConditionExpression: "attribute_not_exists(id)" }));
}

export async function listCustomerOrders(customerId: string) {
  let cursor:Record<string,any>|undefined;
  const items:MobileOrder[]=[];
  do {const response = await client.send(new ScanCommand({
    TableName: ordersTable,
    FilterExpression: "customer_id = :customer",
    ExpressionAttributeValues: { ":customer": customerId },
    Limit: 100,
    ExclusiveStartKey:cursor,
  }));
  items.push(...((response.Items||[]) as MobileOrder[]));cursor=response.LastEvaluatedKey;}while(cursor);
  return items.filter(item=>item.status!=="deleted").sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

export async function findOrderByPaymentIntent(paymentIntentId: string) {
  let cursor:Record<string,any>|undefined;
  do {const response = await client.send(new ScanCommand({
    TableName: ordersTable,
    FilterExpression: "payment_intent_id = :intent",
    ExpressionAttributeValues: { ":intent": paymentIntentId },
    ExclusiveStartKey:cursor,
  }));
  if(response.Items?.[0])return response.Items[0] as MobileOrder;
  cursor=response.LastEvaluatedKey;}while(cursor);
  return undefined;
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

// Financial reporting must read every page and surface failures, never show a false zero.
export async function listSalesOrders(): Promise<MobileOrder[]> {
  const orders: MobileOrder[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const response = await client.send(new ScanCommand({ TableName: ordersTable, ExclusiveStartKey: cursor }));
    orders.push(...((response.Items || []) as MobileOrder[]));
    cursor = response.LastEvaluatedKey;
  } while (cursor);
  return orders;
}
