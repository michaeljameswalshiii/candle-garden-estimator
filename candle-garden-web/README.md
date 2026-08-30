# The Candle Garden Web

Next.js storefront and marketing site for The Candle Garden. This is an independently deployable app inside the same repository as the Expo mobile app and AWS CDK backend.

## Local development

```bash
npm install
npm run dev
```

The initial catalog adapter reads the existing mobile product and class JSON files so both experiences begin with matching content. Product checkout and class booking links continue to the live Squarespace store until the shared commerce API is ready.

## Vercel

Create a Vercel project with `candle-garden-web` as its Root Directory. The default Next.js build settings are sufficient.
