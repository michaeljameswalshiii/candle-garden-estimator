# Squarespace commerce capture for the mobile shop

Last updated: September 16, 2026

Candle Garden is on **Squarespace Commerce Advanced**, billed monthly at **$65**, renewing **October 1, 2026**. That plan already includes Products, Inventory, Orders, Transactions, Contacts, Discounts, and Webhook APIs. No Squarespace plan upgrade is required.

This work does **not** download customer records or historical orders.

## What is live now

| Item | Status |
| --- | --- |
| Public product/variant export | Done. `packages/catalog/products.json` and `variants.csv` |
| Store settings capture | Done. `packages/catalog/commerce-capture.json` |
| Operations center | Mobile admin **Jobs & health** lists every API and its live/credential status |
| Live catalog endpoint | `GET https://candle-garden-web.vercel.app/api/mobile/catalog` |
| Commerce/settings endpoint | `GET https://candle-garden-web.vercel.app/api/mobile/commerce` |
| Product refresh | Hourly/15-minute cron plus manual Run now |
| Webhook receiver | `POST https://candle-garden-web.vercel.app/api/webhooks/squarespace` |
| Commerce API overlay | Code is ready; needs `SQUARESPACE_API_KEY` |
| Webhook subscription | Receiver is ready; creating the subscription needs OAuth (API keys cannot subscribe) |

Refresh the snapshot anytime:

```bash
cd candle-garden-web
npm run export:catalog
```

## 1. Commerce API credentials (highest remaining setup step)

In Squarespace: **Settings → Developer tools → API keys** (or Developer platform).

Create a key named `Candle Garden Mobile Catalog` with **read** permissions:

- Products
- Inventory
- Discounts (optional, for checkout messaging)

Do **not** enable Contacts or Orders read unless a later migration needs it.

Store the key as `SQUARESPACE_API_KEY` on the Vercel project `candle-garden-web`. When present, product refresh overlays live stock from `GET https://api.squarespace.com/1.0/commerce/inventory`.

Website id: `65fae805de7d9316f58ac65f`  
Store page id: `65faf809b85f1d19a61c8359`

## 2. Complete product/variant export

The public collection JSON already includes product ids, variant ids, SKUs, prices, sizes, sold-out/unlimited flags, subscription plans, images, and categories.

Current unique live catalog (captured September 16, 2026):

- 27 products
- 58 variants
- Categories: Fall, Summer, Classic, Subscriptions, Gift cards
- 2 subscriptions (3-month and 6-month)
- 1 sold-out product
- Spring collection URL `/shop/spring` is gone (404)

The older bundled snapshot still listed spring scents that are no longer on the site. Live sync replaces that stale list.

## 3. Webhooks

Squarespace **does not** offer product or inventory webhook topics. Supported commerce topics are:

- `order.create`
- `order.update`
- `extension.uninstall`
- contact/address events (not used; they contain customer data)

The app endpoint is:

`POST /api/webhooks/squarespace`

It verifies `Squarespace-Signature` (HMAC-SHA256, hex secret decoded to bytes) and refreshes the catalog after order events so stock is not left stale.

Webhook subscriptions **require OAuth**, not an API key.

1. Create a Squarespace app / OAuth token with `website.orders` or `website.orders.read`.
2. `POST https://api.squarespace.com/1.0/webhook_subscriptions` with:

```json
{
  "endpointUrl": "https://candle-garden-web.vercel.app/api/webhooks/squarespace",
  "topics": ["order.create", "order.update"]
}
```

3. Save the returned `secret` as `SQUARESPACE_WEBHOOK_SECRET` (hex).
4. Save `SQUARESPACE_OAUTH_ACCESS_TOKEN` if you will manage subscriptions from code.

Until that secret exists, the endpoint also accepts `Authorization: Bearer $CRON_SECRET` for a signed test post.

## Shipping, pickup, returns, tax, gift cards, discounts

Captured from the live site (no customer data):

