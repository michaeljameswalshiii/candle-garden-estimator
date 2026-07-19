/**
 * Push notifications for The Candle Garden App.
 * Registers Expo push token on device and syncs to backend when signed in.
 * Order create/status updates send via Expo Push API from order Lambda.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { registerPushToken, unregisterPushToken } from './apiClient';

const TOKEN_KEY = 'cg_expo_push_token_v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getStoredPushToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Request permission and return Expo push token (or null).
 * @param {{ syncToServer?: boolean }} opts - when true and signed in, POST token to API
 */
export async function registerForPushNotificationsAsync(opts = {}) {
  const { syncToServer = false } = opts;

  if (!Device.isDevice) {
    return { token: null, error: 'Push requires a physical device' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return { token: null, error: 'Notification permission not granted' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData?.data || null;
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      if (syncToServer) {
        try {
          await registerPushToken(token, Platform.OS);
        } catch (e) {
          // Token still valid locally; server sync can retry later
          console.warn('Push token server sync failed', e?.message);
        }
      }
    }
    return { token, error: null };
  } catch (e) {
    return { token: null, error: e.message || 'Could not get push token' };
  }
}

export async function clearPushToken(opts = {}) {
  const { syncToServer = false } = opts;
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (syncToServer && token) {
      try {
        await unregisterPushToken(token);
      } catch {
        /* ignore */
      }
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
