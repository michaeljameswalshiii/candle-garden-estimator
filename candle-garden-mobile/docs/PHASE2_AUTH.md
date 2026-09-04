# Phase 2 Auth & Platform Hardening — The Candle Garden App

**Status:** Implemented (core items) — 2026-07-19  
**Builds on:** Phase 1 Cognito + Profile + JWT on `/orders`  
**See also:** `PHASE1_AUTH_SETUP.md`, `AUTH_AND_SECURITY.md`

---

## What Phase 2 includes (done)

### 1. Guest `/detect` rate limiting

| Setting | Value |
|---------|--------|
| DynamoDB table | `candle-garden-detect-rate-limits` |
| Guest limit | **20** requests / hour / IP |
| Signed-in limit | **80** requests / hour / Cognito `sub` |
| Window | 3600 seconds |
| On exceed | HTTP **429** + `error: rate_limited` |
| Fail mode | **Open** if DynamoDB errors (refills still work) |

Lambda: `container_detector/index.py`  
Env vars: `RATE_LIMIT_TABLE`, `GUEST_DETECT_LIMIT`, `AUTH_DETECT_LIMIT`, `RATE_WINDOW_SECONDS`

### 2. Optional JWT attribution on detect

- `/detect` stays **public** (no API Gateway Cognito authorizer)  
- If client sends `Authorization: Bearer <id_token>`, Lambda best-effort decodes payload for `sub` / `email`  
- Response includes:
  - `user: { authenticated, sub?, email? }`
  - `rate_limit: { remaining, limit, window_seconds, bucket }`

**Note:** Payload decode is **not** cryptographic verification (gateway does not authorize detect). Identity is for rate-bucket + analytics attribution only.

### 3. Persistent cart

- Cart lines stored in **expo-secure-store** key `cg_cart_v1`  
- Survives app kill / reload on device  
- Cleared when user clears cart or after successful place-order  

File: `lib/cart.js`

### 4. Order history

- **Cart & orders** tab loads `GET /orders` when signed in  
- Pull-to-refresh  
- Shows id, status, date, total when present  

Files: `screens/OrdersScreen.js`, `lib/apiClient.js` → `listOrders()`

### 5. Account deletion

- Cognito `DeleteUser` with access token  
- Profile → **Delete account** (double confirm)  
- Clears local session/tokens  

Files: `lib/cognitoClient.js` → `deleteUser`, `AuthContext.deleteAccount`, Profile UI

### 6. SES / branded email (status)

| Item | Status |
|------|--------|
| Cognito default email | Active (Phase 1) |
| Custom SES domain + branded templates | **Not automated** — requires verified domain in SES + Cognito email config |

**To finish SES later (ops):**

1. Verify domain (or email) in **SES** us-east-1  
2. Move SES out of sandbox if needed  
3. Cognito → User pool → Messaging → use SES for emails  
4. Optional custom message Lambda / templates for “The Candle Garden App” branding  

---

## Phase 2 continued (also done)

### Forgot password
- Profile modes: **Forgot** → email code → **Set new password**  
- Cognito `ForgotPassword` / `ConfirmForgotPassword`

### Verified detect attribution
- Client sends **access token** on `/detect` when signed in  
- Lambda calls **Cognito GetUser** to validate token  
- Higher rate-limit bucket only when **verified**  
- Response: `user.token_verified: true|false`

### Account data purge
- `POST /account/purge` (Cognito authorizer, same as orders)  
- Deletes detect rate-limit keys for `user:{sub}`  
- Soft-deletes orders (`status=deleted`) when DB available  
- Profile delete flow: purge → Cognito `DeleteUser`

### SES / social login
- Ops guide: `docs/SES_AND_SOCIAL_LOGIN.md`  
- No SES identities in account yet — cannot auto-enable branded mail  
- Apple/Google not wired (needs Apple Developer + rebuild)

---

## Phase 2 continued (round 3)

### Durable orders (DynamoDB)
- Table: `candle-garden-orders`  
- GSI: `customer_id-created_at-index`  
- Order Lambda is **DynamoDB-first** (no RDS required)  
- Create / list / get / soft-delete on purge  

### Guest device rate limit
- Mobile sends `X-Device-Id` (SecureStore)  
- Detect rate-limit bucket: `device:{id}` for guests  

### Push notifications scaffold
- `expo-notifications` + `expo-device` (runtime support remains installed; the
  iOS config plugin is temporarily disabled until Push Notifications is enabled
  for the App ID in Apple Developer)  
- Profile toggle registers Expo push token on device  
- Server send pipeline still Phase 3  

### Ops
- `docs/SES_AND_SOCIAL_LOGIN.md` for SES + Apple/Google  

---

## Phase 2 continued (round 4)

### Server push (Expo)
- Table: `candle-garden-push-tokens`  
- `POST /account/push-token` / `DELETE /account/push-token` (JWT)  
- Profile toggle syncs token to backend when signed in  
- On **order create** and **status update**, Lambda sends Expo Push API notification  

### API throttle
- Stage `prod` method throttle: rate 10/s, burst 20  
- Usage plan `candle-garden-detect-throttle` (rate 5, burst 10) attached to prod  

### Change password
- Signed-in Profile section → Cognito `ChangePassword`  

---

## Intentionally deferred (Phase 3)

- [ ] Sign in with **Apple** / Google (federation code)  
- [ ] SES branded templates (after domain verify)  
- [ ] AWS WAF web ACL (beyond stage throttle)  
- [ ] Admin order-status UI that triggers more push types  

---

## How to test Phase 2

### Rate limit

1. As guest, call detect repeatedly (or script 21+ times from same network)  
2. Expect **429** with `rate_limited` after guest limit  
3. Sign in → higher limit (different bucket)

### Persistent cart

1. Add items in Shop  
2. Force-close Expo Go / app  
3. Reopen → Cart should still show items  

### Order history

1. Sign in  
2. Place order from cart  
3. History section refreshes (or pull to refresh)  

### Delete account

1. Sign in  
2. Profile → Delete account → confirm twice  
3. Cannot sign in with same credentials until new sign-up  

---

## AWS resources added in Phase 2

| Resource | Name / ID |
|----------|-----------|
| DynamoDB | `candle-garden-detect-rate-limits` (TTL on `ttl`) |
| IAM | Role policy `CandleGardenDetectRateLimit` on Lambda execution role |
| Lambda env | Rate limit vars on ContainerDetector function |

---

## File map

```
candle-saas-cdk/lambda_functions/container_detector/index.py  # rate limit + JWT attribution
candle-garden-mobile/lib/cart.js                              # SecureStore persistence
candle-garden-mobile/lib/cognitoClient.js                     # DeleteUser
candle-garden-mobile/lib/AuthContext.js                       # deleteAccount
candle-garden-mobile/screens/ProfileScreen.js                 # Delete account UI
candle-garden-mobile/screens/OrdersScreen.js                  # History + cart
docs/PHASE2_AUTH.md                                           # this file
```

---

*Update this doc when limits, SES, or social login change.*
