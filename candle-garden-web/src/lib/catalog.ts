import rawClasses from "../../../candle-garden-mobile/lib/classesCatalog.json";
import rawProducts from "../../../candle-garden-mobile/lib/shopCatalog.json";

export type Product = {
  id: string;
  name: string;
  price: number;
  priceMax?: number;
  soldOut: boolean;
  description: string;
  image: string;
  url: string;
  sizes: string[];
  categories: string[];
};

export type CandleClass = {
  id: string;
  title: string;
  scheduleLabel: string;
  date: string;
  dateDisplay: string;
  time: string;
  duration: string;
  price: number;
  available: number;
  soldOut: boolean;
  description: string;
  fullDescription: string;
  image: string;
  sku: string;
  url: string;
  location: string;
};

export const products = rawProducts as Product[];
export const classes = rawClasses as CandleClass[];

export function cleanText(value: string) {
  return value
    .replaceAll("Ã¢â‚¬â€", "—")
    .replaceAll("Ã¢â‚¬Â¦", "…")
    .replaceAll("Ã‚", "")
    .replaceAll("â€¦", "…")
    .replaceAll("â€™", "’");
}

export function priceLabel(product: Product) {
  if (product.priceMax && product.priceMax > product.price) {
    return `$${product.price}–$${product.priceMax}`;
  }
  return `$${product.price}`;
}

export function scentNotes(product: Product) {
  const text = cleanText(product.description);
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  return firstSentence.length > 145 ? `${firstSentence.slice(0, 142)}…` : firstSentence;
}

export function upcomingClasses(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return classes.filter((item) => {
    const date = new Date(`${item.date}T12:00:00`);
    return date >= today;
  });
}

export const featuredProducts = products
  .filter((product) => !product.soldOut)
  .slice(0, 4);
