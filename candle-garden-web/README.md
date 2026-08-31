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

The project is intentionally independent from Expo/EAS. `vercel.json` skips deployments when neither the web app nor the shared catalog changed.
