# SES email + social login (Phase 2 ops)

## SES branded Cognito emails

**Current:** Cognito uses `COGNITO_DEFAULT` email (limited volume, generic From).  
**SES identities in us-east-1:** none configured yet (`aws ses list-identities` was empty).

### Steps to enable branded mail

1. In **SES** (us-east-1), verify domain `thecandlegarden.co` (or a mailbox like `noreply@…`).  
2. Publish DKIM/SPF DNS records SES provides.  
3. If account is in SES **sandbox**, request production access (or only send to verified emails).  
4. Cognito → User pool `us-east-1_WTA7ZWxcr` → **Messaging** → set email to **Send email with SES** and pick the verified identity.  
5. Optional: custom message templates (verification, forgot password) with “The Candle Garden App” branding.

```bash
# After domain is verified:
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_WTA7ZWxcr \
  --email-configuration EmailSendingAccount=DEVELOPER,SourceArn=arn:aws:ses:us-east-1:ACCOUNT:identity/thecandlegarden.co \
  --region us-east-1
```

---

## Sign in with Apple / Google

**Not wired in the app yet** (needs Apple Developer + store entitlements).

### Apple (required if any third-party login ships on iOS)

1. Apple Developer → Identifiers → enable **Sign In with Apple** on `com.michaeljameswalshiii.candlegarden`.  
2. Create Services ID + key if using Cognito Hosted UI / federation.  
3. Cognito → Federation → Apple identity provider.  
4. App: `expo-apple-authentication` + rebuild (not Expo Go alone for production).  

### Google

1. Google Cloud OAuth client (iOS/Android).  
2. Cognito Google IdP.  
3. App: `expo-auth-session` or Amplify Hosted UI.

Until then: **email + password + confirmation + forgot password** is the supported path.

---

## What is already in the app (no SES/Apple required)

- Forgot password / reset code flow on Profile  
- Account delete → `POST /account/purge` then Cognito `DeleteUser`  
- Detect uses **verified** access tokens via Cognito `GetUser` when present  
