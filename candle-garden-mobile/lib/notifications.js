/**
 * Push notifications are temporarily disabled in the native release until the
 * Apple App ID has the Push Notifications capability. Keep this stable API so
 * Profile can explain the limitation without crashing or requesting permission.
 */
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'cg_expo_push_token_v1';

export async function getStoredPushToken() {
  return null;
}

export async function registerForPushNotificationsAsync() {
  return {
    token: null,
    error: 'Push notifications are temporarily unavailable in this release.',
  };
}

export async function clearPushToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* Ignore cleanup errors for a legacy local token. */
  }
}
