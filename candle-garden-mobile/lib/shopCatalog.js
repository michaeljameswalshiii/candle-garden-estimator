/**
 * Shop catalog mirrored from https://www.thecandlegarden.co/shop
 * Categories match site collections: Spring, Classic, Subscriptions.
 * Data snapshot embedded for reliable Expo Go display; "View on site" opens live product.
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
export const CATALOG_API_URL = 'https://candle-garden-web.vercel.app/api/mobile/catalog';

/** @type {Array<{id:string,name:string,price:number,priceMax:number,soldOut:boolean,description:string,image:string,url:string,sizes:string[],categories:string[]}>} */
export const products = Array.isArray(catalog) ? catalog : [];

export async function fetchLatestProducts() {
  const response = await fetch(CATALOG_API_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Product catalog request failed (${response.status})`);
  const payload = await response.json();
  if (!Array.isArray(payload?.products)) throw new Error('The live product catalog is invalid');
  return { products: payload.products, refreshedAt: payload.refreshedAt || null };
}

export function filterProducts(categoryId, sourceProducts = products) {
  if (!categoryId || categoryId === 'all') return sourceProducts;
  return sourceProducts.filter(
    (p) => Array.isArray(p.categories) && p.categories.includes(categoryId)
  );
}

export function formatPrice(product) {
  if (product == null || product.price == null || Number.isNaN(Number(product.price))) {
    return '';
  }
  const min = Number(product.price);
  const max = product.priceMax != null ? Number(product.priceMax) : min;
  if (max > min) {
    return `from $${min.toFixed(2)}`;
  }
  return `$${min.toFixed(2)}`;
}

export default products;
