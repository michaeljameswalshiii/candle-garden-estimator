import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'cg_access_token',
  idToken: 'cg_id_token',
  refreshToken: 'cg_refresh_token',
  expiresAt: 'cg_expires_at',
  profile: 'cg_profile_json',
};

const SKEW_MS = 90_000;

function jwtExpMs(token) {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) return 0;
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = JSON.parse(globalThis.atob(padded + pad));
    return json.exp ? Number(json.exp) * 1000 : 0;
  } catch {
    return 0;
  }
}

async function setItem(key, value) {
  if (value == null || value === '') {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, String(value));
}

export async function saveTokens({ accessToken, idToken, refreshToken, expiresIn }) {
  const fromTtl = Date.now() + (Number(expiresIn) || 3600) * 1000;
  const fromJwt = Math.min(
    jwtExpMs(idToken) || fromTtl,
    jwtExpMs(accessToken) || fromTtl
  );
  const expiresAt = Math.min(fromTtl, fromJwt) - SKEW_MS;
  await setItem(KEYS.accessToken, accessToken);
  await setItem(KEYS.idToken, idToken);
  if (refreshToken) await setItem(KEYS.refreshToken, refreshToken);
  await setItem(KEYS.expiresAt, String(expiresAt));
}

export async function loadTokens() {
  const [accessToken, idToken, refreshToken, expiresAtRaw] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.idToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.expiresAt),
  ]);
  if (!accessToken && !refreshToken) return null;
  const stored = expiresAtRaw ? Number(expiresAtRaw) : 0;
  const jwtExp = Math.min(
    jwtExpMs(idToken) || Number.POSITIVE_INFINITY,
    jwtExpMs(accessToken) || Number.POSITIVE_INFINITY
  );
  let expiresAt = stored;
  if (jwtExp !== Number.POSITIVE_INFINITY) {
    expiresAt = Math.min(stored || jwtExp, jwtExp - SKEW_MS);
  }
  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt,
  };
}

export function isSessionExpired(session) {
  if (!session) return true;
  if (!session.accessToken && !session.idToken) return true;
  if (session.expiresAt && Date.now() > session.expiresAt) return true;
  const jwtExp = Math.min(
    jwtExpMs(session.idToken) || Number.POSITIVE_INFINITY,
    jwtExpMs(session.accessToken) || Number.POSITIVE_INFINITY
  );
  if (jwtExp !== Number.POSITIVE_INFINITY && Date.now() > jwtExp - SKEW_MS) return true;
  return false;
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
