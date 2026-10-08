import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }));
const table = "candle-garden-detect-rate-limits";

export const validPushToken = (token: string) =>
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);

function pushKey(customer: string, token: string) {
  return `push:${customer}:${token}`;
}

export async function savePush(
  customer: string,
  token: string,
  platform: string,
  preferences: Record<string, boolean>,
) {
  if (!validPushToken(token)) throw new Error("A valid Expo push token is required.");
  await db.send(new PutCommand({
    TableName: table,
    Item: {
      pk: pushKey(customer, token),
      customer_id: customer,
      token,
      enabled: true,
      platform,
      preferences,
      updated_at: new Date().toISOString(),
    },
  }));
}

export async function deletePush(customer: string, token: string) {
  if (!validPushToken(token)) throw new Error("A valid Expo push token is required.");
  await db.send(new DeleteCommand({ TableName: table, Key: { pk: pushKey(customer, token) } }));
}

async function loadPushRows(customer?: string) {
  const rows: any[] = [];
  let cursor: Record<string, any> | undefined;
  do {
    const response = await db.send(new ScanCommand({
      TableName: table,
      FilterExpression: customer ? "begins_with(pk, :prefix)" : "begins_with(pk, :all)",
      ExpressionAttributeValues: customer
        ? { ":prefix": `push:${customer}:` }
        : { ":all": "push:" },
      ExclusiveStartKey: cursor,
    }));
    rows.push(...(response.Items || []));
    cursor = response.LastEvaluatedKey;
  } while (cursor);
  return rows;
}

export async function sendMobilePush(
  topic: string,
  title: string,
  body: string,
  data: Record<string, string>,
  customer?: string,
) {
  const eligible = (await loadPushRows(customer)).filter(
    (row) => row.enabled === true && validPushToken(row.token || "") && row.preferences?.[topic] === true,
  );
  let accepted = 0;
  for (let i = 0; i < eligible.length; i += 100) {
    const batch = eligible.slice(i, i + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXPO_PUSH_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(batch.map((row) => ({
        to: row.token,
        title,
        body,
        data,
        sound: "default",
        channelId: "orders",
      }))),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Push delivery failed (${response.status}).`);
    const payload = await response.json();
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    for (let index = 0; index < tickets.length; index++) {
      if (tickets[index].status === "ok") accepted++;
      if (tickets[index].details?.error === "DeviceNotRegistered") {
        await deletePush(batch[index].customer_id, batch[index].token);
      }
    }
  }
  return accepted;
}

export async function notifyOrderStatus(customer: string, orderId: string, status: string) {
  const messages: Record<string, [string, string]> = {
    shipped: ["Your Candle Garden order shipped", "Track your package in Cart & orders."],
    refill_returning: ["Your refills are returning", "Your refilled vessels are on their way back to you."],
    ready_for_pickup: ["Ready for pickup", "Your candles are ready at the Atlantic Beach shop."],
    refill_received: ["Your vessels arrived", "We have received your vessels and will start your refill."],
  };
  if (!messages[status]) return;
  const [title, body] = messages[status];
  await sendMobilePush("orders", title, body, { type: "order_status", orderId, status }, customer);
}
