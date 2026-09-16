# Shared Candle Garden catalog

This directory is the source of truth for product and class snapshots used by both deployable applications:

- `products.json` powers the mobile Shop tab and Next.js storefront. It now includes variant IDs, SKUs, prices, sizes, categories, images, sold-out flags, and subscription plans.
- `variants.csv` is a spreadsheet-friendly export of every variant.
- `commerce-capture.json` stores Squarespace website/store settings **without** customer or order data.
- `classes.json` powers the mobile class schedule and Next.js classes page.
- `squarespace-public.mjs` maps the public Squarespace collection JSON used by live refresh.

Refresh products from the live shop:

```bash
cd candle-garden-web
npm run export:catalog
```

The Next.js app also refreshes this catalog on a schedule and after Squarespace `order.create` / `order.update` webhooks. When `SQUARESPACE_API_KEY` is set, inventory quantities overlay the public snapshot.
