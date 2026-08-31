# Shared Candle Garden catalog

This directory is the source of truth for product and class snapshots used by both deployable applications:

- `products.json` powers the mobile Shop tab and Next.js storefront.
- `classes.json` powers the mobile class schedule and Next.js classes page.

The adapters in each application own presentation logic. Updating catalog data here triggers both path-scoped validation workflows because both applications consume it.
