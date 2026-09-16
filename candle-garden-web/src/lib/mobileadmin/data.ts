import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export type MobileOrder = {
  id: string;
  customer_id?: string;
  customer_email?: string;
  total_amount?: number;
  status?: string;
  source?: string;
  items?: Array<{ name?: string; size?: string; quantity?: number; price?: number }>;
  created_at?: string;
  updated_at?: string;
};

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } },
);

export async function listMobileOrders(): Promise<MobileOrder[]> {
  try {
    const response = await client.send(new ScanCommand({
      TableName: process.env.CANDLE_ORDERS_TABLE || "candle-garden-orders",
      Limit: 500,
    }));
    return ((response.Items || []) as MobileOrder[])
      .filter((order) => order.status !== "deleted")
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  } catch {
    return [];
  }
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
