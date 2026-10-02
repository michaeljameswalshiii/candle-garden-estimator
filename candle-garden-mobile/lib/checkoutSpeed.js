export async function createStripePaymentSheet(items, contact = {}) {
  const normalized = (Array.isArray(items) ? items : []).map((item) => {
    if (!item || item.speed) return item;
    const size = String(item.size || '').toLowerCase();
    if (size === 'expedited' || size.startsWith('expedited')) return { ...item, speed: 'expedited' };
    if (size === 'standard' || size.startsWith('standard')) return { ...item, speed: 'standard' };
    return item;
  });
  const body = { items: normalized };
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
