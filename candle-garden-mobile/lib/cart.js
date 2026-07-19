/**
 * Simple in-memory cart for the mobile app.
 * Checkout completes on thecandlegarden.co (or later native payments).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CartContext = createContext(null);

function lineKey(item) {
  return `${item.productId}::${item.size || 'default'}`;
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]);

  const addItem = useCallback((product, options = {}) => {
    const size =
      options.size ||
      (Array.isArray(product.sizes) && product.sizes.length ? product.sizes[0] : null);
    const qty = Math.max(1, Number(options.quantity) || 1);
    const unitPrice = Number(product.price) || 0;
    const entry = {
      key: null,
      productId: product.id,
      name: product.name,
      size,
      unitPrice,
      quantity: qty,
      image: product.image,
      url: product.url,
    };
    entry.key = lineKey(entry);

    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === entry.key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + qty,
        };
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const removeItem = useCallback((key) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const setQuantity = useCallback((key, quantity) => {
    const q = Math.max(0, Number(quantity) || 0);
    setLines((prev) => {
      if (q <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity: q } : l));
    });
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const itemCount = useMemo(
    () => lines.reduce((n, l) => n + l.quantity, 0),
    [lines]
  );

  const subtotal = useMemo(
    () => lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0),
    [lines]
  );

  const value = useMemo(
    () => ({
      lines,
      itemCount,
      subtotal,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
    }),
    [lines, itemCount, subtotal, addItem, removeItem, setQuantity, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
}

export default CartContext;
