import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, bootstrapShop } from "./lib/api.js";
import { cartLines, cover } from "./lib/catalog.js";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);

  const lines = useMemo(() => cartLines(products, cart), [products, cart]);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);

  function showToast(text) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  }

  function applyShop(data) {
    if (data && Array.isArray(data.products)) setProducts(data.products);
    if (data && Array.isArray(data.cart)) setCart(data.cart);
  }

  useEffect(() => {
    let stop = false;
    bootstrapShop()
      .then((data) => {
        if (stop) return;
        applyShop(data);
        setReady(true);
      })
      .catch(() => {
        if (stop) return;
        showToast("База магазина недоступна");
        setReady(true);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    let stop = false;
    async function pull() {
      try {
        const [productData, cartData] = await Promise.all([api("/api/products"), api("/api/cart")]);
        if (stop) return;
        applyShop({ products: productData.products, cart: cartData.cart });
      } catch {
        /* следующий опрос повторит чтение */
      }
    }
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [ready]);

  async function addToCart(productId) {
    try {
      const data = await api("/api/cart/add", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      applyShop(data);
      const item = (data.products || products).find((entry) => entry.id === productId);
      showToast(data.added && item ? `${item.name} в корзине` : "Больше этой позиции нет в наличии");
      return Boolean(data.added);
    } catch {
      showToast("Не удалось обновить корзину");
      return false;
    }
  }

  async function changeQty(productId, qty) {
    try {
      applyShop(
        await api("/api/cart/qty", {
          method: "POST",
          body: JSON.stringify({ productId, qty }),
        })
      );
    } catch {
      showToast("Не удалось обновить корзину");
    }
  }

  async function saveProduct(next) {
    const photo = next.photo || cover("#3a3a3a", "#161616", "Фото");
    try {
      const data = await api("/api/products", {
        method: "POST",
        body: JSON.stringify({ ...next, photo }),
      });
      applyShop(data);
    } catch (error) {
      showToast("Не удалось сохранить товар");
      throw error;
    }
  }

  async function deleteProduct(id) {
    applyShop(await api(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" }));
  }

  const value = {
    products,
    lines,
    count,
    toast,
    ready,
    addToCart,
    changeQty,
    saveProduct,
    deleteProduct,
    applyShop,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("shop");
  return value;
}
