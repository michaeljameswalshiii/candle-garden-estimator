import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }));
const table = process.env.CANDLE_EVENTS_TABLE || "candle-garden-events";

export async function recordMobileEvent(event: Record<string, unknown>) {
  await client.send(new PutCommand({ TableName: table, Item: event }));
}

export async function mobileEventMetrics() {
  const response = await client.send(new ScanCommand({ TableName: table, Limit: 10000 }));
  const rows = response.Items || [];
  const now = Date.now();
  const sevenDays = rows.filter((row) => Date.parse(String(row.created_at || "")) >= now - 7 * 86400000);
  const devices = new Set(sevenDays.map((row) => row.device_id).filter(Boolean));
  const views = rows.filter((row) => row.name === "screen_view");
  const payments = rows.filter((row) => row.name === "payment_success");
  const estimates = rows.filter((row) => row.name === "screen_view" && row.screen === "Estimator");
  return { activeUsers7d: devices.size, screenViews: views.length, payments: payments.length, estimateConversion: estimates.length ? Math.round(payments.length / estimates.length * 100) : 0 };
}
