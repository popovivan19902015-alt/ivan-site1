import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "shop.db");

let db;

function cover(a, b, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><defs><radialGradient id="g" cx="50%" cy="35%" r="70%"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="640" height="420" fill="url(#g)"/><text x="36" y="380" fill="rgba(255,255,255,.9)" font-size="32" font-family="Georgia,serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const SEED_PRODUCTS = [
  ["p1", "Кабель ВВГ 3×2.5", 18500, "KZT", 12, "product", "Медный кабель для щитовой и квартирной разводки.", cover("#3d6b4f", "#142018", "Кабель")],
  ["p2", "Автомат 16A", 42, "USD", 8, "product", "Однополюсный автомат для розеточной группы.", cover("#8a3a2a", "#1a1010", "Автомат")],
  ["p3", "Сборка щита", 45000, "RUB", 3, "service", "Схема, сборка и маркировка щита до 24 модулей.", cover("#2f3d55", "#12151c", "Щит")],
  ["p4", "Светильник LED 36W", 8900, "KZT", 20, "product", "Накладной светильник, нейтральный белый свет.", cover("#c4a574", "#2a2218", "LED")],
  ["p5", "Диагностика сети", 120, "USD", 5, "service", "Замер нагрузки и поиск нагрева по линиям.", cover("#4a5d3a", "#141810", "Замер")],
  ["p6", "Удлинитель 30 м", 7200, "RUB", 6, "product", "Катушка для цеха, с термозащитой.", cover("#5c3d2e", "#1a1410", "Катушка")],
];

function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

function currencyOf(value) {
  return value === "USD" || value === "KZT" || value === "RUB" ? value : "RUB";
}

function typeOf(value) {
  return value === "service" ? "service" : "product";
}

function metaGet(key) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? String(row.value) : "";
}

function metaSet(key, value) {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function withTx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* откат уже сделан */
    }
    throw error;
  }
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    currency: row.currency,
    qty: row.qty,
    type: row.type,
    description: row.description || "",
    photo: row.photo || "",
  };
}

function listProducts() {
  return db.prepare("SELECT * FROM products ORDER BY sort_order ASC, id ASC").all().map(mapProduct);
}

function listCart(sessionId) {
  return db
    .prepare("SELECT product_id AS id, qty FROM cart_items WHERE session_id = ? ORDER BY product_id ASC")
    .all(sessionId);
}

function orderItems(orderId) {
  return db
    .prepare(
      "SELECT product_id, product_name, price, currency, type, qty FROM order_items WHERE order_id = ? ORDER BY line_no ASC"
    )
    .all(orderId)
    .map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      price: row.price,
      currency: row.currency,
      type: row.type,
      qty: row.qty,
    }));
}

function mapOrder(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    channel: row.channel,
    status: row.status,
    productId: row.product_id,
    productName: row.product_name,
    price: row.price,
    currency: row.currency,
    type: row.type,
    items: orderItems(row.id),
  };
}

export function listOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY created_at DESC, id DESC").all().map(mapOrder);
}

