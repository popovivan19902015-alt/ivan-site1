import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import PDFDocument from "pdfkit";
import { createPdf, formatMoney, readOrder, shopBuyer } from "./generateInvoice.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const invoiceRoot = path.resolve(here, "..");
const shopDbPath = path.resolve(invoiceRoot, "..", "data", "shop.db");
const sampleOrderPath = path.join(invoiceRoot, "data", "order.json");
const outputDir = path.join(invoiceRoot, "output");
const regularFont = path.join(invoiceRoot, "fonts", "Roboto-Regular.ttf");
const boldFont = path.join(invoiceRoot, "fonts", "Roboto-Bold.ttf");
const marginPt = (20 * 72) / 25.4;
const vatRate = 16;

const catalogColumns = [
  { key: "n", title: "№", align: "center", width: 28 },
  { key: "name", title: "Наименование", align: "left", width: 130 },
  { key: "type", title: "Тип", align: "center", width: 52 },
  { key: "price", title: "Цена", align: "right", width: 78 },
  { key: "stock", title: "Наличие", align: "left", width: 112 },
  { key: "description", title: "Описание", align: "left", width: 0 },
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function openShop() {
  if (!fs.existsSync(shopDbPath)) fail(`Не найдена база магазина: ${shopDbPath}`);
  return new DatabaseSync(shopDbPath, { readOnly: true });
}

function loadProducts(db) {
  return db.prepare("SELECT id, name, price, currency, qty, type, description FROM products ORDER BY sort_order, id").all();
}

function loadOrders(db) {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at ASC, id ASC").all();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY line_no ASC");
  return orders.map((order) => ({ ...order, items: items.all(order.id) }));
}

function typeLabel(type) {
  return type === "service" ? "Услуга" : "Товар";
}

function stockLabel(product) {
  const qty = Number(product.qty) || 0;
  if (qty < 1) return "Нет в наличии";
  if (product.type === "service") return "Услуга доступна";
  return `В наличии, ${qty} шт`;
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function catalogWidths(total) {
  const fixed = catalogColumns.reduce((sum, column) => sum + column.width, 0);
  return catalogColumns.map((column) => (column.key === "description" ? total - fixed : column.width));
}

function rowHeight(doc, widths, row, fontName) {
  let height = 18;
  catalogColumns.forEach((column, index) => {
    doc.font(fontName).fontSize(10);
    const textHeight = doc.heightOfString(String(row[column.key] ?? ""), {
      width: Math.max(8, widths[index] - 6),
      lineGap: 1,
    });
    height = Math.max(height, Math.ceil(textHeight) + 8);
  });
  return height;
}

function paintRow(doc, widths, y, height, row, style) {
  const left = doc.page.margins.left;
  let x = left;
  catalogColumns.forEach((column, index) => {
    const width = widths[index];
    if (style.fill) {
      doc.save();
      doc.rect(x, y, width, height).fill(style.fill);
      doc.restore();
    }
    doc.save();
    doc.lineWidth(0.4).strokeColor("#555555").rect(x, y, width, height).stroke();
    doc.restore();
    const text = String(row[column.key] ?? "");
    doc.font(style.font).fontSize(10).fillColor("#161616");
    const boxWidth = Math.max(8, width - 6);
    const boxHeight = doc.heightOfString(text, { width: boxWidth, lineGap: 1 });
    doc.text(text, x + 3, y + Math.max(3, (height - boxHeight) / 2), {
      width: boxWidth,
      height: boxHeight + 1,
      align: style.header ? "center" : column.align,
      lineGap: 1,
    });
    x += width;
  });
  doc.x = left;
  doc.y = y + height;
}

function drawCatalog(doc, products) {
  doc.registerFont("Regular", regularFont);
  doc.registerFont("Bold", boldFont);
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const widths = catalogWidths(width);
  doc.font("Bold").fontSize(16).fillColor("#161616").text("Каталог товаров", left, doc.y, { width });
  doc.moveDown(0.25);
  doc.font("Regular").fontSize(10).text("Электрик·Маркет. Цена указана так, как она стоит в магазине. Наличие — можно ли заказать позицию сейчас.", { width });
  doc.moveDown(0.4);

  const rows = products.map((product, index) => ({
    n: String(index + 1),
    name: product.name,
    type: typeLabel(product.type),
    price: formatMoney(product.price, product.currency),
    stock: stockLabel(product),
    description: product.description || "",
  }));
  const header = Object.fromEntries(catalogColumns.map((column) => [column.key, column.title]));

  const paintHeader = () => {
    const height = rowHeight(doc, widths, header, "Bold");
    paintRow(doc, widths, doc.y, height, header, { font: "Bold", fill: "#e4e4e4", header: true });
  };
  paintHeader();
  rows.forEach((row) => {
    const height = rowHeight(doc, widths, row, "Regular");
    if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      paintHeader();
    }
    paintRow(doc, widths, doc.y, height, row, { font: "Regular", fill: "" });
  });

  const footY = doc.page.height - 34;
  if (doc.y > footY - 8) doc.addPage();
  const previous = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Regular").fontSize(8).fillColor("#666666");
  doc.text("Документ сформирован в учебных целях.", left, footY, { width, lineBreak: false });
  doc.page.margins.bottom = previous;
}

