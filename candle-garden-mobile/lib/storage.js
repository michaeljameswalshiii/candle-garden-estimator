import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function browserStorage() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage;
}

export async function getStoredItem(key) {
  const web = browserStorage();
  if (web) return web.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setStoredItem(key, value) {
  const web = browserStorage();
  if (web) {
    web.setItem(key, String(value));
    return;
  }
  await SecureStore.setItemAsync(key, String(value));
}

export async function deleteStoredItem(key) {
  const web = browserStorage();
  if (web) {
    web.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