export function listClients() {
  return db
    .prepare("SELECT id, name, phone, created_at, updated_at FROM clients ORDER BY updated_at DESC, id DESC")
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function clampCarts() {
  db.exec(`
    UPDATE cart_items
    SET qty = (
      SELECT products.qty FROM products WHERE products.id = cart_items.product_id
    )
    WHERE product_id IN (SELECT id FROM products)
      AND qty > (SELECT products.qty FROM products WHERE products.id = cart_items.product_id)
  `);
  db.exec("DELETE FROM cart_items WHERE qty < 1 OR product_id NOT IN (SELECT id FROM products)");
}

function normalizeLines(rawItems, header) {
  const source = Array.isArray(rawItems) && rawItems.length ? rawItems : header ? [header] : [];
  const lines = [];
  for (const row of source) {
    const productName = String(row.productName || row.name || "").trim();
    if (!productName) continue;
    let qty = Number.parseInt(row.qty, 10);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    const price = Number(row.price);
    lines.push({
      productId: String(row.productId || row.id || ""),
      productName,
      price: Number.isFinite(price) ? price : 0,
      currency: currencyOf(row.currency),
      type: typeOf(row.type),
      qty,
    });
  }
  return lines;
}

function writeOrder(order, lines) {
  db.prepare(
    `INSERT INTO orders (
      id, created_at, customer_name, customer_phone, channel, status,
      product_id, product_name, price, currency, type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.id,
    order.createdAt,
    order.customerName,
    order.customerPhone,
    order.channel,
    order.status,
    order.productId,
    order.productName,
    order.price,
    order.currency,
    order.type
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, price, currency, type, qty, line_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  lines.forEach((line, index) => {
    insertItem.run(order.id, line.productId, line.productName, line.price, line.currency, line.type, line.qty, index);
  });
}

function rememberTombstone(id) {
  if (!/^o\d+$/.test(id)) return;
  db.prepare("INSERT INTO tombstones (id) VALUES (?) ON CONFLICT(id) DO NOTHING").run(id);
}

function isBuried(id) {
  return Boolean(db.prepare("SELECT 1 AS ok FROM tombstones WHERE id = ?").get(id));
}

function rebuildClients() {
  const orders = db.prepare("SELECT customer_name, customer_phone, created_at FROM orders ORDER BY created_at ASC, id ASC").all();
  const byPhone = new Map();
  for (const order of orders) {
    const name = String(order.customer_name || "").trim();
    const phone = String(order.customer_phone || "").trim();
    const key = phoneKey(phone);
    if (!name || key.length < 10) continue;
    const when = order.created_at || new Date().toISOString();
    const existing = byPhone.get(key);
    if (!existing) {
      byPhone.set(key, { id: `c${key}`, name, phone, createdAt: when, updatedAt: when });
      continue;
    }
    existing.name = name;
    existing.phone = phone;
    existing.updatedAt = when;
  }
  db.exec("DELETE FROM clients");
  const insert = db.prepare("INSERT INTO clients (id, name, phone, phone_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const client of byPhone.values()) {
    insert.run(client.id, client.name, client.phone, phoneKey(client.phone), client.createdAt, client.updatedAt);
  }
}

function replaceProducts(list) {
  const products = Array.isArray(list) ? list : [];
  db.exec("DELETE FROM products");
  const insert = db.prepare(
    `INSERT INTO products (id, name, price, currency, qty, type, description, photo, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  products.forEach((item, index) => {
    const name = String(item.name || "").trim();
    const id = String(item.id || "").trim();
    if (!id || !name) return;
    let qty = Number.parseInt(item.qty, 10);
    if (!Number.isFinite(qty) || qty < 0) qty = 0;
    const price = Number(item.price);
    insert.run(
      id,
      name,
      Number.isFinite(price) ? price : 0,
      currencyOf(item.currency),
      qty,
      typeOf(item.type),
      String(item.description || ""),
      String(item.photo || ""),
      index
    );
  });
  clampCarts();
}

function upsertProduct(item) {
  const name = String(item.name || "").trim();
  const id = String(item.id || "").trim();
  if (!id || !name) {
    const error = new Error("invalid");
    error.status = 400;
    throw error;
  }
  let qty = Number.parseInt(item.qty, 10);
  if (!Number.isFinite(qty) || qty < 0) qty = 0;
  const price = Number(item.price);
  const existing = db.prepare("SELECT sort_order FROM products WHERE id = ?").get(id);
  const sort = existing
    ? existing.sort_order
    : Number(db.prepare("SELECT MIN(sort_order) AS value FROM products").get().value ?? 1) - 1;
  db.prepare(
    `INSERT INTO products (id, name, price, currency, qty, type, description, photo, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       price = excluded.price,
       currency = excluded.currency,
       qty = excluded.qty,
       type = excluded.type,
       description = excluded.description,
       photo = excluded.photo`
  ).run(id, name, Number.isFinite(price) ? price : 0, currencyOf(item.currency), qty, typeOf(item.type), String(item.description || ""), String(item.photo || ""), sort);
  clampCarts();
}

function seedProducts() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (count > 0) return;
  SEED_PRODUCTS.forEach((item, index) => {
    db.prepare(
      `INSERT INTO products (id, name, price, currency, qty, type, description, photo, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...item, index);
  });
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function importLegacyFiles() {
  if (metaGet("json_imported") === "1") return;
  for (const id of readJsonArray(path.join(dataDir, "tombstones.json"))) {
    rememberTombstone(String(id));
  }
  for (const raw of readJsonArray(path.join(dataDir, "orders.json"))) {
    storeExistingOrder(raw);
  }
  rebuildClients();
  metaSet("json_imported", "1");
}

function storeExistingOrder(raw) {
  const id = String(raw.id || "");
  if (!/^o\d+$/.test(id) || isBuried(id)) return false;
  if (db.prepare("SELECT 1 AS ok FROM orders WHERE id = ?").get(id)) return false;
  const lines = normalizeLines(raw.items, {
    productId: raw.productId,
    productName: raw.productName,
    price: raw.price,
    currency: raw.currency,
    type: raw.type,
    qty: 1,
  });
  if (!lines.length) return false;
  const createdAt = /^\d{4}-\d{2}-\d{2}T/.test(String(raw.createdAt || "")) ? String(raw.createdAt) : new Date().toISOString();
  writeOrder(
    {
      id,
      createdAt,
      customerName: String(raw.customerName || "").trim(),
      customerPhone: String(raw.customerPhone || "").trim(),
      channel: raw.channel === "telegram" ? "telegram" : "whatsapp",
      status: ["new", "progress", "done", "cancelled"].includes(raw.status) ? raw.status : "new",
      productId: lines[0].productId,
      productName: String(raw.productName || lines.map((line) => line.productName).join(", ")),
      price: Number(raw.price) || lines[0].price,
      currency: currencyOf(raw.currency || lines[0].currency),
      type: typeOf(raw.type || lines[0].type),
    },
    lines
  );
  return true;
}

function snapshot(sessionId) {
  return {
    products: listProducts(),
    cart: listCart(sessionId),
    orders: listOrders(),
    clients: listClients(),
  };
}

function ensureSession(sessionId) {
  db.prepare("INSERT INTO sessions (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING").run(sessionId, new Date().toISOString());
}

export function openDatabase() {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      qty INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      photo TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      session_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      PRIMARY KEY (session_id, product_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      type TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      type TEXT NOT NULL,
      qty INTEGER NOT NULL,
      line_no INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY
    );
  `);
  withTx(() => {
    seedProducts();
    importLegacyFiles();
  });
  return db;
}

export function databasePath() {
  return dbPath;
}

export function readShop(sessionId) {
  ensureSession(sessionId);
  return snapshot(sessionId);
}

export function saveProduct(item, sessionId) {
  return withTx(() => {
    if (sessionId) ensureSession(sessionId);
    upsertProduct(item);
    return { products: listProducts(), cart: sessionId ? listCart(sessionId) : [] };
  });
}

export function saveCatalog(list, sessionId) {
  return withTx(() => {
    if (sessionId) ensureSession(sessionId);
    replaceProducts(list);
    metaSet("browser_catalog", "1");
    return { products: listProducts(), cart: sessionId ? listCart(sessionId) : [] };
  });
}

export function removeProduct(id, sessionId) {
  return withTx(() => {
    if (sessionId) ensureSession(sessionId);
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    clampCarts();
    return { products: listProducts(), cart: sessionId ? listCart(sessionId) : [] };
  });
}

export function addCartItem(sessionId, productId) {
  return withTx(() => {
    ensureSession(sessionId);
    const product = db.prepare("SELECT qty FROM products WHERE id = ?").get(productId);
    if (!product || Number(product.qty) < 1) return { added: false, products: listProducts(), cart: listCart(sessionId) };
    const line = db.prepare("SELECT qty FROM cart_items WHERE session_id = ? AND product_id = ?").get(sessionId, productId);
    const next = (line ? Number(line.qty) : 0) + 1;
    if (next > Number(product.qty)) return { added: false, products: listProducts(), cart: listCart(sessionId) };
    db.prepare(
      `INSERT INTO cart_items (session_id, product_id, qty) VALUES (?, ?, ?)
       ON CONFLICT(session_id, product_id) DO UPDATE SET qty = excluded.qty`
    ).run(sessionId, productId, next);
    return { added: true, products: listProducts(), cart: listCart(sessionId) };
  });
}

export function setCartItem(sessionId, productId, qty) {
  return withTx(() => {
    ensureSession(sessionId);
    const product = db.prepare("SELECT qty FROM products WHERE id = ?").get(productId);
    const max = product ? Number(product.qty) : 0;
    let next = Number.parseInt(qty, 10);
    if (!Number.isFinite(next) || next < 0) next = 0;
    if (next > max) next = max;
    if (next < 1) db.prepare("DELETE FROM cart_items WHERE session_id = ? AND product_id = ?").run(sessionId, productId);
    else {
      db.prepare(
        `INSERT INTO cart_items (session_id, product_id, qty) VALUES (?, ?, ?)
         ON CONFLICT(session_id, product_id) DO UPDATE SET qty = excluded.qty`
      ).run(sessionId, productId, next);
    }
    return { products: listProducts(), cart: listCart(sessionId) };
  });
}

export function replaceCart(sessionId, items) {
  return withTx(() => {
    ensureSession(sessionId);
    db.prepare("DELETE FROM cart_items WHERE session_id = ?").run(sessionId);
    const insert = db.prepare(
      `INSERT INTO cart_items (session_id, product_id, qty) VALUES (?, ?, ?)
       ON CONFLICT(session_id, product_id) DO UPDATE SET qty = excluded.qty`
    );
    for (const item of Array.isArray(items) ? items : []) {
      const product = db.prepare("SELECT qty FROM products WHERE id = ?").get(String(item.id || item.productId || ""));
      if (!product) continue;
      let qty = Number.parseInt(item.qty, 10);
      if (!Number.isFinite(qty) || qty < 1) continue;
      if (qty > Number(product.qty)) qty = Number(product.qty);
      if (qty < 1) continue;
      insert.run(sessionId, String(item.id || item.productId), qty);
    }
    return { products: listProducts(), cart: listCart(sessionId) };
  });
}

function fail(status, error) {
  const wrapped = new Error(error);
  wrapped.status = status;
  throw wrapped;
}

export function createOrder(input, sessionId) {
  return withTx(() => {
    ensureSession(sessionId);
    const incomingId = String(input.id || "");
    if (/^o\d+$/.test(incomingId) && isBuried(incomingId)) {
      return { order: null, ...snapshot(sessionId) };
    }
    if (/^o\d+$/.test(incomingId)) {
      const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(incomingId);
      if (existing) return { order: mapOrder(existing), ...snapshot(sessionId) };
    }
    const name = String(input.customerName || "").trim();
    const phone = String(input.customerPhone || "").trim();
    const digits = phone.replace(/\D/g, "");
    const lines = normalizeLines(input.items, null);
    if (name.length < 2 || digits.length < 10 || digits.length > 15 || !lines.length) fail(400, "invalid");
    const needed = new Map();
    for (const line of lines) {
      if (!line.productId) continue;
      needed.set(line.productId, (needed.get(line.productId) || 0) + line.qty);
    }
    for (const [productId, qty] of needed) {
      const product = db.prepare("SELECT qty FROM products WHERE id = ?").get(productId);
      if (!product || Number(product.qty) < qty) fail(409, "stock");
    }
    const id = /^o\d+$/.test(incomingId) ? incomingId : `o${Date.now()}${Math.floor(Math.random() * 1000000).toString().padStart(6, "0")}`;
    const createdAt = /^\d{4}-\d{2}-\d{2}T/.test(String(input.createdAt || "")) ? String(input.createdAt) : new Date().toISOString();
    const order = {
      id,
      createdAt,
      customerName: name,
      customerPhone: phone,
      channel: input.channel === "telegram" ? "telegram" : "whatsapp",
      status: "new",
      productId: lines[0].productId,
      productName: String(input.productName || "").trim() || lines.map((line) => (line.qty > 1 ? `${line.productName} × ${line.qty}` : line.productName)).join(", "),
      price: Number(input.price) || lines[0].price,
      currency: currencyOf(input.currency || lines[0].currency),
      type: typeOf(input.type || lines[0].type),
    };
    writeOrder(order, lines);
    for (const [productId, qty] of needed) {
      db.prepare("UPDATE products SET qty = qty - ? WHERE id = ? AND qty >= ?").run(qty, productId, qty);
    }
    if (input.fromCart) db.prepare("DELETE FROM cart_items WHERE session_id = ?").run(sessionId);
    clampCarts();
    rebuildClients();
    return { order: mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)), ...snapshot(sessionId) };
  });
}

export function updateOrder(id, status) {
  return withTx(() => {
    if (!["new", "progress", "done", "cancelled"].includes(status)) fail(400, "status");
    const existing = db.prepare("SELECT id FROM orders WHERE id = ?").get(id);
    if (!existing) fail(404, "missing");
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    return { order: mapOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)), clients: listClients() };
  });
}

