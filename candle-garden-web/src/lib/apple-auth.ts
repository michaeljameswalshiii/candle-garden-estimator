import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminGetUserCommand, AdminSetUserPasswordCommand, AdminInitiateAuthCommand, AdminRespondToAuthChallengeCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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
  await store.send(new UpdateCommand({TableName:table,Key:{pk:`apple-start:${device}:${window}`},
    UpdateExpression:"SET expires = :expiry ADD hits :one",ConditionExpression:"attribute_not_exists(hits) OR hits < :limit",
    ExpressionAttributeValues:{":expiry":Math.floor(Date.now()/1000)+120,":one":1,":limit":5}}));
  const nonce=randomBytes(32).toString("hex");
  await store.send(new PutCommand({TableName:table,Item:{pk:`apple-nonce:${nonce}`,device,expires:Math.floor(Date.now()/1000)+300},ConditionExpression:"attribute_not_exists(pk)"}));
  return nonce;
}

export async function appleSession(identityToken:string,nonce:string,device:string,name:string,linkExisting = false) {
  if(!validDevice(device)||! /^[a-f0-9]{64}$/.test(nonce))throw new Error("Restart Sign in with Apple.");
  const {payload}=await jwtVerify(identityToken,keys,{issuer:"https://appleid.apple.com",audience:"com.michaeljameswalshiii.candlegarden",algorithms:["RS256"]});
  const signedNonce=String(payload.nonce||"");
  if(!payload.sub || (signedNonce!==nonce && signedNonce!==createHash("sha256").update(nonce).digest("hex")))throw new Error("The Apple sign-in challenge did not match.");
  await store.send(new DeleteCommand({TableName:table,Key:{pk:`apple-nonce:${nonce}`},ConditionExpression:"device = :device AND expires > :now",ExpressionAttributeValues:{":device":device,":now":Math.floor(Date.now()/1000)}}));
  const mappingKey=`apple-user:${createHash("sha256").update(payload.sub).digest("hex")}`;
  const mapping=await store.send(new GetCommand({TableName:table,Key:{pk:mappingKey},ConsistentRead:true}));
  let username=String(mapping.Item?.username||"");
  if(!username) {
    if(!payload.email || ![true,"true"].includes(payload.email_verified as boolean|string))throw new Error("A verified Apple email is required to create your account.");
    const email=String(payload.email).trim().toLowerCase();
    let existing;
    try { existing=await idp.send(new AdminGetUserCommand({UserPoolId:pool,Username:email})); }
    catch(error) { if((error as Error).name!=="UserNotFoundException")throw error; }
    if(existing) {
      if(!linkExisting)throw Object.assign(new Error("This email already has a Candle Garden account. Confirm that you want to link Sign in with Apple."),{code:"APPLE_LINK_REQUIRED"});
      username=String(existing.Username);
    } else {
      const attrs=[{Name:"email",Value:email},{Name:"email_verified",Value:"true"}];
      if(name)attrs.push({Name:"name",Value:name.slice(0,120)});
      const created=await idp.send(new AdminCreateUserCommand({UserPoolId:pool,Username:email,UserAttributes:attrs,MessageAction:"SUPPRESS"}));
      username=String(created.User?.Username||email);
      // Only a brand-new Apple account gets an initial password. Never change an existing email password.
      await idp.send(new AdminSetUserPasswordCommand({UserPoolId:pool,Username:username,Password:`Aa1!${randomBytes(36).toString("base64url")}`,Permanent:true}));
    }
    try { await store.send(new PutCommand({TableName:table,Item:{pk:mappingKey,username},ConditionExpression:"attribute_not_exists(pk)"})); }
    catch(error) {
      const saved=await store.send(new GetCommand({TableName:table,Key:{pk:mappingKey},ConsistentRead:true}));
      if(saved.Item?.username!==username)throw error;
    }
  }
  const challenge=await idp.send(new AdminInitiateAuthCommand({UserPoolId:pool,ClientId:clientId,AuthFlow:"CUSTOM_AUTH",AuthParameters:{USERNAME:username}}));
  if(challenge.ChallengeName!=="CUSTOM_CHALLENGE" || !challenge.Session)throw new Error("Apple session exchange is not configured.");
  const answer=await store.send(new GetCommand({TableName:table,Key:{pk:`apple-auth:${challenge.ChallengeParameters?.challengeId}`},ConsistentRead:true}));
  if(!answer.Item?.answer || answer.Item.username!==username || answer.Item.expires<=Date.now()/1000)throw new Error("Restart Sign in with Apple.");
  const result=await idp.send(new AdminRespondToAuthChallengeCommand({UserPoolId:pool,ClientId:clientId,ChallengeName:"CUSTOM_CHALLENGE",Session:challenge.Session,
    ChallengeResponses:{USERNAME:username,ANSWER:String(answer.Item.answer)}}));
  if(!result.AuthenticationResult)throw new Error("Apple sign-in requires an additional account step.");
  const auth=result.AuthenticationResult;
  return {accessToken:auth.AccessToken,idToken:auth.IdToken,refreshToken:auth.RefreshToken,expiresIn:auth.ExpiresIn};
}
