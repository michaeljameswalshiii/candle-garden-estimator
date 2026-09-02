import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { products } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Shop Soy Candles",
  description: "Shop hand-poured, small-batch soy candles from The Candle Garden.",
};

export default function ShopPage() {
  return (
    <>
      <section className="page-hero lavender-hero">
        <div className="page-shell narrow">
          <p className="eyebrow">Find your scent</p>
          <h1>Small-batch candles,<br /><em>big main-character energy.</em></h1>
          <p>Clean-burning soy wax, thoughtfully layered scents, and a little bit of joy in every jar.</p>
        </div>
      </section>
      <section className="page-shell section-pad">
        <div className="shop-toolbar">
          <p>{products.length} candles</p>
          <p>Free shipping over $50</p>
        </div>
        <div className="product-grid shop-grid">
          {products.map((product) => <ProductCard product={product} key={product.id} />)}
        </div>
      </section>
    </>
  );
}
