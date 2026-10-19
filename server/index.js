import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addCartItem,
  createOrder,
  databasePath,
  deleteOrder,
  listClients,
  listOrders,
  migrateBrowser,
  openDatabase,
  readShop,
  removeProduct,
  replaceCart,
  saveCatalog,
  saveProduct,
  setCartItem,
  shopCounts,
  updateOrder,
} from "./db.js";
import { parseOrder, renderPdf, shopBuyer } from "../invoice/src/generateInvoice.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "client", "dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

openDatabase();
const counts = shopCounts();
console.log(`SQLite ${databasePath()}`);
console.log(`Товары ${counts.products}, заказы ${counts.orders}, клиенты ${counts.clients}, удалённые ${counts.tombstones}`);

function send(res, code, type, body) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(code, {
    "Content-Type": type,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendJson(res, code, obj) {
  send(res, code, "application/json; charset=utf-8", JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) {
        reject(new Error("large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function sessionId(req) {
  const value = String(req.headers["x-shop-session"] || "");
  return /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : "";
}

function readKey() {
  const fromEnv = String(process.env.OPENAI_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const envFile = path.join(root, ".env");
  if (!fs.existsSync(envFile)) return "";
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

async function handleChat(req, res) {
  const key = readKey();
  if (!key) {
    sendJson(res, 503, { error: "no key" });
    return;
  }
  const incoming = await readJson(req);
  const payload = { model: "gpt-4o-mini", messages: incoming.messages };
  if (incoming.tools) payload.tools = incoming.tools;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, 502, { error: data.error?.message || data.error || "openai" });
    return;
  }
  const message = data.choices?.[0]?.message;
  if (!message) {
    sendJson(res, 502, { error: "empty" });
    return;
  }
  sendJson(res, 200, { message });
}

function serveStatic(urlPath, res) {
  const distIndex = path.join(distRoot, "index.html");
  if (fs.existsSync(distIndex)) {
    const relative = urlPath.replaceAll("/", path.sep);
    const full = path.resolve(distRoot, relative);
    const rootWithSep = distRoot.endsWith(path.sep) ? distRoot : distRoot + path.sep;
    const inside = full.startsWith(rootWithSep);
    if (inside && fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full).toLowerCase();
      send(res, 200, mime[ext] || "application/octet-stream", fs.readFileSync(full));
      return;
    }
    if (/\.[a-zA-Z0-9]+$/.test(urlPath)) {
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    send(res, 200, "text/html; charset=utf-8", fs.readFileSync(distIndex));
    return;
  }
  const full = path.resolve(root, urlPath.replaceAll("/", path.sep));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!full.startsWith(rootWithSep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    send(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  const ext = path.extname(full).toLowerCase();
  send(res, 200, mime[ext] || "application/octet-stream", fs.readFileSync(full));
}

function invoiceDocument(order) {
  const samplePath = path.join(root, "invoice", "data", "order.json");
  const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const lines =
    Array.isArray(order.items) && order.items.length
      ? order.items
      : [
          {
            productName: order.productName,
            price: order.price,
            currency: order.currency,
            qty: 1,
            type: order.type,
          },
        ];
  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(String(order.createdAt || ""));
  return parseOrder({
    number: `СФ-${String(order.id).replace(/^o/, "")}`,
    date: dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10),
    vatRate: 16,
    currency: lines[0].currency || order.currency || "KZT",
    priceIncludesVat: true,
    supplier: sample.supplier,
    buyer: shopBuyer(order.customerName, order.customerPhone),
    items: lines.map((line) => ({
      name: String(line.productName || ""),
      unit: line.type === "service" ? "усл." : "шт.",
      qty: Number(line.qty) || 1,
      price: Number(line.price) || 0,
    })),
  });
}

async function sendInvoice(res, orderId) {
  const order = listOrders().find((item) => item.id === orderId);
  if (!order) {
    sendJson(res, 404, { error: "Заказ не найден" });
    return;
  }
  const pdf = await renderPdf(invoiceDocument(order));
  const ascii = `invoice-${String(order.id).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
  const utfName = encodeURIComponent(`invoice-СФ-${String(order.id).replace(/^o/, "")}.pdf`);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": pdf.length,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utfName}`,
    "Cache-Control": "no-store",
  });
  res.end(pdf);
}

function requireSession(req, res) {
  const id = sessionId(req);
  if (!id) {
    sendJson(res, 400, { error: "session" });
    return "";
  }
  return id;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === "/.env" || pathname === "/openai.key" || pathname.startsWith("/data/") || pathname.startsWith("/server/")) {
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    if (pathname === "/api/chat" && req.method === "POST") {
      await handleChat(req, res);
      return;
    }
    if (pathname === "/api/migrate" && req.method === "POST") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, migrateBrowser(await readJson(req), id));
      return;
    }
    if (pathname === "/api/products" && req.method === "GET") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, { products: readShop(id).products });
      return;
    }
    if (pathname === "/api/products" && req.method === "POST") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, saveProduct(await readJson(req), id));
      return;
    }
    if (pathname === "/api/products" && req.method === "PUT") {
      const id = requireSession(req, res);
      if (!id) return;
      const body = await readJson(req);
      sendJson(res, 200, saveCatalog(body.products || [], id));
      return;
    }
    if (pathname.startsWith("/api/products/") && req.method === "DELETE") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, removeProduct(pathname.slice("/api/products/".length), id));
      return;
    }
    if (pathname === "/api/cart" && req.method === "GET") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, { cart: readShop(id).cart });
      return;
    }
    if (pathname === "/api/cart" && req.method === "PUT") {
      const id = requireSession(req, res);
      if (!id) return;
      const body = await readJson(req);
      sendJson(res, 200, replaceCart(id, body.items || body.cart || []));
      return;
    }
    if (pathname === "/api/cart/add" && req.method === "POST") {
      const id = requireSession(req, res);
      if (!id) return;
      const body = await readJson(req);
      sendJson(res, 200, addCartItem(id, String(body.productId || "")));
      return;
    }
    if (pathname === "/api/cart/qty" && req.method === "POST") {
      const id = requireSession(req, res);
      if (!id) return;
      const body = await readJson(req);
      sendJson(res, 200, setCartItem(id, String(body.productId || ""), body.qty));
      return;
    }
    if (pathname === "/api/orders" && req.method === "GET") {
      sendJson(res, 200, { orders: listOrders() });
      return;
    }
    if (pathname === "/api/orders" && req.method === "POST") {
      const id = requireSession(req, res);
      if (!id) return;
      sendJson(res, 200, createOrder(await readJson(req), id));
      return;
    }
    if (pathname === "/api/orders/update" && req.method === "POST") {
      const body = await readJson(req);
      sendJson(res, 200, updateOrder(String(body.id || ""), String(body.status || "")));
      return;
    }
    if (pathname === "/api/orders/delete" && req.method === "POST") {
      const body = await readJson(req);
      sendJson(res, 200, deleteOrder(String(body.id || "")));
      return;
    }
    if (pathname === "/api/clients" && req.method === "GET") {
      sendJson(res, 200, { clients: listClients() });
      return;
    }
    const invoiceMatch = /^\/api\/orders\/([^/]+)\/invoice$/.exec(pathname);
    if (invoiceMatch && req.method === "GET") {
      await sendInvoice(res, invoiceMatch[1]);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "method" });
      return;
    }
    const cleaned = pathname.replace(/^\/+/, "");
    serveStatic(cleaned || "index.html", res);
  } catch (error) {
    const status = Number(error.status) || (error instanceof SyntaxError ? 400 : 500);
    sendJson(res, status, { error: error.message || "error" });
  }
});

const port = Number(process.env.PORT) || 8090;
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  const shown = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`Serving http://${shown}:${port}/`);
});
