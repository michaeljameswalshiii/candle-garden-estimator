import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }));
const table = process.env.CANDLE_GIFT_CARDS_TABLE || "candle-garden-gift-cards";

async function delivery(orderId: string) {
  const result = await client.send(new GetCommand({ TableName: table, Key: { id: `delivery:${orderId}` }, ConsistentRead: true }));
  if (!result.Item) throw new Error("Gift card issuance is still pending. Try again after payment is verified.");
  return result.Item;
}

function cardId(code: string) {
  return "card:" + createHash("sha256").update(code.replace(/[- ]/g, "").toUpperCase()).digest("hex");
}

export async function resendGiftCard(orderId: string) {
  const row = await delivery(orderId);
  const card = await client.send(new GetCommand({ TableName: table, Key: { id: cardId(row.code) }, ConsistentRead: true }));
  if (!card.Item || card.Item.disabled) throw new Error("This gift card is disabled and cannot be resent.");
  await client.send(new UpdateCommand({ TableName: table, Key: { id: row.id },
    UpdateExpression: "SET #s = :pending REMOVE leaseUntil ADD resendCount :one", ConditionExpression: "#s <> :cancelled AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)",
    ExpressionAttributeNames: { "#s": "state" }, ExpressionAttributeValues: { ":pending": "pending", ":cancelled": "cancelled", ":now": Math.floor(Date.now() / 1000), ":one": 1 } }));
}

export async function disableGiftCard(orderId: string, refundUnusedOnly = false) {
  const row = await delivery(orderId);
  await client.send(new TransactWriteCommand({ TransactItems: [
    { Update: { TableName: table, Key: { id: cardId(row.code) }, UpdateExpression: "SET disabled = :yes",
      ...(refundUnusedOnly ? { ConditionExpression: "balanceCents = originalCents" } : {}), ExpressionAttributeValues: { ":yes": true } } },
    { Update: { TableName: table, Key: { id: row.id }, UpdateExpression: "SET #s = :cancelled",
      ExpressionAttributeNames: { "#s": "state" }, ExpressionAttributeValues: { ":cancelled": "cancelled" } } },
  ] }));
}

export async function restoreGiftPayment(orderId: string) {
  const result = await client.send(new GetCommand({ TableName: table, Key: { id: `reservation:${orderId}` }, ConsistentRead: true }));
  const row = result.Item;
  if (!row || row.state !== "redeemed") return;
  const credited = Number(row.refundedCents || 0);
  const remaining = Number(row.amountCents) - credited;
  if (remaining <= 0) return;
  try {
    await client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: table, Key: { id: row.id }, UpdateExpression: "SET refundedCents = :total",
        ConditionExpression: credited ? "refundedCents = :prior" : "attribute_not_exists(refundedCents)",
        ExpressionAttributeValues: { ":total": Number(row.amountCents), ...(credited ? { ":prior": credited } : {}) } } },
      { Update: { TableName: table, Key: { id: row.cardId }, UpdateExpression: "SET balanceCents = balanceCents + :amount",
        ExpressionAttributeValues: { ":amount": remaining } } },
    ] }));
  } catch (error) {
    const current = await client.send(new GetCommand({ TableName: table, Key: { id: row.id }, ConsistentRead: true }));
    if (Number(current.Item?.refundedCents || 0) !== Number(row.amountCents)) throw error;
  }
}
