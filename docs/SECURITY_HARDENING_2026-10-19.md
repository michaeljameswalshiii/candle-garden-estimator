# Security hardening while testing

These changes preserve the existing app screens, guest checkout and order history,
Cognito email/Apple login, gift-card purchase/redemption, Stripe test mode, and
staff fulfillment. Payment mode flags, product prices, and Expo runtime versions
are unchanged. Released to production on October 19, 2026; deployment details and
live verification are recorded below.

## Changes

- Public payment/detection Lambdas verify RS256 signatures, issuer, expiration,
  token use and the intended Cognito app client. Both existing ID tokens and
  access tokens work. Invalid supplied tokens are rejected, not treated as guests.
- The verifier and pinned portable dependencies are packaged in a shared Lambda
  layer. CDK builds this layer locally during synthesis; dependencies and build
  outputs stay ignored. No dependency packages or credentials are committed.
- Sign-in and refresh keep the token expiry in memory as well as SecureStore, so
  long testing sessions refresh instead of repeatedly sending expired tokens.
- Guest detection retains its per-device allowance. An additional 200-request
  hourly IP budget prevents unlimited device-ID rotation. The budget can be set
  with `GUEST_IP_DETECT_LIMIT`; the IP comes from API Gateway, not a caller header.
- Label retries require the existing checkout and its owner (or gift checkout
  token). Payment is verified with Stripe before buying labels. Items,
  destination and shipping plan come from the stored checkout. Unpaid checkout
  retries do not buy labels. The existing staff reprint route is unchanged.
- Ordinary finalization checks ownership and payment/order metadata, amount,
  amount received, currency, and test/live mode. Verified webhooks and scheduled
  recovery still work without a device header. Gift checkout tokens remain valid.
- Customers cannot write paid/fulfillment states through the legacy order-update
  API. The app uses its existing payment finalizer and the shop uses staff routes.
- Legacy web order registration returns the authoritative checkout record rather
  than creating another order from customer-supplied prices and items.
- Account cleanup is provisioned as a Cognito-protected route. It paginates orders
  and push registrations, anonymizes order records while retaining a small
  accounting reference, and propagates cleanup failures. The app deletes the
  Cognito account only after cleanup succeeds, allowing a failed attempt to be
  retried. This does not change third-party Stripe/carrier retention policies.
- Cleanup handles the active `push:<customer>:<token>` registrations in the shared
  table as well as legacy push registrations. A missing legacy-only table is
  tolerated; permission failures and other storage errors still fail the purge.
- The paused scheduler WebView validates HTTPS hostnames, rejects deceptive URLs,
  and disallows mixed HTTP content. The active class-cart flow is unchanged.

## Validation

Run from the repository root:

```powershell
python -m pytest candle-saas-cdk/tests -q
node --test tests/regression/security.test.mjs
```

The Python suite builds the same dependency layer as CDK. It verifies genuine and
tampered signatures, both ID/access tokens, the pure-Python RSA backend without
host crypto packages, guest and signed-in test payments, payment substitutions,
label authorization, customer status restrictions, cleanup pagination/failure,
and the synthesized authorizer/layer configuration. Provider and storage side
effects in the new security tests are mocked; these checks do not buy postage,
charge cards, or delete real accounts. Existing moto gift-card tests cover
purchase/redemption and recovery with DynamoDB expressions.

The JavaScript checks exercise local API route handlers with HTTP Requests and
mocked providers, permitted/rejected WebView URLs, and account-deletion sequencing.
Website typecheck/build and Expo export validate compilation separately.

Verified locally: 99 Python tests passed, all 6 new JavaScript security/API smoke
checks passed, website typecheck/build passed, CDK synthesis passed, and the Expo
web export passed. A native device/TestFlight payment run remains a release check.

The wider JavaScript suite currently has two existing failures in
`tests/regression/mobile-app.test.mjs`: an outdated tab-title expectation and an
expectation for the removed text `Sign up for an account`. The affected app files
were not modified by this change. Keep these failures distinct from the security
checks rather than altering the interface to satisfy stale copy assertions.

