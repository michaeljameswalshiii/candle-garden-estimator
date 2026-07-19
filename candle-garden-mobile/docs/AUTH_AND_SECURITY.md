# Auth & security — The Candle Garden App

**Status:** Recommended plan (not fully implemented yet)  
**App name:** The Candle Garden App  
**Last updated:** 2026-07-19

Profile today is **demo-only** (no real login). Use this doc when implementing accounts.

---

## Goals

| Goal | Why |
|------|-----|
| Save refill estimates & vessel history | Repeat customers |
| Cart / orders tied to a person | Checkout, support, history |
| Optional class booking identity | Same email as website |
| Protect APIs (detect, orders) | Stop abuse of vision/billing endpoints |
| Keep UX light | Don’t force signup before browsing shop/classes |

---

## Recommended approach (phased)

### Phase 0 — Guest mode (now / keep forever)

- Browse **Shop**, **Classes**, **Home** without login  
- **Refill estimator** can work as guest (device-local history optional)  
- Soft prompt: “Save this estimate — create an account”

### Phase 1 — Customer accounts (MVP auth)

**Provider: AWS Cognito** (you already use Cognito on Turnkey/other AWS work) **or** Clerk/Auth0 if you want faster mobile UX.

| Decision | Recommendation |
|----------|----------------|
| Identity | Email + password **or** “magic link” / OTP email |
| Social (optional) | Apple Sign In (required if any social on iOS) + Google |
| Guest checkout | Allowed; account optional |
| Tokens | Cognito JWT (access + refresh); store in **expo-secure-store** only |
| Session | Silent refresh; logout clears secure storage |

**Why Cognito:** Fits existing AWS stack (API Gateway, Lambda detector), IAM authorizers, low cost at small scale.

**Why not only Squarespace accounts:** Squarespace is weak as a mobile auth backend; better to own customer identity for refill/orders.

### Phase 2 — Harden APIs

| Control | How |
|---------|-----|
| Auth on sensitive routes | API Gateway JWT authorizer on `/detect`, order create, etc. |
| Guest detect | Rate limit by device/IP + short-lived anonymous token |
| Abuse | Cap images/day per user; size limits; WAF optional |
| Secrets | Never ship AWS keys in the app; only call **your** HTTPS APIs |
| Images | Private S3 + short-lived upload URLs if you store photos |

### Phase 3 — Business features

- Order history (refills + shop cart intent)  
- Saved addresses for return shipping  
- Push notifications (Expo) for “refill ready / shipped”  
- Staff/admin is **separate** (not this consumer app)

---

## Security baseline (do these regardless of provider)

1. **HTTPS only** for all APIs  
2. **No long-lived secrets** in the mobile binary  
3. **Secure storage** for tokens (`expo-secure-store`), not AsyncStorage alone  
4. **Certificate pinning** optional later (mitm for high risk)  
5. **Privacy policy + terms** before App Store: camera, photos, account data  
6. **Minimal PII:** name, email, phone, shipping address; document retention  
7. **App Transport / ATS** defaults (already normal on iOS)  
8. **Encryption export** — you already set `ITSAppUsesNonExemptEncryption: false` for standard HTTPS  
9. **Input validation** server-side on every Lambda  
10. **CORS** locked to known web origins if you add a web client  

---

## Suggested UX flow

```
App open
  → Guest home (shop / classes / estimator)
  → Profile → “Sign in or create account”
  → Email OTP or password
  → Optional: link guest cart / last estimate to account
```

**Don’t** block the whole app behind login. Force auth only when:

- Saving order history  
- Placing a paid refill that needs identity  
- Viewing past orders  

---

## Data model (minimal)

| Entity | Fields |
|--------|--------|
| User | id, email, name, phone, cognito_sub, created_at |
| Address | user_id, line1, city, state, zip |
| RefillEstimate | user_id?, device_id?, ounces, vessels_json, box_key, total, created_at |
| Order | user_id, type (refill/shop), status, totals, shipping |

---

## Expo / app wiring (when implementing)

| Package | Use |
|---------|-----|
| `expo-secure-store` | Tokens |
| `expo-auth-session` + Cognito Hosted UI **or** Amplify Auth | Login |
| `expo-apple-authentication` | Sign in with Apple |
| React Context `AuthProvider` | Session + profile |

API clients send: `Authorization: Bearer <access_token>`.

---

## App Store notes

- **Sign in with Apple** if you offer any third-party login  
- Account deletion path required (Settings → Delete account → API)  
- Privacy nutrition labels: camera, photos, contact info, identifiers  

---

## Name

| Surface | Value |
|---------|--------|
| Display name | **The Candle Garden App** |
| Expo `app.json` `name` | The Candle Garden App |
| Bundle id (unchanged) | `com.michaeljameswalshiii.candlegarden` |
| Expo slug (unchanged) | `candle-garden-estimator` (URL stability on Expo) |

Changing the **store listing** name is free in App Store Connect / Play Console; changing **bundle id** is a new app — avoid unless required.

---

## Next implementation sprint (when you say go)

1. Cognito user pool (app client, no secret for public mobile)  
2. `AuthProvider` + SecureStore  
3. Profile: real sign-in / sign-out / delete account stub  
4. API Gateway JWT on detector (with guest rate limit)  
5. Attach `user_id` to refill estimates when logged in  

---

*Profile UI logout today is a stub until Phase 1 ships.*
