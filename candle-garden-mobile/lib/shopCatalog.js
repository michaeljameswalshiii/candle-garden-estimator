/**
 * Shop catalog mirrored from https://www.thecandlegarden.co/shop
 * Categories match site collections: Spring, Classic, Subscriptions.
 * Data snapshot embedded for reliable Expo Go display; "View on site" opens live product.
 */
import catalog from '../../packages/catalog/products.json';
import { fetchJson } from './liveFeed';

export const SHOP_CATEGORIES = [
  { id: 'all', label: 'All', sitePath: '/shop' },
  { id: 'fall', label: 'Fall', sitePath: '/shop/fall' },
  { id: 'summer', label: 'Summer', sitePath: '/shop/summer' },
  { id: 'classic', label: 'Classic', sitePath: '/shop/classic' },
  { id: 'subscription', label: 'Subscriptions', sitePath: '/shop/subscription-boxes' },
];

export const SHOP_BASE = 'https://www.thecandlegarden.co';
export const CATALOG_API_URL = 'https://candle-garden-web.vercel.app/api/mobile/catalog';

/** @type {Array<{id:string,name:string,price:number,priceMax:number,soldOut:boolean,description:string,image:string,url:string,sizes:string[],categories:string[]}>} */
export function isGiftCard(product) {
  return /gift[\s_-]*card/i.test(String(product?.type || ''))
    || /gift[\s_-]*card/i.test(String(product?.name || ''))
    || /gift[\s_-]*card/i.test(String(product?.url || ''))
    || (Array.isArray(product?.categories) && product.categories.some(category => /gift[\s_-]*card/i.test(String(category))));
}

export const products = Array.isArray(catalog) ? catalog.filter(product => !isGiftCard(product)) : [];

export async function fetchLatestProducts() {
  const payload = await fetchJson(CATALOG_API_URL);
  if (!Array.isArray(payload?.products)) throw new Error('The live product catalog is invalid');
  return { products: payload.products.filter(product => !isGiftCard(product)), refreshedAt: payload.refreshedAt || null };
}

export function filterProducts(categoryId, sourceProducts = products) {
  const available = sourceProducts.filter(product => !isGiftCard(product));
  if (!categoryId || categoryId === 'all') return available;
  return available.filter(
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
