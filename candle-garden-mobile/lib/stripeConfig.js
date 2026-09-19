/** Public Stripe configuration. Secret key stays in the payments Lambda. */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_SFpJJeiKspT62G0KMCoh6Y6q';

export const stripeConfigured = Boolean(STRIPE_PUBLISHABLE_KEY);
