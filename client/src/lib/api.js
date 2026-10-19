const SESSION_KEY = "ivan-shop-session";
const DATA_KEYS = ["ivan-shop-products", "ivan-shop-cart", "ivan-shop-orders", "ivan-shop-clients", "ivan-shop-order-tombstones"];

export function sessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id || "")) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function browserPayload() {
  const body = {};
  const products = readArray("ivan-shop-products");
  const cart = readArray("ivan-shop-cart");
  const orders = readArray("ivan-shop-orders");
  const tombstones = readArray("ivan-shop-order-tombstones");
  if (products) body.products = products;
  if (cart) body.cart = cart;
  if (orders) body.orders = orders;
  if (tombstones) body.tombstones = tombstones;
  return body;
}

export function clearBrowserData() {
  DATA_KEYS.forEach((key) => localStorage.removeItem(key));
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Shop-Session": sessionId(),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || String(response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

let boot;

export function bootstrapShop() {
  if (!boot) {
    boot = (async () => {
      const data = await api("/api/migrate", {
        method: "POST",
        body: JSON.stringify(browserPayload()),
      });
      clearBrowserData();
      return data;
    })();
  }
  return boot;
}
