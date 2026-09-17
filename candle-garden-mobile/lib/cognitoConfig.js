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

// AWS Candle SaaS API Gateway stacks were torn down (idle NAT ~$40/mo).
// Catalog/classes now come from candle-garden-web; do not point payments here.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ||
  'https://candle-garden-web.vercel.app';

export default cognitoConfig;
