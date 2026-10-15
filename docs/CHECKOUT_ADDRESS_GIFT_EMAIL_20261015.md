# Checkout addresses and gift email — October 15, 2026

Implemented in the existing Candle Garden checkout and gift card service:

- Prefill checkout from account mailing details or the latest previous order with shipping; offer a previous-order address button. Preserve edits and keep address components together.
- Scope locally remembered checkout details to the signed-in Cognito subject, with separate guest storage. Server order history continues to derive identity from verified authentication/device ownership.
- Add a full US address field and **Find and check address**. Shippo parses the complete address and validates it before filling editable fields. ZIP city/state fill and mandatory validation before payment remain available. This is full-address lookup, not suggestions while typing.
- Gift emails show the existing brand logo, green/lavender gift card, amount, recipient, sender, and unchanged redemption code. Existing plain text and instructions remain. The design remains readable with images blocked. No new card or balance is issued by the presentation change.

Validation:

- 59 JavaScript regression tests passed.
- 52 Python payment/gift/email tests passed.
- Next.js typecheck and production build passed; Expo web export passed.
- Playwright at 390px: account address prefill, previous-order selection, full-address lookup, customer correction, no horizontal overflow.
- Gift email rendered and visually inspected at 390px; no horizontal overflow. No customer email was sent for testing.
- Live API: studio full address and structured address both validated with suite preserved; fabricated address rejected; short input rejected; unauthenticated order history rejected (401). Storefront, shop, catalog, and class endpoints returned 200.

Production:

- Web deployment: https://candle-garden-jncqgpsp1-michaeljameswalshiiis-projects.vercel.app ; alias https://candle-garden-web.vercel.app .
- Payment Lambda updated successfully on October 15. Release package was built from the downloaded production package, changing only gift_cards.py. Backup package retained outside Git in the local temporary directory.
- Existing unrelated working-tree changes were preserved. The deployed gift_cards.py matched production apart from this email presentation change.
- EAS production update published for iOS and Android, runtime 1.2.0, group `ef0beece-0b60-4d81-bf58-0bebdefbe0a4`.
- Dashboard: https://expo.dev/accounts/michaeljameswalshiii/projects/candle-garden-estimator/updates/ef0beece-0b60-4d81-bf58-0bebdefbe0a4 . Native iOS and Android exports completed successfully.
