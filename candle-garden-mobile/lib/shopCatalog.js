/**
 * Shop catalog mirrored from https://www.thecandlegarden.co/shop
 * Categories match site collections: Spring, Classic, Subscriptions.
 * Data snapshot embedded for reliable Expo Go display; "View on site" opens live product.
 */
import catalog from './shopCatalog.json';

export const SHOP_CATEGORIES = [
  { id: 'all', label: 'All', sitePath: '/shop' },
  { id: 'spring', label: 'Spring', sitePath: '/shop/spring' },
  { id: 'classic', label: 'Classic', sitePath: '/shop/classic' },
  { id: 'subscription', label: 'Subscriptions', sitePath: '/shop/subscription-boxes' },
];

export const SHOP_BASE = 'https://www.thecandlegarden.co';

/** @type {Array<{id:string,name:string,price:number,priceMax:number,soldOut:boolean,description:string,image:string,url:string,sizes:string[],categories:string[]}>} */
export const products = Array.isArray(catalog) ? catalog : [];

export function filterProducts(categoryId) {
  if (!categoryId || categoryId === 'all') return products;
  return products.filter(
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
