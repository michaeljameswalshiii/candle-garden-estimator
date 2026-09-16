/**
 * Shop catalog mirrored from https://www.thecandlegarden.co/shop
 * Live data: product/variant IDs, SKUs, prices, sizes, categories, images,
 * sold-out flags, and subscription plans. Bundled snapshot is the offline fallback.
 */
import catalog from '../../packages/catalog/products.json';

export const SHOP_CATEGORIES = [
  { id: 'all', label: 'All', sitePath: '/shop' },
  { id: 'fall', label: 'Fall', sitePath: '/shop/fall' },
  { id: 'summer', label: 'Summer', sitePath: '/shop/summer' },
  { id: 'classic', label: 'Classic', sitePath: '/shop/classic' },
  { id: 'subscription', label: 'Subscriptions', sitePath: '/shop/subscription-boxes' },
  { id: 'gift-card', label: 'Gift cards', sitePath: '/giftcard' },
];

export const SHOP_BASE = 'https://www.thecandlegarden.co';
export const CATALOG_URL = 'https://candle-garden-web.vercel.app/api/mobile/catalog';
export const COMMERCE_URL = 'https://candle-garden-web.vercel.app/api/mobile/commerce';

/** @type {Array<Record<string, unknown>>} */
export const products = Array.isArray(catalog) ? catalog : [];

export async function fetchLatestProducts() {
  const response = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
  const payload = await response.json();
  if (!Array.isArray(payload?.products) || payload.products.length === 0) {
    throw new Error('The live catalog is empty');
  }
  return {
    products: payload.products,
    categories: Array.isArray(payload.categories) ? payload.categories : SHOP_CATEGORIES,
    refreshedAt: payload.refreshedAt || null,
  };
}

export function filterProducts(categoryId, sourceProducts = products) {
  if (!categoryId || categoryId === 'all') return sourceProducts;
  return sourceProducts.filter(
    (p) => Array.isArray(p.categories) && p.categories.includes(categoryId)
  );
}

export function variantForSize(product, size) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;
  if (size) {
    const match = variants.find((variant) => variant.size === size);
    if (match) return match;
  }
  return variants.find((variant) => !variant.soldOut) || variants[0];
}

export function formatPrice(product) {
  if (product == null || product.price == null || Number.isNaN(Number(product.price))) {
    return '';
  }
  const min = Number(product.price);
  const max = product.priceMax != null ? Number(product.priceMax) : min;
  if (product.isSubscribable && product.subscription?.intervalUnit) {
    const unit = String(product.subscription.intervalUnit).toLowerCase();
    const cycles = product.subscription.billingCycles;
    const cadence = unit.startsWith('month') ? 'month' : unit;
    return cycles
      ? `$${min.toFixed(2)} / ${cadence} for ${cycles}`
      : `$${min.toFixed(2)} / ${cadence}`;
  }
  if (max > min) {
    return `from $${min.toFixed(2)}`;
  }
  return `$${min.toFixed(2)}`;
}

export default products;
