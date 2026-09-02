/** Public Stripe configuration. Keep the secret key in the payments Lambda. */
export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Create this identifier in Candle Garden's Apple Developer account before
// building iOS. It is ignored on Android and web.
export const APPLE_MERCHANT_IDENTIFIER =
  process.env.EXPO_PUBLIC_APPLE_MERCHANT_IDENTIFIER || '';

export const stripeConfigured = Boolean(STRIPE_PUBLISHABLE_KEY);
