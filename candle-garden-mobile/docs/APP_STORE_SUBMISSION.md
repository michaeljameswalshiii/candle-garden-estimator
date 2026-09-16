# App Store submission handoff

Last updated: September 16, 2026

## Current build

- App name: The Candle Garden App
- Bundle ID: `com.michaeljameswalshiii.candlegarden`
- Version: `1.1.0`
- Latest completed production build: `8`
- Production build `9` queued after the legal/support and version-display updates
- iPhone and iPad are supported
- Non-exempt encryption: No

## Suggested App Store metadata

### Subtitle

Candle refills, shopping & classes

### Promotional text

Estimate candle refill volume from a photo or manual ounce entry, shop The Candle Garden, book a candle class, and check out securely.

### Description

Bring your favorite candle vessels back to life with The Candle Garden App.

Use a photo to estimate your vessel's refill volume, or enter ounces manually. Review refill pricing and shipping options, shop The Candle Garden's candle collection, discover candle classes, and check out securely as a guest or with an account.

Create an account to keep your order history in one place, manage your password, and delete your account directly from the app whenever you choose.

Photo-based estimates are approximate. Final pricing and shipping charges are shown before payment.

### Keywords

candles,candle refill,soy candle,candle class,home fragrance,Atlantic Beach

### URLs

- Support URL: `https://www.thecandlegarden.co/get-in-touch`
- Marketing URL: `https://www.thecandlegarden.co/`
- Privacy Policy URL: `https://www.thecandlegarden.co/privacy-policy`
- App Privacy Policy URL: `https://candle-garden-web.vercel.app/privacy`
- Account deletion URL: `https://candle-garden-web.vercel.app/privacy/data-deletion`
- Terms of Use URL: `https://candle-garden-web.vercel.app/terms`

### Review contact

- Phone: `+19043167608`
- Email: `jordan@thecandlegarden.co`

## Suggested review notes

The app supports guest browsing and guest checkout. An account is optional and is used for order history and account management.

The candle estimator can use the camera or photo library only after the reviewer chooses the corresponding action. If camera or photo access is denied, the reviewer can enter ounces manually and continue using the refill workflow.

Account deletion is available in Profile > Delete account. It requires two confirmations and removes the user's authentication account.

Stripe handles card entry and payment processing; secret keys are stored only on the backend. UPS is used for shipping quotes and shipping-label creation. If a live UPS Ground Saver rate is temporarily unavailable, the app displays the configured fallback shipping rate instead of blocking checkout.

No third-party or social login is offered. Push notifications are not included in this release.

Provide the permanent reviewer email and password in App Store Connect after creating and testing that account. Do not require the reviewer to receive an email or one-time code during review.

## App privacy questionnaire draft

Confirm these selections in App Store Connect against the production behavior before submission.

### Contact info

- Name: Collected, linked to the user, used for app functionality
- Email address: Collected, linked to the user, used for authentication, app functionality, and customer support
- Phone number: Collected during shipping/checkout when supplied, linked to the user or purchase, used for app functionality
- Physical address: Collected for shipping, linked to the user or purchase, used for app functionality

### Purchases

- Purchase history: Collected, linked to the user when signed in, used for app functionality and customer support
- Payment information: Entered into Stripe's payment interface. The app/backend should declare payment information only if it has access to that data beyond Stripe tokens and transaction status.

### User content

- Photos: Collected only when the user selects or takes a vessel photo, used for app functionality; not used for tracking

### Identifiers

- User ID: Collected, linked to the user, used for authentication, account management, fraud prevention, and app functionality
- Device ID: Do not declare unless production analytics, advertising, fraud, or notification tooling collects it

### Diagnostics

- Crash data / performance data: Declare only if enabled by Apple, Expo, or another production diagnostics service and exposed to the developer

### Tracking

- The current app does not use data for cross-app advertising tracking and does not need App Tracking Transparency permission

## Required manual verification matrix

- [ ] Physical iPhone: launch, navigation, camera allow/deny, photo library allow/deny, manual ounces
- [ ] Physical iPad: layout, navigation, camera/photo/manual estimate
- [ ] Guest checkout and cancellation
- [ ] Successful controlled live purchase and refund
- [ ] Sign-up and email confirmation
- [ ] Sign-in and sign-out
- [ ] Forgot-password and reset flow
- [ ] Password change
- [ ] Account deletion
- [ ] Backend failure messaging
- [ ] Shipping validation and UPS error fallback
- [ ] Permanent reviewer account tested from a clean install
- [ ] Build selected in App Store Connect
- [ ] Screenshots uploaded for every required device class
- [ ] Age rating, export compliance, content rights, and review contact completed

## Current external blockers

- Stripe remains in test mode. Live publishable and secret keys plus an explicitly authorized real transaction are required.
- UPS OAuth works, but account `28J2F3` is not enabled for UPS Ground Saver service code `93` (UPS error `120052`). A support request must be completed after the UPS reCAPTCHA.
- A billable UPS label should not be generated until Ground Saver is enabled and a real test shipment is explicitly authorized.
- The public Privacy Policy is hosted at `https://candle-garden-web.vercel.app/privacy`.
- Physical iPhone/iPad testing, screenshots, and final App Store Connect questionnaire entry require the devices/account UI.
