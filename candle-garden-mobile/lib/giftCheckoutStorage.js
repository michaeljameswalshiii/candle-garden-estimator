import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = (kind) => `cg_gift_checkout_${kind}_v1`;

export async function loadGiftCheckout(kind) {
  const value = Platform.OS === 'web'
    ? globalThis.localStorage.getItem(key(kind))
    : await SecureStore.getItemAsync(key(kind));
  return value ? JSON.parse(value) : null;
}

export async function saveGiftCheckout(kind, checkout) {
  const value = JSON.stringify(checkout);
  if (Platform.OS === 'web') globalThis.localStorage.setItem(key(kind), value);
  else await SecureStore.setItemAsync(key(kind), value);
}

export async function clearGiftCheckout(kind) {
  if (Platform.OS === 'web') globalThis.localStorage.removeItem(key(kind));
  else await SecureStore.deleteItemAsync(key(kind));
}
