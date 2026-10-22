import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { listMobileOrders } from "@/lib/mobileadmin/data";

const PAID_STATUSES = new Set(["paid", "paid_test"]);

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }));
const table = process.env.CANDLE_EVENTS_TABLE || "candle-garden-events";

export async function recordMobileEvent(event: Record<string, unknown>) {
  await client.send(new PutCommand({ TableName: table, Item: event }));
}

export async function mobileEventMetrics() {
  const response = await client.send(new ScanCommand({ TableName: table, Limit: 10000 }));
  const rows = (response.Items || []).filter(isAcceptedEvent);
  const now = Date.now();
  const sevenDays = rows.filter((row) => Date.parse(String(row.created_at || "")) >= now - 7 * 86400000);
  const devices = new Set(sevenDays.map((row) => row.device_id).filter(Boolean));
  const views = rows.filter((row) => row.name === "screen_view");
  const paymentEvents = rows.filter((row) => row.name === "payment_success").length;
  // Server-verified: orders marked paid / paid_test by the payment_processor Lambda.
  const orders = await listMobileOrders();
  const paidOrders = orders.filter((order) => PAID_STATUSES.has(String(order.status || "").toLowerCase())).length;
  // Fall back to client payment_success events only if the orders table could not be read.
  const payments = orders.length ? paidOrders : paymentEvents;
  const estimates = rows.filter((row) => row.name === "screen_view" && row.screen === "Estimator");
  return { activeUsers7d: devices.size, screenViews: views.length, payments, estimateConversion: estimates.length ? Math.round(payments / estimates.length * 100) : 0 };
}

// Rows written by the events Lambda for rejected/failed attempts carry status "rejected"/"failed".
// Legacy rows (no status) are accepted events.
function isAcceptedEvent(row: Record<string, unknown>) {
  return !row.status || row.status === "accepted";
}

export type TrackingActivityRow = {
  id: string;
  createdAt: string;
  name: string;
  deviceId: string;
  status: "accepted" | "rejected" | "failed";
  reason: string;
  screen: string;
  appVersion: string;
  userAgent: string;
};

export async function recentTrackingActivity(limit = 100): Promise<TrackingActivityRow[]> {
  const rows: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const response = await client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: startKey }));
    rows.push(...(response.Items || []));
    startKey = response.LastEvaluatedKey;
  } while (startKey && rows.length < 20000);
  return rows
    .map((row) => ({
      id: String(row.id || ""),
      createdAt: String(row.created_at || ""),
      name: String(row.name || ""),
      deviceId: String(row.device_id || ""),
      status: (isAcceptedEvent(row) ? "accepted" : String(row.status)) as TrackingActivityRow["status"],
      reason: String(row.reason || ""),
      screen: String(row.screen || ""),
      appVersion: String(row.app_version || ""),
      userAgent: String(row.user_agent || ""),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
