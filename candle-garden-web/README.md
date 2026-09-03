# The Candle Garden Web

Next.js storefront and marketing site for The Candle Garden. This is an independently deployable app inside the same repository as the Expo mobile app and AWS CDK backend.

## Local development

```bash
npm install
npm run dev
```

The catalog adapter reads `../packages/catalog`, the shared source used by both web and mobile. Product checkout and class booking links continue to the live Squarespace store until the shared commerce API is ready.

## Vercel

Create a Vercel project with `candle-garden-web` as its Root Directory. The default Next.js build settings are sufficient.

Configure Grok through Amazon Bedrock Mantle using an IAM access-key pair. Set `AWS_REGION=us-east-1` and `BEDROCK_MANTLE_MODEL_ID=xai.grok-4.3`, then redeploy. Keep all credentials in Vercel rather than source or command history.

Set `AI_MONTHLY_BUDGET_USD=5`, `AI_USAGE_TENANT_ID=site-candle-garden`, and `DYNAMODB_BEDROCK_USAGE_TABLE=turnkey-bedrock-usage`. The assistant reserves the worst-case cost before every request in DynamoDB, rejects requests that could exceed the monthly cap, and reconciles the reservation to actual token usage afterward. Staff see current cost and remaining budget on `/admin/ai`. Visitors includes a distinct IP-address column.

The `prebuild` check stops a Vercel build when the Bedrock credentials are absent. After deployment, sign in and send a test message from `/admin/ai`.

The project is intentionally independent from Expo/EAS. `vercel.json` skips deployments when neither the web app nor the shared catalog changed.
