import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.DYNAMODB_BEDROCK_USAGE_TABLE || "turnkey-bedrock-usage";
const TENANT = process.env.AI_USAGE_TENANT_ID || "site-candle-garden";
const INPUT_USD_PER_MILLION = 1.25;
const OUTPUT_USD_PER_MILLION = 2.5;
const MAX_OUTPUT_TOKENS = 2048;

export type AiUsage = {
  monthKey: string;
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  percentUsed: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export class AiBudgetExceededError extends Error {
  constructor(public usage: AiUsage) {
    super(`This site's $${usage.limitUsd.toFixed(2)} monthly AI budget has been reached.`);
  }
}

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } },
);

function monthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function limitMicrousd() {
  const configured = Number(process.env.AI_MONTHLY_BUDGET_USD || "5");
  const dollars = Number.isFinite(configured) && configured > 0 ? configured : 5;
  return Math.round(dollars * 1_000_000);
}

function key() {
  return { PK: `TENANT#${TENANT}`, SK: `BUDGET#MONTH#${monthKey()}` };
}

function usageFrom(item?: Record<string, unknown>): AiUsage {
  const limit = limitMicrousd();
  const spent = Number(item?.spentMicrousd || 0);
  return {
    monthKey: monthKey(),
    limitUsd: limit / 1_000_000,
    spentUsd: spent / 1_000_000,
    remainingUsd: Math.max(0, limit - spent) / 1_000_000,
    percentUsed: Math.min(100, Math.round((spent / limit) * 10_000) / 100),
    requests: Number(item?.requests || 0),
    inputTokens: Number(item?.inputTokens || 0),
    outputTokens: Number(item?.outputTokens || 0),
  };
}

export function estimateMaximumRequestMicrousd(messages: unknown) {
  const inputBytes = Buffer.byteLength(JSON.stringify(messages), "utf8");
  const maximumUsd =
    (inputBytes / 1_000_000) * INPUT_USD_PER_MILLION +
    (MAX_OUTPUT_TOKENS / 1_000_000) * OUTPUT_USD_PER_MILLION;
  return Math.max(1, Math.ceil(maximumUsd * 1_000_000));
}

export function estimateActualMicrousd(inputTokens: number, outputTokens: number) {
  const usd =
    (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION;
  return Math.max(0, Math.ceil(usd * 1_000_000));
}

export async function getAiUsage() {
  const result = await client.send(new GetCommand({ TableName: TABLE, Key: key() }));
  return usageFrom(result.Item);
}

export async function reserveAiBudget(maximumMicrousd: number) {
  const limit = limitMicrousd();
  const remainingBeforeReservation = limit - maximumMicrousd;
  if (remainingBeforeReservation < 0) throw new AiBudgetExceededError(await getAiUsage());
  try {
    await client.send(new UpdateCommand({
      TableName: TABLE,
      Key: key(),
      UpdateExpression: "SET committedMicrousd = if_not_exists(committedMicrousd, :zero) + :reserve, reservedMicrousd = if_not_exists(reservedMicrousd, :zero) + :reserve, updatedAt = :now, tenantId = :tenant",
      ConditionExpression: "attribute_not_exists(committedMicrousd) OR committedMicrousd <= :remaining",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":reserve": maximumMicrousd,
        ":remaining": remainingBeforeReservation,
        ":now": new Date().toISOString(),
        ":tenant": TENANT,
      },
    }));
    return maximumMicrousd;
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      throw new AiBudgetExceededError(await getAiUsage());
    }
    throw error;
  }
}

export async function settleAiBudget(
  reservedMicrousd: number,
  inputTokens: number,
  outputTokens: number,
) {
  const actual = estimateActualMicrousd(inputTokens, outputTokens);
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: key(),
    UpdateExpression: "SET updatedAt = :now ADD committedMicrousd :delta, reservedMicrousd :release, spentMicrousd :actual, requests :one, inputTokens :input, outputTokens :output",
    ExpressionAttributeValues: {
      ":now": new Date().toISOString(),
      ":delta": actual - reservedMicrousd,
      ":release": -reservedMicrousd,
      ":actual": actual,
      ":one": 1,
      ":input": Math.max(0, Math.floor(inputTokens)),
      ":output": Math.max(0, Math.floor(outputTokens)),
    },
  }));
  return getAiUsage();
}

export async function releaseAiBudget(reservedMicrousd: number) {
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: key(),
    UpdateExpression: "SET updatedAt = :now ADD committedMicrousd :release, reservedMicrousd :release",
    ExpressionAttributeValues: {
      ":now": new Date().toISOString(),
      ":release": -reservedMicrousd,
    },
  }));
}
