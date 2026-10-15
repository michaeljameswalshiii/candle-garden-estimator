// Profile addresses may be Cognito JSON or the mailing-address text entered in Profile.
export function profileShipping(user = {}) {
  let raw = user.address || '';
  try { raw = JSON.parse(raw); } catch { /* free-form profile address */ }
  if (raw && typeof raw === 'object') {
    if (raw.formatted) raw = raw.formatted;
    else return { name: user.name || '', email: user.email || '', phone: user.phone || '',
      address: raw.street_address || raw.address || '', city: raw.locality || raw.city || '',
      state: raw.region || raw.state || '', zip: raw.postal_code || raw.zip || '' };
  }
  const match = String(raw).trim().match(/^(.+?)[,\n]+\s*([^,\n]+?),?\s+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?(?:\s*,?\s*(?:US|USA))?$/i);
  return { name: user.name || '', email: user.email || '', phone: user.phone || '',
    address: match?.[1]?.trim() || '', city: match?.[2]?.trim() || '',
    state: match?.[3]?.toUpperCase() || '', zip: match?.[4] || '' };
}

export function previousShipping(orders = []) {
  return [...orders].filter(order => order.shipping?.address && order.shipping?.zip
    && !['payment_pending', 'payment_verification_pending', 'cancelled'].includes(order.status))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]?.shipping;
}

export function displayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return String(value || '').trim();
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

// Signed-in checkout keeps the profile email and phone. A saved cart or older order must not replace them.
export function applyProfileContact(current = {}, user = {}) {
  const profile = profileShipping(user);
  return {
    ...current,
    name: current.name || profile.name || '',
    email: profile.email || current.email || '',
    phone: profile.phone || current.phone || '',
  };
}

export function fillEmptyShipping(current, ...sources) {
  const result = { ...current };
  for (const source of sources) {
    for (const key of ['name', 'email', 'phone']) {
      if (!result[key] && source?.[key]) result[key] = String(source[key]);
    }
  }
  // Keep each address together: never combine one street with another order's ZIP.
  const keys = ['address', 'city', 'state', 'zip'];
  if (!keys.some(key => result[key])) {
    const address = sources.find(source => keys.every(key => source?.[key]));
    if (address) for (const key of keys) result[key] = String(address[key]);
  }
  return result;
}