## Release order

1. Review/deploy the AWS changes, including the verification layer and protected
   account-purge route, through the existing CDK workflow. Synthesis installs
   pinned pure-Python wheels into ignored `.build/auth-layer` on the build machine.
2. Deploy the web order/finalization handlers through the existing web project.
3. Publish the mobile JavaScript changes through the existing compatible testing
   channel/build process. No native dependency or runtime-version change is needed.
4. In the testing environment, exercise one guest and one signed-in Stripe test
   payment, gift purchase/redemption, refill-label retrieval/reprint, Apple login,
   and deletion of a fictional test account. Confirm a failed cleanup leaves the
   account available to retry. Use mocked carriers or the established carrier test
   configuration when testing label purchase.

The deployed backends must be checked after release; source changes alone do not
prove the active API configuration matches CDK. Only fictional release-check
accounts and scratch test orders were purged during verification.

## Production release

- Security source commit: `25c554d5f5ea385fede7615b7dd927cd19941052`, pushed to
  `fix/live-api-and-claude-46`. The active-push cleanup correction and this release
  record follow in the next commit on the same branch.
- Website: production deployment `dpl_7TFF9i7nxWM9zLjxoMYQZKtAUxUm`, ready and
  aliased to https://candle-garden-web.vercel.app . Deployed from a clean archive of
  the committed website and shared catalog files.
- AWS: `CandleSaasAPIStack` reached `UPDATE_COMPLETE`. An additive CloudFormation
  change set created the verification layer, protected account routes and invoke
  permissions, and refreshed the production API deployment. It did not modify
  existing Lambda environments, IAM policies, storage tables, or unrelated routes.
- Lambda code was updated on the existing functions from rollback copies of their
  production packages, replacing only `index.py`. Payment and detection use
  verification layer `CognitoVerificationLayer4CF34030:1`. Payment/detection
  published versions are `1`; the final order processor version is `2`.
- Lambda layer attachments were updated directly to preserve live configuration
  that is not fully represented in CDK. A future complete CDK deployment must
  reconcile the deployed email/shipping environment and code/layer state before
  applying the full synthesized template. Do not overwrite live settings with
  CDK defaults. Rollback packages/configuration are retained outside Git.
- Mobile: production iOS/Android update group
  `739207b1-62dc-48d8-9788-7990f6f45331`, runtime `1.2.0`. Expo's production update
  endpoint was checked separately for each platform and serves the new updates:
  iOS `01a15568-b5dc-79e4-8812-e5d267fb65c4`, Android
  `01a15568-b5dc-72df-9a88-f3d39a684206`. No new store binary was submitted.
- Stripe remains in test mode. AWS live charging and UPS mode flags were preserved,
  and EAS production environment verification confirmed a test publishable key.

Live checks passed for forged-token rejection, unauthenticated purge rejection,
guest checkout/order isolation, real Cognito ID/access tokens, signed-in unpaid
checkout/finalization, blocked customer `paid` status writes, authoritative order
registration, and label retries that do not buy postage for unpaid orders. A
fictional account registered a disabled fictional push token, then successfully
purged its orders/push registration and deleted its Cognito account. All scratch
test intents were cancelled and scratch records were removed. No payment was
confirmed/captured, no postage was purchased, and no customer account was touched.

An on-device Apple sign-in and completed test card-payment run remains part of
ongoing acceptance testing; the automated release checks do not claim those were
performed on a physical phone.

## Deferred work

The mobile dependency audit needs a separate Expo-compatible upgrade pass. Do not
run `npm audit fix --force`: its suggested version changes include framework
downgrades. The audit counts are not proof of installed-app exploitability.

Dormant public product/image/recommendation routes, broad shared Lambda IAM,
revocation/abuse controls, retained Apple identity mappings, and provider-side
privacy retention require separate review before a public-launch sign-off. This
patch addresses the concrete checkout/auth/deletion/WebView findings; it is not
a certification of every deployed service or third-party integration.
