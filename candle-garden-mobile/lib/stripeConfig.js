/** Public Stripe configuration. Keep the secret key in the payments Lambda. */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export const stripeConfigured = Boolean(STRIPE_PUBLISHABLE_KEY);
