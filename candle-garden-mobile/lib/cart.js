/**
 * Cart for The Candle Garden App — persisted in SecureStore.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

const CartContext = createContext(null);
const CART_KEY = 'cg_cart_v1';

function lineKey(item) {
  return `${item.productId}::${item.size || 'default'}`;
}

async function loadPersistedLines() {
  try {
    const raw = await SecureStore.getItemAsync(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistLines(lines) {
  try {
    if (!lines.length) {
      await SecureStore.deleteItemAsync(CART_KEY);
      return;
    }
    await SecureStore.setItemAsync(CART_KEY, JSON.stringify(lines));
  } catch (e) {
    console.warn('Cart persist failed', e?.message);
  }
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]);
  const [ready, setReady] = useState(false);
  const skipFirstPersist = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadPersistedLines();
      if (!cancelled) {
        setLines(stored);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      // still persist if we have lines from restore path that mutates
    }
    persistLines(lines);
  }, [lines, ready]);

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
      ready,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
    }),
    [lines, itemCount, subtotal, ready, addItem, removeItem, setQuantity, clearCart]
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
