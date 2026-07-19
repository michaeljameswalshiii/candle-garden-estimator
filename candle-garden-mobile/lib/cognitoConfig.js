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

export const API_BASE =
  'https://yg1ec20ucf.execute-api.us-east-1.amazonaws.com/prod';

export default cognitoConfig;
