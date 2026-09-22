# TestFlight acceptance — build 19 (Stripe test mode)

Use this checklist on a physical iPhone after build **1.1.0 (19)** appears in TestFlight.

Stripe stays in **test mode** for this candidate. Do not enable live charges until every item below passes.

EAS links for this candidate:

- Build: https://expo.dev/accounts/michaeljameswalshiii/projects/candle-garden-estimator/builds/96f7ae44-c561-44bf-b3db-fda9f1c0a499
- Submission: https://expo.dev/accounts/michaeljameswalshiii/projects/candle-garden-estimator/submissions/95af3c2b-d74d-4658-b868-22c4173462fd

## Before you start

1. Install TestFlight build **1.1.0 (19)** (or newer production build from this candidate).
2. Fully close and reopen the app once so any OTA update can load.
3. Confirm Shop shows **Live Squarespace inventory** (or a clear saved-inventory fallback).
4. Confirm Classes shows public class dates only (no private / invite-only events).

## Shop + catalog

- [ ] Open **Shop** — catalog loads without a blank screen.
- [ ] Atlantic Beach **10 oz** shows **$35.00**; **18 oz** shows **$42.00**.
- [ ] Sold-out variants are not addable (or clearly blocked).
- [ ] Leave Shop open ~1 hour (or force a remount) and confirm a refresh still succeeds.

## Classes

- [ ] Open **Classes** — upcoming public classes appear.
- [ ] No private Squarespace events appear in the list.
- [ ] Add a class to cart (in-app) without bouncing to Squarespace checkout.

## Refill estimator (camera)

- [ ] Open **Refill / Estimate**.
- [ ] Allow camera permission if prompted.
- [ ] Photograph an empty vessel; estimate returns ounces and confidence.
- [ ] Rate shows **$1.75/oz**.
- [ ] Example: 10 oz → wax **$17.50** before shipping.
- [ ] Enter a valid ZIP (e.g. `32250`); shipping quote succeeds.
- [ ] Add the refill line to cart with the estimate photo attached.

## Checkout (Stripe test)

- [ ] Cart totals match Shop / refill pricing (server-authoritative).
- [ ] Start checkout with a Stripe **test** card (e.g. `4242 4242 4242 4242`).
- [ ] PaymentIntent succeeds in test mode; order appears under Orders / Profile.
- [ ] Cancel or leave any leftover test PaymentIntent clean if you abort mid-flow.
- [ ] Confirm no live `pk_live_` / real charge was used.

## After pass

1. Reply that build 19 acceptance passed (or note any fail).
2. Only then flip Stripe to live keys / `MOBILE_LIVE_PAYMENTS` and cut a follow-up build if required.

## If something fails

Capture: build number, screen name, exact error text, and whether Shop said Live vs Saved inventory.
