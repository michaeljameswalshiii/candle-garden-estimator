/**
 * API helpers — attach Cognito JWT when the user is signed in.
 * Orders API requires JWT. Detect accepts optional JWT (guest allowed).
 */
import { API_BASE } from './cognitoConfig';

let tokenGetter = async () => null;

/** Call once from AuthProvider wiring / App */
export function setAuthTokenGetter(fn) {
  tokenGetter = fn || (async () => null);
}

export async function authHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  try {
    const token = await tokenGetter();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* guest */
  }
  return headers;
}

export async function apiFetch(path, options = {}) {
  const { method = 'GET', body, requireAuth = false, headers: extraHeaders } = options;
  const headers = await authHeaders(extraHeaders);

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
  // Guest allowed; JWT attached when signed in
  return apiFetch('/detect', { method: 'POST', body: payload, requireAuth: false });
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

export { API_BASE };
