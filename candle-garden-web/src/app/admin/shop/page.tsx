import { priceLabel, products, scentNotes } from "@/lib/catalog";

export default function AdminShopPage() {
  const soldOut = products.filter((item) => item.soldOut).length;
  return (
    <>
      <p className="eyebrow">Shop</p>
      <h1>Candle catalog</h1>
      <p className="admin-lede">
        {products.length} candles on the Vercel storefront · {soldOut} sold out.
        Product pages still open on Squarespace.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Candle</th>
              <th>Price</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                </td>
                <td>{priceLabel(product)}</td>
                <td>{product.soldOut ? "Sold out" : "In stock"}</td>
                <td>{scentNotes(product)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
