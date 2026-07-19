import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'cg_access_token',
  idToken: 'cg_id_token',
  refreshToken: 'cg_refresh_token',
  expiresAt: 'cg_expires_at',
  profile: 'cg_profile_json',
};

async function setItem(key, value) {
  if (value == null || value === '') {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, String(value));
}

export async function saveTokens({ accessToken, idToken, refreshToken, expiresIn }) {
  const expiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000 - 60_000;
  await setItem(KEYS.accessToken, accessToken);
  await setItem(KEYS.idToken, idToken);
  if (refreshToken) await setItem(KEYS.refreshToken, refreshToken);
  await setItem(KEYS.expiresAt, String(expiresAt));
}

export async function loadTokens() {
  const [accessToken, idToken, refreshToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.idToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.expiresAt),
  ]);
  if (!accessToken && !refreshToken) return null;
  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt: expiresAt ? Number(expiresAt) : 0,
  };
}

export async function clearTokens() {
  await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
}

export async function saveProfile(profile) {
  await setItem(KEYS.profile, JSON.stringify(profile || {}));
}

export async function loadProfile() {
  const raw = await SecureStore.getItemAsync(KEYS.profile);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
