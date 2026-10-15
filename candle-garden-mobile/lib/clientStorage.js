import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// iOS/Android keep using the keychain. Web sessions have no native SecureStore.
export async function getItemAsync(key) {
  return Platform.OS === 'web' ? globalThis.sessionStorage.getItem(key) : SecureStore.getItemAsync(key);
}
export async function setItemAsync(key, value) {
  if (Platform.OS === 'web') globalThis.sessionStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}
export async function deleteItemAsync(key) {
  if (Platform.OS === 'web') globalThis.sessionStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
