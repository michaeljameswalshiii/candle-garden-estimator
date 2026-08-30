import Image from "next/image";
import { priceLabel, scentNotes, type Product } from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <a href={product.url} aria-label={`View ${product.name}`}>
        <div className="product-image-wrap">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 720px) 90vw, (max-width: 1100px) 45vw, 24vw"
            className="product-image"
          />
          {product.soldOut ? <span className="product-badge">Sold out</span> : null}
        </div>
        <div className="product-copy">
          <div className="product-heading">
            <h3>{product.name}</h3>
            <span>{priceLabel(product)}</span>
          </div>
          <p>{scentNotes(product)}</p>
          <span className="text-link">View candle <span aria-hidden="true">→</span></span>
        </div>
      </a>
    </article>
  );
}