export function deleteOrder(id) {
  return withTx(() => {
    rememberTombstone(id);
    db.prepare("DELETE FROM orders WHERE id = ?").run(id);
    rebuildClients();
    return { ok: true, orders: listOrders(), clients: listClients() };
  });
}

export function migrateBrowser(body, sessionId) {
  return withTx(() => {
    ensureSession(sessionId);
    const payload = body && typeof body === "object" ? body : {};
    if (Array.isArray(payload.tombstones)) {
      for (const id of payload.tombstones) rememberTombstone(String(id));
    }
    if (Array.isArray(payload.products) && payload.products.length && metaGet("browser_catalog") !== "1") {
      replaceProducts(payload.products);
      metaSet("browser_catalog", "1");
    }
    if (Array.isArray(payload.orders)) {
      let changed = false;
      for (const order of payload.orders) {
        if (storeExistingOrder(order)) changed = true;
      }
      if (changed) rebuildClients();
    }
    const cartCount = db.prepare("SELECT COUNT(*) AS count FROM cart_items WHERE session_id = ?").get(sessionId).count;
    if (Array.isArray(payload.cart) && payload.cart.length && cartCount === 0) {
      const insert = db.prepare("INSERT INTO cart_items (session_id, product_id, qty) VALUES (?, ?, ?)");
      for (const item of payload.cart) {
        const productId = String(item.id || "");
        const product = db.prepare("SELECT qty FROM products WHERE id = ?").get(productId);
        if (!product) continue;
        let qty = Number.parseInt(item.qty, 10);
        if (!Number.isFinite(qty) || qty < 1) continue;
        if (qty > Number(product.qty)) qty = Number(product.qty);
        if (qty < 1) continue;
        insert.run(sessionId, productId, qty);
      }
    }
    return snapshot(sessionId);
  });
}

export function shopCounts() {
  return {
    products: db.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: db.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    clients: db.prepare("SELECT COUNT(*) AS count FROM clients").get().count,
    tombstones: db.prepare("SELECT COUNT(*) AS count FROM tombstones").get().count,
    carts: db.prepare("SELECT COUNT(*) AS count FROM cart_items").get().count,
  };
}
