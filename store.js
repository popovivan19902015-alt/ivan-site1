const SHOP_PHONE = "77774222256";
const SESSION_KEY = "ivan-shop-session";
const DATA_KEYS = ["ivan-shop-products", "ivan-shop-cart", "ivan-shop-orders", "ivan-shop-clients", "ivan-shop-order-tombstones"];

function cover(a, b, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><defs><radialGradient id="g" cx="50%" cy="35%" r="70%"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="640" height="420" fill="url(#g)"/><text x="36" y="380" fill="rgba(255,255,255,.9)" font-size="32" font-family="Georgia,serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

let productsMemory = [];
let cartMemory = [];
let ordersMemory = [];
let clientsMemory = [];
let ordersStamp = "";
let writeChain = Promise.resolve();

function shopSession() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id || "")) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function shopApi(path, options = {}) {
  return fetch(path, {
    method: options.method || "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Shop-Session": shopSession(),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || String(response.status));
    return data;
  });
}

function enqueue(task) {
  writeChain = writeChain.then(() => shopReady.then(task), () => shopReady.then(task));
  return writeChain;
}

function readLocalArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function browserPayload() {
  const body = {};
  const products = readLocalArray("ivan-shop-products");
  const cart = readLocalArray("ivan-shop-cart");
  const orders = readLocalArray("ivan-shop-orders");
  const tombstones = readLocalArray("ivan-shop-order-tombstones");
  if (products) body.products = products;
  if (cart) body.cart = cart;
  if (orders) body.orders = orders;
  if (tombstones) body.tombstones = tombstones;
  return body;
}

function applySnapshot(data) {
  if (!data) return;
  if (Array.isArray(data.products)) productsMemory = data.products;
  if (Array.isArray(data.cart)) cartMemory = data.cart;
  if (Array.isArray(data.orders)) {
    ordersMemory = data.orders;
    ordersStamp = JSON.stringify(ordersMemory);
  }
  if (Array.isArray(data.clients)) clientsMemory = data.clients;
}

function hydrateStore() {
  return shopApi("/api/migrate", { method: "POST", body: browserPayload() })
    .then((data) => {
      applySnapshot(data);
      DATA_KEYS.forEach((key) => localStorage.removeItem(key));
    })
    .catch(() => {
      productsMemory = [];
      cartMemory = [];
    });
}

const shopReady = hydrateStore();

function getProducts() {
  return productsMemory;
}

function saveProducts(list) {
  productsMemory = Array.isArray(list) ? list.slice() : [];
  return enqueue(() =>
    shopApi("/api/products", { method: "PUT", body: { products: productsMemory } }).then((data) => {
      if (Array.isArray(data.products)) productsMemory = data.products;
    })
  );
}

function getCart() {
  return cartMemory.map((entry) => ({ id: entry.id, qty: entry.qty }));
}

function saveCart(list) {
  cartMemory = Array.isArray(list) ? list.map((entry) => ({ id: entry.id, qty: entry.qty })) : [];
  return enqueue(() =>
    shopApi("/api/cart", { method: "PUT", body: { items: cartMemory } }).then((data) => {
      applySnapshot(data);
    })
  );
}

function cartLines() {
  return getCart()
    .map((line) => {
      const product = getProducts().find((item) => item.id === line.id);
      if (!product) return null;
      const qty = Math.min(Number(line.qty) || 0, Number(product.qty) || 0);
      if (qty < 1) return null;
      return Object.assign({}, product, { qty });
    })
    .filter(Boolean);
}

function cartCount() {
  return cartLines().reduce((sum, line) => sum + line.qty, 0);
}

function addToCart(productId) {
  const product = getProducts().find((item) => item.id === productId);
  if (!product || Number(product.qty) < 1) return getCart();
  const cart = getCart();
  const line = cart.find((entry) => entry.id === productId);
  const nextQty = (line ? Number(line.qty) || 0 : 0) + 1;
  if (nextQty > Number(product.qty)) return cart;
  if (line) line.qty = nextQty;
  else cart.push({ id: productId, qty: 1 });
  saveCart(cart);
  return cart;
}

