import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, AdminInitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const keys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const pool = "us-east-1_WTA7ZWxcr", clientId = "19gc38poajblf8qsagv3s93nvu";
const idp = new CognitoIdentityProviderClient({region:"us-east-1"});
const store = DynamoDBDocumentClient.from(new DynamoDBClient({region:"us-east-1"}));
const table = "candle-garden-detect-rate-limits";
export function validDevice(value:string) { return /^(dev|tmp)_[a-z0-9_]{10,80}$/i.test(value); }

export async function appleNonce(device:string) {
  if(!validDevice(device))throw new Error("A valid device identity is required.");
  // A fixed time window limits nonce creation per device without exposing identities.
  const window=Math.floor(Date.now()/60000);
  await store.send(new PutCommand({TableName:table,Item:{pk:`apple-start:${device}:${window}`,expires:Math.floor(Date.now()/1000)+120},ConditionExpression:"attribute_not_exists(pk)"}));
  const nonce=randomBytes(32).toString("hex");
  await store.send(new PutCommand({TableName:table,Item:{pk:`apple-nonce:${nonce}`,device,expires:Math.floor(Date.now()/1000)+300},ConditionExpression:"attribute_not_exists(pk)"}));
  return nonce;
}

export async function appleSession(identityToken:string,nonce:string,device:string,name:string) {
  if(!validDevice(device)||! /^[a-f0-9]{64}$/.test(nonce))throw new Error("Restart Sign in with Apple.");
  const {payload}=await jwtVerify(identityToken,keys,{issuer:"https://appleid.apple.com",audience:"com.michaeljameswalshiii.candlegarden",algorithms:["RS256"]});
  const signedNonce=String(payload.nonce||"");
  if(!payload.sub || (signedNonce!==nonce && signedNonce!==createHash("sha256").update(nonce).digest("hex")))throw new Error("The Apple sign-in challenge did not match.");
  await store.send(new DeleteCommand({TableName:table,Key:{pk:`apple-nonce:${nonce}`},ConditionExpression:"device = :device AND expires > :now",ExpressionAttributeValues:{":device":device,":now":Math.floor(Date.now()/1000)}}));
  // Apple identities get a distinct Cognito username. Never merge accounts by email.
  const username=`apple_${createHash("sha256").update(payload.sub).digest("hex").slice(0,40)}`;
  try { await idp.send(new AdminGetUserCommand({UserPoolId:pool,Username:username})); }
  catch(error) {
    if((error as Error).name!=="UserNotFoundException")throw error;
    if(!payload.email || ![true,"true"].includes(payload.email_verified as boolean|string))throw new Error("A verified Apple email is required to create your account.");
    const attrs=[{Name:"email",Value:String(payload.email)},{Name:"email_verified",Value:"true"}];
    if(name)attrs.push({Name:"name",Value:name.slice(0,120)});
    await idp.send(new AdminCreateUserCommand({UserPoolId:pool,Username:username,UserAttributes:attrs,MessageAction:"SUPPRESS"}));
  }
  // The password is a short-lived server credential, never sent to the customer.
  // Only a verified, unused Apple assertion can reach this session exchange.
  const password=`Aa1!${randomBytes(36).toString("base64url")}`;
  await idp.send(new AdminSetUserPasswordCommand({UserPoolId:pool,Username:username,Password:password,Permanent:true}));
  const result=await idp.send(new AdminInitiateAuthCommand({UserPoolId:pool,ClientId:clientId,AuthFlow:"ADMIN_USER_PASSWORD_AUTH",AuthParameters:{USERNAME:username,PASSWORD:password}}));
  if(!result.AuthenticationResult)throw new Error("Apple sign-in requires an additional account step.");
  const auth=result.AuthenticationResult;
  return {accessToken:auth.AccessToken,idToken:auth.IdToken,refreshToken:auth.RefreshToken,expiresIn:auth.ExpiresIn};
}
