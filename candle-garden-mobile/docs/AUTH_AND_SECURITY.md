# Auth & security — The Candle Garden App

**Status:** Phase 1 + Phase 2 core implemented (2026-07-19)  
**App name:** The Candle Garden App  
**Phase 2 details:** `docs/PHASE2_AUTH.md`

---

## Live Cognito (us-east-1)

| Item | Value |
|------|--------|
| User pool | `us-east-1_WTA7ZWxcr` (`candle-garden-app-users`) |
| App client (public, no secret) | `19gc38poajblf8qsagv3s93nvu` |
| Auth flows | `USER_PASSWORD_AUTH`, `REFRESH_TOKEN_AUTH`, `USER_SRP_AUTH` |
| Hosted domain prefix | `candle-garden-app-c954c8f3` |
| Config file | `lib/cognitoConfig.json` |

Password policy: min 8, upper + lower + number.

---

## Mobile app

| Piece | Location |
|-------|----------|
| Secure token storage | `lib/authStorage.js` + `expo-secure-store` |
| Cognito API client | `lib/cognitoClient.js` |
| Auth context | `lib/AuthContext.js` (`AuthProvider`, `useAuth`) |
| API + JWT headers | `lib/apiClient.js` (sends **ID token** as `Authorization: Bearer`) |
| Profile UI | `screens/ProfileScreen.js` — sign up / confirm / sign in / sign out |

### Guest vs signed-in

- **Guest:** Shop, Classes, Home, Refill detect  
- **Signed-in:** Orders API (`GET/POST /orders`), Stripe test checkout (`POST /payments/payment-sheet`), profile session  

---

## API Gateway (`yg1ec20ucf` / prod)

| Route | Auth |
|-------|------|
| `POST /detect` | **NONE** (guest estimator; client still attaches JWT when signed in) |
| `GET/POST /orders`, `GET/PUT /orders/{id}` | **COGNITO_USER_POOLS** authorizer `CandleGardenCognito` (`g4z8y1`) |

Order Lambda forces `customer_id` from JWT `sub` (ignores spoofed body ids). If RDS is offline, POST still returns an accepted ephemeral order for mobile UX.

CDK (`candle_saas/stacks/api.py`) updated so future deploys keep Cognito on orders.

---

## Phase 2 (core done)

- Rate limit guest `/detect` (DynamoDB; 20/hr guest, 80/hr signed-in)  
- Optional JWT attribution on detect (response `user` + `rate_limit`)  
- Account deletion (Cognito DeleteUser + Profile UI)  
- Persistent cart (SecureStore)  
- Order history (`GET /orders` on Cart tab)  

## Stripe test checkout

Native PaymentSheet is in the Cart tab. Secret keys stay in AWS Secrets
Manager. See `docs/STRIPE_TEST_SETUP.md`. Live charges stay off.

## Phase 2.5 / 3 (not done)

- Sign in with Apple / Google  
- SES branded Cognito emails  
- Full JWT verify / authorizer on detect  
- Backend data purge on account delete  
- Push notifications  
- Live Stripe charges  

---

## How to test

1. Reload Expo Go → **Profile**  
2. **Create** account with a real email → enter confirmation code  
3. **Sign in**  
4. Add shop items → **Cart** → **Place order (signed in)**  
5. Sign out → order API should 401 without token  

---

## Security baseline (still apply)

1. HTTPS only  
2. No AWS secrets in the app  
3. Tokens only in Secure Store  
4. Privacy policy before store launch  
5. Account deletion before App Store  
6. Sign in with Apple if any social login is added  
