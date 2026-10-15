# Candle Garden app gift cards

## Customer flow

The existing Shop tab contains a compact **Give a gift card** card immediately below its header. It opens a full-screen mobile sheet with six amounts: **$25, $50, $75, $100, $250, $500**. The form supports email to the buyer or a recipient, optional names, and a personal message. A fixed payment button stays accessible while the form scrolls. No additional navigation tab or shipping address is needed.

Gift cards are purchased separately from physical items. The recipient gets a branded HTML email plus a plain-text version containing the amount, message, code, and instructions. The buyer receives a separate order receipt. Codes work in app checkout for candles, refills, and classes; they do not work in the separate Squarespace checkout. Existing Squarespace gift cards remain separate and hidden from the ordinary app product catalog.

Cart has an expandable gift card field with balance lookup. The server applies up to the available balance; unused value stays on the card. Fully covered orders complete without a card payment. If a remainder would be less than Stripe's $0.50 minimum, the card contribution is reduced to leave a $0.50 payment and preserve the difference on the gift card. Gift cards cannot buy other gift cards or subscriptions. Promotion codes cannot be combined with gift cards in this release. App gift cards have no expiration configured.

## Payment and delivery

- New gift flows use the AWS payment service; ordinary checkout keeps its current website payment service.
- Redemption uses the same authoritative website pricing function as ordinary checkout through `/payments/quote`, including shipping and per-vessel scents. Production quote errors fail closed.
- Amounts use integer cents. Codes have 128 bits of randomness and are indexed by SHA-256. The delivery record retains the code for email retries in an encrypted DynamoDB table. Codes must never be logged.
- Test and live cards are isolated. Test emails explicitly identify the card as having no cash value.
- Orders are saved before requesting payment. Stripe PaymentIntent creation uses an order-based idempotency key.
- DynamoDB transactions reserve balance and create the reservation ledger together. Reservations only return value after confirmed Stripe cancellation, or when a fully covered unpaid checkout is cancelled.
- Paid issuance creates a card, delivery record, and issuance marker in one transaction. Repeated finalization or webhook delivery cannot create additional cards.
- Checkout references are saved locally before Stripe opens. Unfinished payments can be checked, continued, or cancelled rather than purchased again.
- Signed Stripe events complete delivery even if the buyer closes the app. A five-minute scheduled worker also verifies unfinished payments and retries email delivery. Abandoned unpaid checkouts are cancelled after an hour, then their reserved gift value is restored.
- Email delivery uses a short lease. A crash after the email provider accepts an email but before the delivery marker saves can produce a duplicate email with the same code; it cannot create another card or balance.

## Administration and refunds

The existing mobile order administration includes **Resend gift card email** and **Disable gift card** actions. Resends go to the originally selected delivery email, with the original code, through the retry worker. Disabled cards cannot be redeemed or resent.

Gift-related orders support full refunds in the existing administration. Refunds of a purchased card require its entire original balance to remain available; used cards need shop review. The card is disabled before cash is refunded. For orders paid partly or fully with a card, gift value is restored once and any cash portion is refunded through Stripe using an idempotency key. Partial gift-order refunds need a manual adjustment in this release. A full Stripe charge refund on a mixed-payment order also restores its gift contribution. Out-of-order and duplicate refund events cannot add value twice.

If a refund is made directly in Stripe for a gift card purchase that has already been spent, the webhook disables the card and flags the order for review. Shop staff must resolve already-spent value; automatic cash refunds of used cards are blocked in administration.

## Deployment configuration

Implementation is local until the website, AWS stack, and app are released.

1. Deploy the website's quote route, shared pricing module, and admin controls.
2. Deploy `CandleSaasAPIStack`. It creates `candle-garden-gift-cards` with encryption, recovery, and retain-on-removal, grants Lambda access, adds the three gift action routes, and installs the five-minute delivery worker. No existing cards should be deleted when changing the stack.
3. Configure the AWS payment service with a Stripe key from the same account and environment as the app's publishable key. Live charging retains the existing `STRIPE_LIVE_ENABLED=true` gate. Keep test mode during acceptance testing.
4. Create the Secrets Manager JSON secret `candlesaas/gift-card-services`, or pass `giftServicesSecretArn` to CDK. It must contain `STRIPE_WEBHOOK_SECRET` and `CLASS_SEAT_SECRET`. The latter must match the website's existing `CLASS_SEAT_SECRET`. Direct Lambda environment variables with those names are also supported. Never commit secret values.
5. In the corresponding Stripe environment, send `payment_intent.succeeded`, `payment_intent.canceled`, and `charge.refunded` to the AWS `/payments/webhook` endpoint. Set the signing secret from this endpoint, not from another webhook. Delivery recovery still runs on the schedule, but webhooks are needed for immediate delivery and refund handling.
6. Confirm SES production delivery and the existing verified sender identity. The default sender is `The Candle Garden <hello@tripleibusinesssolutions.com>` with replies to `jordan@thecandlegarden.co`; override `ORDER_FROM_EMAIL` and `ORDER_REPLY_TO` if using a verified Candle Garden sender.
7. Grant the website's AWS principal `GetItem`, `UpdateItem`, and transactional item write permissions on `candle-garden-gift-cards`. The table name can be overridden with `CANDLE_GIFT_CARDS_TABLE`. Admin operations use the existing authenticated admin session.
8. Release the app update after backend acceptance checks. Test a purchase, recipient email, partial redemption, full redemption, cancellation, app restart recovery, resend, and full refund in Stripe test mode before enabling real charges.

## Local validation

Install Python test dependencies with `python -m pip install -r candle-saas-cdk/requirements-test.txt`, then run `npm run test:cdk` and `npm run test:unit`.

For mobile browser QA, run `npm run build:web` in `candle-garden-mobile`, serve its `dist` on `127.0.0.1:8091`, and run `npm run test:gift:ui` from the repository root. `GIFT_UI_BASE_URL` overrides the server address. The UI test stubs payments and email status; it never charges or sends email. Screenshots are written to `test-results`. It exercises the $500 purchase, recipient fields, email confirmation, balance lookup, and a fully covered redemption. An existing web AuthContext native SecureStore cleanup warning is recorded separately from new errors. Native device payment-sheet and actual email delivery acceptance remain release checks.
