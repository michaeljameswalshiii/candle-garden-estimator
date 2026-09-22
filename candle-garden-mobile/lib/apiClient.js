/**
 * API helpers — attach Cognito JWT when the user is signed in.
 * Orders API requires ID token. Detect uses optional access token for verified attribution.
 */
import { API_BASE } from './cognitoConfig';
import * as SecureStore from 'expo-secure-store';

let idTokenGetter = async () => null;
let accessTokenGetter = async () => null;
let sessionInvalidator = async () => {};

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

export function setSessionInvalidator(fn) {
  sessionInvalidator = fn || (async () => {});
}

export function isExpiredTokenError(err) {
  const raw = `${err?.message || ''} ${err?.data?.message || ''} ${err?.data?.Message || ''}`.toLowerCase();
  return (
    err?.status === 401
    || raw.includes('incoming token has expired')
    || raw.includes('token has expired')
    || raw.includes('expired token')
    || raw.includes('unauthorized')
  );
}

export function friendlyAuthError(err, { signedIn = false } = {}) {
  if (isExpiredTokenError(err)) {
    return signedIn
      ? 'Your session expired. Sign in again on the Profile tab to see order history.'
      : null;
  }
  return err?.message || 'Could not load orders';
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

function friendlyNetworkError(err) {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('hostname could not be found')
    || lower.includes('could not be found')
    || lower.includes('failed to connect')
    || lower.includes('network request failed')
    || lower.includes('internet connection')
    || lower.includes('namelookup')
    || lower.includes('getaddrinfo')
  ) {
    return 'Cannot reach the estimate server. Check Wi-Fi or cellular, then try again — or enter ounces manually.';
  }
  return raw || 'Network error';
}

async function parseResponse(res) {
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

export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    requireAuth = false,
    headers: extraHeaders,
    preferAccessToken = false,
    _retriedAuth = false,
  } = options;
  const headers = await authHeaders(extraHeaders, { preferAccessToken });

  if (requireAuth && !headers.Authorization) {
    const err = new Error('Please sign in to continue');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    const err = new Error(friendlyNetworkError(netErr));
    err.code = 'NETWORK';
    err.cause = netErr;
    throw err;
  }

  try {
    return await parseResponse(res);
  } catch (err) {
    if (!_retriedAuth && headers.Authorization && isExpiredTokenError(err)) {
      await sessionInvalidator();
      return apiFetch(path, { ...options, _retriedAuth: true });
    }
    throw err;
  }
}

export async function postDetect(payload) {
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

export async function createStripePaymentSheet(items, contact = {}) {
  const body = { items };
  if (contact.email) body.email = String(contact.email).trim();
  if (contact.name) body.name = String(contact.name).trim();
  if (contact.zip) body.destZip = String(contact.zip).replace(/\D/g, '').slice(0, 5);
  if (contact.shipping) body.shipping = contact.shipping;
  return apiFetch('/payments/payment-sheet', {
    method: 'POST',
    body,
    requireAuth: false,
  });
}

export async function finalizeStripePayment(paymentIntentId) {
  return apiFetch('/payments/finalize', {
    method: 'POST',
    body: { paymentIntentId },
    requireAuth: false,
  });
}

export async function trackEvent(name, properties = {}) {
  try {
    return await apiFetch('/events', { method: 'POST', body: { name, ...properties } });
  } catch {
    return null;
  }
}

export async function postShippingQuote(payload) {
  return apiFetch('/payments/shipping-quote', {
    method: 'POST',
    body: payload,
    requireAuth: false,
  });
}

export async function createRefillLabels(payload) {
  return apiFetch('/payments/refill-labels', {
    method: 'POST',
    body: payload,
    requireAuth: false,
  });
}

export async function getOrder(id) {
  return apiFetch(`/orders/${id}`, { method: 'GET', requireAuth: true });
}

export async function purgeAccountData() {
  return apiFetch('/account/purge', { method: 'POST', body: {}, requireAuth: true });
}

export async function registerPushToken(token, platform = 'unknown') {
  return apiFetch('/account/push-token', {
    method: 'POST',
    body: { token, platform },
    requireAuth: true,
  });
}

export async function unregisterPushToken(token) {
  return apiFetch('/account/push-token', {
    method: 'DELETE',
    body: token ? { token } : {},
    requireAuth: true,
  });
}

export { API_BASE };