- Announcement: **Free Shipping over $50!**
- Shipping and billing **phone numbers are required**
- Default ship-to country: US
- Continue-shopping link after web checkout: `/`
- Return/cancellation copy currently on the store is the **class** policy (one-week public-class reschedule; no private-class cancel; late arrivals by phone)
- Class terms: one seat, BYOB, ~1 hour, pickup cooled candles next day or within a week
- Squarespace privacy-policy field is **empty**; the app privacy URL is the Next.js page below
- Gift cards: class gift card at `/giftcard/p/candle-class-gift-card` (digital redemption code; never expires; class-only)
- Pickup: not exposed in the public JSON. Confirm local pickup in Squarespace **Settings → Selling → Shipping**
- Tax: calculated on Squarespace checkout. Native app checkout is Stripe, not Squarespace tax
- Discount codes: not in the public JSON; use the Discounts API after the key is added

Native refill shipping remains the UPS Ground Saver rules in `lib/shippingConfig.js`. That is separate from Squarespace product shipping.

## Official branding

| Asset | Value |
| --- | --- |
| Logo (published) | `https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/f152dc96-196e-44c6-9eab-c51856309c22/Black+Piggie+Simple.png` |
| Storefront hero | `https://images.squarespace-cdn.com/content/v1/65fae805de7d9316f58ac65f/1710965056757-BVTFNTO7HAIQTF2135HC/storefront.jpg` |
| Primary | `#103831` |
| Light accent | `#EEE9F2` |
| Dark accent | `#393D24` |
| Instagram | https://www.instagram.com/thecandlegardenco/ |
| Facebook | https://www.facebook.com/thecandlegardenjax/ |

Original designer files (AI/PSD/PNG source) still have to be exported from Squarespace **Asset Library** or the designer. The URLs above are the published production files, not source masters.

## Domain / DNS for Universal Links and App Links

Needed later on `thecandlegarden.co`:

1. Keep HTTPS on `www.thecandlegarden.co`.
2. Serve `https://www.thecandlegarden.co/.well-known/apple-app-site-association` and `assetlinks.json`, **or** CNAME/proxy those paths to the Next.js app.
3. The Next.js app already serves both files:

- https://candle-garden-web.vercel.app/.well-known/apple-app-site-association
- https://candle-garden-web.vercel.app/.well-known/assetlinks.json

4. Set `APPLE_TEAM_ID` and `ANDROID_SHA256_CERT_FINGERPRINTS` on Vercel so those files are not empty.
5. App scheme: `candlegarden://` (Orders, Classes, Products).

## Permanent URLs

| Purpose | URL |
| --- | --- |
| Marketing site | https://www.thecandlegarden.co/ |
| Shop | https://www.thecandlegarden.co/shop |
| Product page | https://www.thecandlegarden.co/shop/p/{urlId} |
| Classes | https://www.thecandlegarden.co/candle-garden-events |
| Support / contact | https://www.thecandlegarden.co/get-in-touch |
| Story | https://www.thecandlegarden.co/my-story |
| Squarespace privacy | https://www.thecandlegarden.co/privacy-policy |
| Squarespace terms | https://www.thecandlegarden.co/terms-of-service |
| App privacy | https://candle-garden-web.vercel.app/privacy |
| App terms | https://candle-garden-web.vercel.app/terms |
| Account deletion | https://candle-garden-web.vercel.app/privacy/data-deletion |
| Checkout / booking return | https://candle-garden-web.vercel.app/app/return |
| Support email | jordan@thecandlegarden.co |

Squarespace does not publish a dedicated privacy or terms URL; those live on the app storefront.

## Checkout handoff

**Native shop (products + refills)**  
Cart stays in the app → Stripe Payment Sheet → remain on the Orders tab. Line items now store Squarespace `variantId` and `sku`.

**View on site**  
Opens the Squarespace product URL in the browser. After Squarespace checkout, send customers to:

`https://candle-garden-web.vercel.app/app/return?destination=orders`

which deep-links to `candlegarden://orders`.

**Classes**  
Open Acuity (`owner=32288720`) / Squarespace events. Return target: `/app/return?destination=classes`.

Scheduling/Acuity is a **separate** subscription from Commerce Advanced.

## Environment variables

| Name | Required for |
| --- | --- |
| `SQUARESPACE_API_KEY` | Products/Inventory/Discounts overlay |
| `SQUARESPACE_WEBHOOK_SECRET` | HMAC verification of Squarespace notifications |
| `SQUARESPACE_OAUTH_ACCESS_TOKEN` | Creating webhook subscriptions |
| `CRON_SECRET` | Cron + unsigned webhook test |
| `APPLE_TEAM_ID` | iOS Universal Links file |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Android App Links file |
