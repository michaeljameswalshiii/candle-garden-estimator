# Stripe test checkout setup

The app has a native Stripe PaymentSheet checkout. It is **test-only**.
PaymentIntent amounts are calculated from `packages/catalog/products.json`
on the server. The phone cannot set the charge. Live keys (`sk_live_`) are
refused unless CDK is deployed with `-c stripeLiveEnabled=true`.

## 1. Create test credentials

In the Candle Garden Stripe Dashboard, turn on **Test mode** and copy the
publishable (`pk_test_...`) and secret (`sk_test_...`) keys. Do not put the
secret key in the mobile app, a git-tracked file, or chat.

Create `candle-garden-mobile/.env` locally:

```dotenv
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

The publishable key is designed for the client. The secret key is not.

## 2. Put the test secret in AWS Secrets Manager

The AWS secret container `candlesaas/stripe/test` is already connected to the
deployed payments Lambda. After rotating the exposed test key in Stripe, update
that secret in the AWS Secrets Manager console with this JSON value:

```json
{"STRIPE_SECRET_KEY":"sk_test_..."}
```

The API has already been deployed with the secret ARN. Only use this command
again if the secret is recreated with a different ARN:

```powershell
cd candle-saas-cdk
npx cdk deploy CandleSaasAPIStack -c stripeSecretArn="arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:candlesaas/stripe/test-..."
```

Keep `stripeLiveEnabled` unset. The Lambda refuses `sk_live_` keys unless that
setting is explicitly enabled.

## 3. Apple Pay setup

Apple Pay is enabled in both PaymentSheet checkouts (`OrdersScreen.js` and
`GiftCardPurchase.js` pass `applePay: { merchantCountryCode: 'US' }`). `app.json`
sets the merchant ID `merchant.com.michaeljameswalshiii.candlegarden` on the
`@stripe/stripe-react-native` plugin and in the iOS entitlement
`com.apple.developer.in-app-payments`. Standard card checkout still works
without Apple Pay.

Complete these Apple / Stripe steps so the Apple Pay button appears on a device:

1. **Apple Developer** (account holder): Certificates, Identifiers & Profiles →
   Identifiers → Merchant IDs → `+` → create
   `merchant.com.michaeljameswalshiii.candlegarden`.
2. **Apple Developer**: Identifiers → App IDs →
   `com.michaeljameswalshiii.candlegarden` → enable **Apple Pay Payment
   Processing** and select that Merchant ID. (EAS capability sync may do this
   during the build; if the build complains, do it manually.)
3. **Stripe Dashboard** (the Stripe account that takes payments, in live mode):
   Settings → Payment methods → Apple Pay → Add new application (iOS
   certificate) → **Download the CSR** from Stripe.
4. **Apple Developer**: open the Merchant ID → Apple Pay Payment Processing
   Certificate → Create Certificate → upload the Stripe CSR → download the
   resulting `.cer` file.
5. **Stripe Dashboard**: upload that `.cer` file in the same Apple Pay screen.
6. Make an iOS EAS build (Apple Pay does not work in Expo Go or the iOS
   simulator) and test on a physical device with a card in Wallet.

```powershell
cd candle-garden-mobile
npx eas build --profile development --platform ios
```

## 4. Test safely

Sign into the app, add an item, then select **Test checkout with Stripe**. Use
Stripe's test card from its Dashboard/documentation. A successful test payment
creates an order marked `paid_test`; no real charge is made.

## Before accepting live payments

- Confirm Squarespace and the JSON catalog stay in price lockstep, or move
  inventory to a single server-owned source.
- Configure a Stripe webhook at `/payments/webhook` and store its signing
  secret on the payments Lambda.
- Replace the test keys with Candle Garden's live keys only after the owner has
  completed Stripe business verification.
- Enable live mode deliberately with `-c stripeLiveEnabled=true`.
