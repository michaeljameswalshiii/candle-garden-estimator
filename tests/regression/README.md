# Candle Garden regression suite

Runnable checks for the **mobile app** (primary), plus the website, shared catalog, and server checkout.

**Inventory of every check:** [SUITE.md](./SUITE.md)

## Commands

From the repository root:

```bash
npm test
```

That runs, in order:

1. **Unit** — `node --test tests/regression/*.test.mjs`
2. **Payments / CDK** — `python -m pytest candle-saas-cdk/tests`
3. **HTTP smoke** — fetch public (and optional admin) routes
4. **Browser** — Playwright scripts in `browser/`

Individual pieces:

```bash
npm run test:unit
npm run test:cdk
npm run test:http
npm run test:browser
```

## Targets

| Variable | Default | Purpose |
| --- | --- | --- |
| `BASE_URL` | `https://candle-garden-web.vercel.app` | Storefront / admin origin |
| `CANDLE_GARDEN_ADMIN_ID` | unset | Staff ID for admin scripts |
| `CANDLE_GARDEN_ADMIN_PASSWORD` | unset | Staff password for admin scripts |
| `SKIP_BROWSER=1` | off | Skip Playwright |
| `SKIP_CDK=1` | off | Skip pytest |

Admin scripts skip (they do not fail) when credentials are missing. They never read passwords from source files.

## Scripts

- `SUITE.md` — high-level list of every check
- `mobile-app.test.mjs` — tabs, estimator wiring, shop cart, classes vs Acuity, Stripe/API
- `mobile-shop.test.mjs` — shared catalog filters, prices, upcoming classes
- `mobile-shipping.test.mjs` — photo gates, wax rate, ZIP, three UPS methods
- `catalog.test.mjs` — product/class JSON and payment-processor copies
- `http/storefront.mjs` / `http/admin.mjs` — website status + HTML
- `browser/storefront.mjs` / `browser/admin.mjs` — Playwright page flows

GitHub Actions workflow: `.github/workflows/regression.yml`.
