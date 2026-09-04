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
EXPO_PUBLIC_APPLE_MERCHANT_IDENTIFIER=merchant.com.michaeljameswalshiii.candlegarden
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

In the Candle Garden Apple Developer account, create the Merchant ID
`merchant.com.michaeljameswalshiii.candlegarden`, enable Apple Pay for the app
identifier `com.michaeljameswalshiii.candlegarden`, and add the Merchant ID in
Stripe's Apple Pay settings. Then make an iOS development build. Apple Pay does
not work in Expo Go or in an iOS simulator.

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
