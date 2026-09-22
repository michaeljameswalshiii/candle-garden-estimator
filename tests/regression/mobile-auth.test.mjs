import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ROOT } from "./helpers.mjs";

const client = fs.readFileSync(path.join(ROOT, "candle-garden-mobile/lib/cognitoClient.js"), "utf8");
const profile = fs.readFileSync(path.join(ROOT, "candle-garden-mobile/screens/ProfileScreen.js"), "utf8");
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "candle-garden-mobile/lib/cognitoConfig.json"), "utf8"),
);

test("profile can sign in, sign up, and reset a password through Cognito", () => {
  assert.match(client, /USER_PASSWORD_AUTH/);
  assert.match(client, /ForgotPassword/);
  assert.match(client, /ConfirmForgotPassword/);
  assert.match(profile, /Forgot password/);
  assert.match(profile, /forgotPassword/);
  assert.match(profile, /confirmForgotPassword/);
  assert.equal(config.userPoolId, "us-east-1_WTA7ZWxcr");
  assert.ok(config.clientId);
});

test("Cognito JWKS is reachable for the app user pool", async () => {
  const url = `${config.issuer}/.well-known/jwks.json`;
  const response = await fetch(url);
  assert.equal(response.ok, true, `JWKS HTTP ${response.status}`);
  const body = await response.json();
  assert.ok(Array.isArray(body.keys) && body.keys.length >= 1);
});

test("Cognito rejects a bogus sign-in instead of hanging", async () => {
  const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.clientId,
      AuthParameters: {
        USERNAME: "regression-missing@thecandlegarden.co",
        PASSWORD: "WrongPass1",
      },
    }),
  });
  const body = await response.json();
  assert.equal(response.ok, false, "bogus credentials must not authenticate");
  const type = String(body.__type || body.message || "");
  assert.match(type, /NotAuthorized|UserNotFound|InvalidParameter/i);
});

test("forgot-password endpoint is live for the app client", async () => {
  const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.ForgotPassword",
    },
    body: JSON.stringify({
      ClientId: config.clientId,
      Username: "regression-missing@thecandlegarden.co",
    }),
  });
  const body = await response.json().catch(() => ({}));
  const type = String(body.__type || "");
  assert.ok(
    response.ok || /UserNotFound|LimitExceeded|InvalidParameter|NotAuthorized/i.test(type),
    `unexpected forgot-password response ${response.status} ${type || JSON.stringify(body)}`,
  );
});
