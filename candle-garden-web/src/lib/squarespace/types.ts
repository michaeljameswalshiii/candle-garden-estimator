export type CatalogVariant = {
  id: string;
  sku: string;
  size: string | null;
  price: number;
  onSale: boolean;
  soldOut: boolean;
  unlimited: boolean;
  quantity: number | null;
  weight?: number | null;
  width?: number | null;
  height?: number | null;
  length?: number | null;
  attributes?: Record<string, string>;
  subscription?: {
    subscribable?: boolean;
    optionId?: string | null;
    planVersionId?: string | null;
    intervalValue?: number;
    intervalUnit?: string;
    billingCycles?: number | null;
  } | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  sku?: string;
  price: number;
  priceMax: number;
  soldOut: boolean;
  description: string;
  image: string;
  images?: string[];
  url: string;
  urlId?: string;
  sizes: string[];
  categories: string[];
  tags?: string[];
  type?: string;
  isSubscribable?: boolean;
  subscription?: CatalogVariant["subscription"];
  variants?: CatalogVariant[];
  updatedOn?: string | null;
};
