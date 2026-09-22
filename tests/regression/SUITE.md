# Candle Garden regression suite

High-level inventory of what the suite protects. **The mobile app is the primary surface.** Website, catalog, and payment checks stay in the same run so a refill or shop change cannot silently break the storefront.

How to run it: [README.md](./README.md). Command from the repo root: `npm test`.

---

## 1. Mobile app

The Expo app’s six tabs, refill estimator, in-app cart, and checkout math.

### App shell — `mobile-app.test.mjs`

| Check | What a failure means |
| --- | --- |
| Six tabs still exist (Home, Estimator, Products / Shop, Orders / Cart, Classes, Profile) | A screen was removed or renamed; customers would lose a path |
| Estimator still uses `calculateCost` / `isAcceptableDetection` and allows manual ounces | Photo quoting or the ounces fallback was disconnected |
| Shop still adds catalog items to the cart and blocks sold-out products | “Add to cart” no longer matches the shop catalog |
| Classes add a seat to the **app cart**; Acuity URLs stay blocked | Booking would open the paused scheduler again |
| Cart line keys keep refill, class, and 10oz/18oz product lines distinct | Cart merges or overwrites the wrong item |
| Checkout uses the live API, a `pk_test_` Stripe key, a device id for guests, and refuses live Stripe keys unless explicitly enabled | Test checkout could charge live, or guests could not pay |

### Shop & classes data — `mobile-shop.test.mjs`

| Check | What a failure means |
| --- | --- |
| Shop catalog is the shared `packages/catalog/products.json` snapshot | Mobile shop drifted from the website catalog |
| Category chips (All / Spring / Classic / Subscriptions) still filter | Collection tabs would show the wrong candles |
| Atlantic Beach price label is `from $34.00` (10oz–18oz range) | Size pricing display broke |
| Upcoming classes hide past dates and sort remaining ones | Classes tab would show expired seats as bookable |
| Live class URL is the Squarespace events page; refresh URL is the Vercel classes endpoint | Deep links point at the wrong booking surface |

### Refill estimator & shipping — `mobile-shipping.test.mjs`

| Check | What a failure means |
| --- | --- |
| Photo detection rejects empty / undetected / invalid / low-confidence results; 0.5 confidence is accepted | Bad photos would quote, or good photos would be rejected |
| 10 oz of wax is **$17.50** before shipping (`$1.75/oz`) | Refill wax rate changed without a product decision |
| A 5-digit ZIP is required; Alaska is out of UPS Ground Saver coverage | Quotes would succeed for destinations we cannot ship |
| Ship-own < prepaid labels < kit roundtrip (1 / 2 / 3 UPS trips) | Method prices inverted; customers would be over/under charged |
| Cartons remain small / medium / large UPS boxes | Box recommendation table was replaced |

These run the real `candle-garden-mobile/lib/pricing.js` + `shippingConfig.js` + `upsRates.js` modules, not a copy of the formulas.

---

## 2. Website (kept)

Public Vercel storefront and staff admin. Same `npm test` run.

### Storefront HTTP — `http/storefront.mjs`

Home, Shop, Classes, Our story, Contact: page loads, hero/copy, product cards, class dates or empty state, contact form.

### Storefront browser — `browser/storefront.mjs`

Same pages in Chromium: nav, shop count, a known product (Atlantic Beach), contact form, mobile menu.

### Admin HTTP + browser — `http/admin.mjs`, `browser/admin.mjs`

Login screen always. With `CANDLE_GARDEN_ADMIN_ID` / `CANDLE_GARDEN_ADMIN_PASSWORD`:

Website desks: Site health, Reports, Visitors, Messages, Shop, Classes, Business info, Photos, Announcements, Content AI, Social, Staff, Settings.

Mobile-admin desks: Overview, Orders, Customers, Engagement, App health.

Invalid login must return 401. Credentials are never stored in the suite.

---

## 3. Shared catalog & payments

Used by **both** the app cart and the website.

### Catalog snapshot — `catalog.test.mjs`

| Check | What a failure means |
| --- | --- |
| Products and classes are valid (unique ids, prices, images, URLs) | App shop or website grid would render broken rows |
| Atlantic Beach is $34 / $39 for 10oz / 18oz | Checkout cents would not match the shop |
| Payment-processor `catalog.json` / `classes.json` match `packages/catalog` | Mobile checkout would charge a stale price |

### Server checkout — `candle-saas-cdk/tests/test_payment_processor.py`

The phone cannot set the charge. These lock that rule:

| Check | What a failure means |
| --- | --- |
| Client `unitPrice` is ignored; catalog cents are used | A modified app could underpay |
| 18oz uses `priceMax` | Size upcharge disappeared |
| Unknown product / empty cart / missing refill ZIP rejected | Checkout would create a bad PaymentIntent |
| Refill total is server wax + UPS, not the client amount | Shipping could be skipped |
| Kit > prepaid labels > ship-own | Method pricing drifted from the app table |
| Alaska ZIP rejected | Out-of-coverage refill would still charge |
| Class seat uses catalog $60 | Class checkout would take $1 from the client |
| Mixed cart (candle + refill + class) sums all three | One line type would be dropped |
| Guest payment sheet works with `X-Device-Id`; signed-in JWT still tagged | Guest checkout or receipts would break |

---

## 4. Live device-adjacent checks

These used to be manual. They now run in CI/local `npm test`:

| Check | File | What a failure means |
| --- | --- | --- |
| Camera + library + HEIC→JPEG | `mobile-camera.test.mjs` | iPhone photos would never reach `/detect` |
| Vision `/detect` with a real JPEG fixture | `http/mobile-api.mjs` | Estimator backend is down or inventing quotes |
| Stripe PaymentSheet client secret (Atlantic Beach $34) | `http/mobile-api.mjs` | Test checkout cannot start (secret missing/wrong) |
| Guest `/orders` is rejected | `http/mobile-api.mjs` | Order history leaked without sign-in |
| Live UPS shipping quote | `http/mobile-api.mjs` | Refill shipping API is down |
| Cognito JWKS, bogus sign-in, forgot-password | `mobile-auth.test.mjs` | Profile login/reset cannot reach the user pool |
| EAS project + public App Store lookup + Expo Updates | `mobile-release.test.mjs` | Public listing missing (TestFlight-only until 1.1.0 is released for sale) |
| Apple Pay remains disabled | `mobile-release.test.mjs` | Merchant ID appeared without a product decision |

---

## Map

```
npm test
├── unit          catalog + mobile app/shop/shipping
├── cdk/payments  Stripe amount_from_catalog (server)
├── http          website storefront + admin login
└── browser       Playwright storefront + admin
```
