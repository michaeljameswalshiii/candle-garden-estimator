# Candle Garden 1.2.1 (34)

Includes gift card removal from Home, Shop, refreshed catalogs, and saved carts; the Atlantic Beach visit section below the website link; and a searchable per-vessel refill scent picker with fragrance notes and a use-for-all shortcut.

Refill scents use the approved list from the existing release candidate, including Blood orange and Vanilla. Its single shared source is `packages/catalog/refill-scents.json`, used by the Scents tab, estimator, and server checkout validation. Different vessel/scent assignments stay separate in the cart. Selections are stored on the order and shown in cart, receipt, order history, and mobile admin. Older app orders without this field remain compatible.

The current iOS signing profile excludes Apple Pay; this release preserves that configuration. Sign in with Apple remains configured separately and requires a successful physical-device sign-in before it can be called verified.

Validation: 55 regression checks, TypeScript, Next production build, iOS/Android/web exports, and production API rejection checks passed.

Build: https://expo.dev/accounts/michaeljameswalshiii/projects/candle-garden-estimator/builds/f41c1b39-4052-48a1-8e30-8f33763417fd

Submission: https://expo.dev/accounts/michaeljameswalshiii/projects/candle-garden-estimator/submissions/9f9e4fc8-db01-48bb-9356-2b767e8a13b3

Device acceptance: photograph multiple vessels, choose different scents, search by fragrance notes, apply one scent to all, verify missing selections block adding to cart, and confirm the order retains each vessel's scent. Repeat with manual ounces and with a reorder. Verify the Home footer and absence of gift card purchase links. Verify Apple first-time sign-in, returning sign-in, and Hide My Email on a physical iPhone.