function writePdf(filePath, draw) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt },
      info: { Title: "Каталог товаров" },
    });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);
    draw(doc);
    doc.end();
  });
}

async function makeCatalog() {
  const db = openShop();
  const products = loadProducts(db);
  if (!products.length) fail("В базе нет товаров для каталога.");
  const filePath = path.join(outputDir, "catalog.pdf");
  await writePdf(filePath, (doc) => drawCatalog(doc, products));
  console.log(`Каталог: ${filePath}`);
  console.log(`Позиций: ${products.length}`);
}

function supplierBlock() {
  const sample = JSON.parse(fs.readFileSync(sampleOrderPath, "utf8"));
  return sample.supplier;
}

function orderDate(iso) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso || ""));
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

async function makeInvoice(orderId) {
  const db = openShop();
  const orders = loadOrders(db);
  if (!orders.length) fail("В базе нет заказов.");
  const order = orderId ? orders.find((item) => item.id === orderId) : orders[orders.length - 1];
  if (!order) {
    fail(`Заказ «${orderId}» не найден. Доступны: ${orders.map((item) => item.id).join(", ")}`);
  }
  const lines = order.items.length
    ? order.items
    : [
        {
          product_name: order.product_name,
          price: order.price,
          currency: order.currency,
          qty: 1,
          type: order.type,
        },
      ];
  const currency = lines[0].currency || order.currency || "KZT";
  const number = `СФ-${String(order.id).replace(/^o/, "")}`;
  const payload = {
    number,
    date: orderDate(order.created_at),
    vatRate,
    currency,
    priceIncludesVat: true,
    supplier: supplierBlock(),
    buyer: shopBuyer(order.customer_name, order.customer_phone),
    items: lines.map((line) => ({
      name: line.product_name,
      unit: line.type === "service" ? "усл." : "шт.",
      qty: line.qty,
      price: line.price,
    })),
  };
  const tempPath = path.join(outputDir, `.${number}.json`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(payload));
  try {
    const parsed = readOrder(tempPath);
    const filePath = path.join(outputDir, `invoice-${number}.pdf`);
    await createPdf(parsed, filePath);
    console.log(`Счёт: ${filePath}`);
    console.log(`Заказ: ${order.id}, клиент: ${order.customer_name}`);
    console.log(`Всего с НДС: ${formatMoney(parsed.totals.gross, parsed.currency)}`);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

const command = process.argv[2];
if (command === "catalog") {
  makeCatalog().catch((error) => fail(error.message));
} else if (command === "invoice") {
  makeInvoice(process.argv[3]).catch((error) => fail(error.message));
} else {
  fail("Укажите команду: node src/fromShop.js catalog   или   node src/fromShop.js invoice НОМЕР_ЗАКАЗА");
}
