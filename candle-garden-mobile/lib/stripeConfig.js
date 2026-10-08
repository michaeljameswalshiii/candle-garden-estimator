/** Public Stripe configuration. Secret key stays in the payments Lambda. */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_SFpJJeiKspT62G0KMCoh6Y6q';

export const stripeConfigured = Boolean(STRIPE_PUBLISHABLE_KEY);
export const APPLE_MERCHANT_IDENTIFIER = process.env.EXPO_PUBLIC_APPLE_MERCHANT_IDENTIFIER || 'merchant.com.michaeljameswalshiii.candlegarden';
export const stripeTestMode = STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_');
