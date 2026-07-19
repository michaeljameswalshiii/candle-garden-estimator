# Phase 1 Auth Setup — The Candle Garden App

**Status:** Implemented (2026-07-19)  
**Commit:** `6647c14` — *Implement Phase 1 Cognito auth for The Candle Garden App*  
**Related:** `docs/AUTH_AND_SECURITY.md` (ongoing security plan)

This document is the single place for **what was built**, **where it lives**, **how to test it**, and **what to do next**.

---

## Goals (Phase 1)

1. Create **Cognito user pool** + **public mobile app client**  
2. **AuthProvider** + **SecureStore** for sessions  
3. **Real Profile** sign-up / confirm / sign-in / sign-out  
4. **JWT** on order APIs; detect remains guest-friendly  

---

## Live AWS resources (us-east-1)

| Resource | Value |
|----------|--------|
| Account | `635449373837` |
| Region | `us-east-1` |
| Cognito user pool ID | `us-east-1_WTA7ZWxcr` |
| Pool name | `candle-garden-app-users` |
| App client ID | `19gc38poajblf8qsagv3s93nvu` |
| App client name | `candle-garden-mobile` |
| Client secret | **None** (public mobile client) |
| Auth flows | `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH` |
| Hosted UI domain prefix | `candle-garden-app-c954c8f3` |
| Issuer | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_WTA7ZWxcr` |
| JWKS | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_WTA7ZWxcr/.well-known/jwks.json` |

### Password policy

- Minimum length: **8**  
- Require uppercase, lowercase, numbers  
- Symbols: **not** required  

### Email verification

- Username attribute: **email**  
- Auto-verified: **email**  
- Sign-up requires confirmation code emailed by Cognito (default Cognito email until SES is configured)

---

## API Gateway

| Item | Value |
|------|--------|
| REST API ID | `yg1ec20ucf` |
| Stage | `prod` |
| Base URL | `https://yg1ec20ucf.execute-api.us-east-1.amazonaws.com/prod` |
| Cognito authorizer ID | `g4z8y1` |
| Authorizer name | `CandleGardenCognito` |
| Identity source | `method.request.header.Authorization` |

### Route auth matrix

| Method | Path | Authorization |
|--------|------|-----------------|
| `POST` | `/detect` | **NONE** (guest refill allowed; client may still send JWT) |
| `GET` | `/orders` | **COGNITO_USER_POOLS** |
| `POST` | `/orders` | **COGNITO_USER_POOLS** |
| `GET` | `/orders/{id}` | **COGNITO_USER_POOLS** |
| `PUT` | `/orders/{id}` | **COGNITO_USER_POOLS** |

**Token type for API Gateway:** send the Cognito **ID token** as:

```http
Authorization: Bearer <id_token>
```

---

## Mobile app — files

| File | Role |
|------|------|
| `lib/cognitoConfig.json` | Pool ID, client ID, region, issuer |
| `lib/cognitoConfig.js` | Exports config + `API_BASE` |
| `lib/cognitoClient.js` | SignUp, ConfirmSignUp, SignIn, Refresh, GetUser, SignOut |
| `lib/authStorage.js` | SecureStore for tokens + profile cache |
| `lib/AuthContext.js` | `AuthProvider`, `useAuth()` |
| `lib/apiClient.js` | `apiFetch`, `postDetect`, `createOrder`, `listOrders` + JWT headers |
| `screens/ProfileScreen.js` | Sign up / confirm / sign in / signed-in profile / sign out |
| `screens/EstimatorScreen.js` | Uses `postDetect` (optional JWT when signed in) |
| `screens/OrdersScreen.js` | Cart + “Place order (signed in)” via secured API |
| `App.js` | Wraps app in `AuthProvider`; bridges ID token into API client |
| `app.json` | Display name **The Candle Garden App**; plugin `expo-secure-store` |
| `package.json` | Dependency `expo-secure-store` |

### Backend / IaC files

| File | Role |
|------|------|
| `candle-saas-cdk/candle_saas/stacks/api.py` | Cognito authorizer on `/orders` for future deploys |
| `candle-saas-cdk/lambda_functions/order_processor/index.py` | Reads JWT claims; forces `customer_id` from `sub` |

---

## How auth works (flow)

### Sign up

1. User enters email, password, optional name on **Profile**  
2. App calls Cognito `SignUp`  
3. User receives email with confirmation code  
4. User enters code → `ConfirmSignUp` → automatic `SignIn`  
5. Tokens saved in SecureStore; profile loaded via `GetUser`  