function setCartQty(productId, qty) {
  const product = getProducts().find((item) => item.id === productId);
  const max = product ? Number(product.qty) || 0 : 0;
  const next = Math.max(0, Math.min(max, Number(qty) || 0));
  const cart = getCart().filter((entry) => entry.id !== productId);
  if (next > 0) cart.push({ id: productId, qty: next });
  saveCart(cart);
  return cart;
}

function clearCart() {
  saveCart([]);
}

function formatPrice(price, currency) {
  const n = Number(price) || 0;
  if (currency === "USD") {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const formatted = Math.round(n).toLocaleString("ru-RU");
  return currency === "RUB" ? `${formatted} ₽` : `${formatted} ₸`;
}

function typeLabel(type) {
  return type === "service" ? "Услуга" : "Товар";
}

const ORDER_STATUSES = [
  { id: "new", label: "Новый" },
  { id: "progress", label: "В работе" },
  { id: "done", label: "Выполнен" },
  { id: "cancelled", label: "Отменён" },
];

function getOrders() {
  return ordersMemory.slice();
}

function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

function getClients() {
  return clientsMemory.slice();
}

function uniqueClients(clients) {
  const seen = new Set();
  return clients.filter((client) => {
    const key = phoneKey(client.phone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function syncClientsFromOrders() {
  return getClients();
}

async function refreshOrders() {
  const [orderData, clientData] = await Promise.all([shopApi("/api/orders"), shopApi("/api/clients")]);
  const orders = orderData && Array.isArray(orderData.orders) ? orderData.orders : [];
  const clients = clientData && Array.isArray(clientData.clients) ? clientData.clients : [];
  const stamp = JSON.stringify(orders);
  const same = stamp === ordersStamp && JSON.stringify(clients) === JSON.stringify(clientsMemory);
  ordersMemory = orders;
  ordersStamp = stamp;
  clientsMemory = clients;
  return !same;
}

async function addOrder(order) {
  const data = await shopApi("/api/orders", { method: "POST", body: order });
  applySnapshot(data);
  if (!Array.isArray(data.orders) && data.order) {
    ordersMemory = [data.order, ...getOrders().filter((entry) => entry.id !== data.order.id)];
    ordersStamp = JSON.stringify(ordersMemory);
  }
  return data.order;
}

async function updateOrder(id, patch) {
  const data = await shopApi("/api/orders/update", { method: "POST", body: { id, status: patch.status } });
  const list = getOrders();
  const index = list.findIndex((order) => order.id === id);
  if (index >= 0 && data.order) list[index] = data.order;
  ordersMemory = list;
  ordersStamp = JSON.stringify(ordersMemory);
  if (Array.isArray(data.clients)) clientsMemory = data.clients;
  return data.order || null;
}

async function removeOrder(id) {
  const data = await shopApi("/api/orders/delete", { method: "POST", body: { id } });
  if (Array.isArray(data.orders)) {
    ordersMemory = data.orders;
    ordersStamp = JSON.stringify(ordersMemory);
  } else {
    ordersMemory = getOrders().filter((order) => order.id !== id);
    ordersStamp = JSON.stringify(ordersMemory);
  }
  if (Array.isArray(data.clients)) clientsMemory = data.clients;
}

function orderText(item, customer) {
  const lines = ["Здравствуйте! Хочу оформить заказ:"];
  const rows = item.items && item.items.length ? item.items : [item];
  rows.forEach((entry) => {
    const name = entry.name || entry.productName;
    const qty = Number(entry.qty) > 1 ? ` × ${entry.qty}` : "";
    lines.push(`• ${name}${qty} — ${formatPrice(entry.price, entry.currency)} (${typeLabel(entry.type)})`);
  });
  if (customer) lines.push(`Имя: ${customer.name}`, `Телефон: ${customer.phone}`);
  return lines.join("\n");
}

function whatsappUrl(item, customer) {
  return `https://wa.me/${SHOP_PHONE}?text=${encodeURIComponent(orderText(item, customer))}`;
}

function telegramUrl(item, customer) {
  return `https://t.me/+${SHOP_PHONE}?text=${encodeURIComponent(orderText(item, customer))}`;
}

function channelLabel(channel) {
  return channel === "telegram" ? "Telegram" : "WhatsApp";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
