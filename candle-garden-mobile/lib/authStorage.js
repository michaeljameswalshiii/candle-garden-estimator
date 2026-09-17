import { deleteStoredItem, getStoredItem, setStoredItem } from './storage';

const KEYS = {
  accessToken: 'cg_access_token',
  idToken: 'cg_id_token',
  refreshToken: 'cg_refresh_token',
  expiresAt: 'cg_expires_at',
  profile: 'cg_profile_json',
};

async function setItem(key, value) {
  if (value == null || value === '') {
    await deleteStoredItem(key);
    return;
  }
  await setStoredItem(key, String(value));
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
    getStoredItem(KEYS.accessToken),
    getStoredItem(KEYS.idToken),
    getStoredItem(KEYS.refreshToken),
    getStoredItem(KEYS.expiresAt),
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
  await Promise.all(Object.values(KEYS).map((key) => deleteStoredItem(key)));
}

export async function saveProfile(profile) {
  await setItem(KEYS.profile, JSON.stringify(profile || {}));
}

export async function loadProfile() {
  const raw = await getStoredItem(KEYS.profile);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