### Sign in

1. Email + password → `InitiateAuth` (`USER_PASSWORD_AUTH`)  
2. Store access, id, refresh tokens + expiry  
3. Load user attributes  

### Session restore

1. On app launch, load tokens from SecureStore  
2. If access token expired, `REFRESH_TOKEN_AUTH`  
3. Re-fetch user profile  

### Sign out

1. Best-effort Cognito `GlobalSignOut`  
2. Clear SecureStore  
3. Clear in-memory user/session  

### API calls

1. `setAuthTokenGetter(() => getIdToken())` from `AuthTokenBridge` in `App.js`  
2. `apiClient` attaches `Authorization: Bearer <idToken>` when present  
3. Orders require token; detect does not  

---

## Guest vs signed-in

| Feature | Guest | Signed in |
|---------|-------|-----------|
| Home / Shop / Classes | Yes | Yes |
| Refill photo detect | Yes | Yes (JWT attached if available) |
| Mobile cart | Yes | Yes |
| Place order via API | No (prompt to sign in) | Yes |
| Website checkout link | Yes | Yes |
| Profile session | No | Yes |

---

## Order Lambda behavior

When `/orders` is called with a valid Cognito JWT:

1. API Gateway validates the token  
2. Lambda reads `requestContext.authorizer.claims`  
3. Sets `customer_id` from claim `sub` (or falls back carefully)  
4. **Ignores** client-supplied `customer_id` for identity (anti-spoof)  
5. If database is unavailable, `POST /orders` still returns **201** with an ephemeral “received” payload so the mobile app can complete UX  

---

## How to test

### Expo Go

1. Start Metro if needed:  
   `cd candle-garden-mobile` → `npx expo start --go`  
2. Open `exp://<your-lan-ip>:8081`  
3. Go to **Profile**  
4. **Create** account with a real email  
5. Enter confirmation code from email  
6. Confirm you see signed-in profile  
7. **Shop** → Add to cart → **Cart** → **Place order (signed in)**  
8. **Sign out** → place order should fail with sign-in required  

### CLI checks

```bash
# Client has no secret + password auth
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-1_WTA7ZWxcr \
  --client-id 19gc38poajblf8qsagv3s93nvu \
  --region us-east-1

# Orders POST requires Cognito
aws apigateway get-method \
  --rest-api-id yg1ec20ucf \
  --resource-id 5lvuym \
  --http-method POST \
  --region us-east-1

# Detect stays public
aws apigateway get-method \
  --rest-api-id yg1ec20ucf \
  --resource-id 5v0not \
  --http-method POST \
  --region us-east-1
```

---

## Security notes

1. **No client secret** in the app (correct for public mobile clients).  
2. Tokens only in **expo-secure-store**, not AsyncStorage.  
3. **No AWS access keys** in the mobile binary.  
4. Orders identity comes from **JWT**, not request body.  
5. Detect remains open for product UX; **rate limiting** is Phase 2.  
6. Before App Store: privacy policy, account deletion, and Sign in with Apple if any social login is added.  

---

## Phase 2+ backlog

- [ ] SES for branded Cognito emails  
- [ ] Rate limit guest `/detect`  
- [ ] Optional JWT enforcement / attribution on detect  
- [ ] Sign in with Apple / Google  
- [ ] Account deletion API + Profile UI  
- [ ] Persistent cart across reinstalls  
- [ ] Full order history screen from `GET /orders`  
- [ ] RDS-backed orders in all environments  

---

## App display name

| Surface | Value |
|---------|--------|
| App display name | **The Candle Garden App** |
| Expo slug (unchanged) | `candle-garden-estimator` |
| iOS/Android package (unchanged) | `com.michaeljameswalshiii.candlegarden` |

---

## Quick file map

```
candle-garden-mobile/
  docs/
    PHASE1_AUTH_SETUP.md      ← this file
    AUTH_AND_SECURITY.md      ← broader plan + live pointers
  lib/
    cognitoConfig.json
    cognitoConfig.js
    cognitoClient.js
    authStorage.js
    AuthContext.js
    apiClient.js
  screens/
    ProfileScreen.js
    EstimatorScreen.js
    OrdersScreen.js
  App.js
  app.json

candle-saas-cdk/
  candle_saas/stacks/api.py
  lambda_functions/order_processor/index.py
```

---

*When Cognito IDs, API ID, or auth matrix change, update this file and `lib/cognitoConfig.json` together.*
