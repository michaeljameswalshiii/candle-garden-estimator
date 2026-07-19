/**
 * API helpers — attach Cognito JWT when the user is signed in.
 * Orders API requires ID token. Detect uses optional access token for verified attribution.
 */
import { API_BASE } from './cognitoConfig';
import * as SecureStore from 'expo-secure-store';

let idTokenGetter = async () => null;
let accessTokenGetter = async () => null;

const DEVICE_ID_KEY = 'cg_device_id_v1';

async function getOrCreateDeviceId() {
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (id && id.length >= 8) return id;
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `tmp_${Date.now()}`;
  }
}

/** Call once from AuthProvider wiring / App */
export function setAuthTokenGetter(fn) {
  idTokenGetter = fn || (async () => null);
}

export function setAccessTokenGetter(fn) {
  accessTokenGetter = fn || (async () => null);
}

export async function authHeaders(extra = {}, { preferAccessToken = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  try {
    const deviceId = await getOrCreateDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;

    if (preferAccessToken) {
      const access = await accessTokenGetter();
      if (access) {
        // Access token for Cognito GetUser verification on /detect
        headers.Authorization = `Bearer ${access}`;
        headers['X-Cognito-Token-Use'] = 'access';
      }
      const id = await idTokenGetter();
      if (id) headers['X-Id-Token'] = id;
    } else {
      const token = await idTokenGetter();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    /* guest */
  }
  return headers;
}

export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    requireAuth = false,
    headers: extraHeaders,
    preferAccessToken = false,
  } = options;
  const headers = await authHeaders(extraHeaders, { preferAccessToken });

  if (requireAuth && !headers.Authorization) {
    const err = new Error('Please sign in to continue');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      data.message || data.error || data.Message || `Request failed (${res.status})`
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function postDetect(payload) {
  // Guest allowed; access token attached when signed in for verified attribution
  return apiFetch('/detect', {
    method: 'POST',
    body: payload,
    requireAuth: false,
    preferAccessToken: true,
  });
}

export async function listOrders() {
  return apiFetch('/orders', { method: 'GET', requireAuth: true });
}

export async function createOrder(orderBody) {
  return apiFetch('/orders', { method: 'POST', body: orderBody, requireAuth: true });
}

export async function getOrder(id) {
  return apiFetch(`/orders/${id}`, { method: 'GET', requireAuth: true });
}

/** Purge server-side user data (rate limits / order notes) before Cognito delete */
export async function purgeAccountData() {
  return apiFetch('/account/purge', { method: 'POST', body: {}, requireAuth: true });
}

export { API_BASE };
