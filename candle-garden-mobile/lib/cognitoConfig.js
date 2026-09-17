/**
 * Cognito config for The Candle Garden App (public mobile client — no secret).
 * Pool created in us-east-1 for Phase 1 auth.
 */
import raw from './cognitoConfig.json';

export const cognitoConfig = {
  region: raw.region || 'us-east-1',
  userPoolId: raw.userPoolId,
  clientId: raw.clientId,
  issuer: raw.issuer,
  domainPrefix: raw.domainPrefix,
};

// Redeployed CandleSaas API (no NAT). Catalog/classes still use candle-garden-web.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  'https://ry95dso7lc.execute-api.us-east-1.amazonaws.com/prod';

export default cognitoConfig;
