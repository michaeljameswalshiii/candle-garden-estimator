# Shippo setup — Candle Garden

Test mode is free and returns fake labels. There is no live token yet, so nothing can be charged.

## Credentials

Put the test token in **server** env only:

```
SHIPPO_API_TOKEN=shippo_test_...
```

Keep `.env` / `.env.local` out of git. Never put this token in the mobile app, Expo public env, or a committed file.

- Mobile API (Lambda): AWS Secrets Manager `candlesaas/shippo` → `SHIPPO_SECRET_ARN`
- Website / mobile admin (Next.js): Vercel `SHIPPO_API_TOKEN` and local `candle-garden-web/.env.local`

## API

- Base URL: `https://api.goshippo.com`
- Auth header: `Authorization: ShippoToken <SHIPPO_API_TOKEN>`
- Optional version: `SHIPPO-API-VERSION: 2018-02-08`

### Rates

`POST /shipments/` with `address_from`, `address_to`, `parcels`, `async: false`.
The response `rates` list is the quote. The app picks the cheapest **USPS** rate.

### Label purchase

`POST /transactions/` with `{ "rate": "<rate object_id>", "async": false, "label_file_type": "PNG" }`.
Test mode returns a fake `tracking_number` and `label_url`.

### Tracking

Shippo returns `tracking_url_provider` on the transaction. USPS numbers also work at tools.usps.com.

## Carriers

USPS works as-is in test. These need action in the Shippo portal before they return live rates:

- Canada Post
- DHL Express
- UPS US
- UPS Canada

Direct UPS OAuth (`ups_client.py` / `src/lib/ups.ts`) is **kept** but **disabled** (`UPS_ENABLED=false`). Set `UPS_ENABLED=true` and restore credentials to use it again. To let Shippo shop UPS rates once the portal is connected, set `SHIPPO_ALLOW_UPS=true`.

## Candle-specific

- Origin: 363 Atlantic Boulevard, Suite 8, Atlantic Beach, FL 32233
- Three refill methods still apply: ship-own (1 outbound), prepaid labels (return + outbound), packing kit (kit + return + outbound)
- Glass: wrap each vessel; billed weight is max(scale, dim)
- Return labels use Shippo `extra.is_return`
- Estimator ZIP-only quotes may use a placeholder street; checkout uses the customer address

## Re-enable UPS later

1. Finish UPS US in the Shippo portal **or** set `UPS_ENABLED=true` for the direct API
2. Optionally `SHIPPO_ALLOW_UPS=true`
3. Redeploy Lambda env / Vercel env
