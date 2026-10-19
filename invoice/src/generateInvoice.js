import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const regularFont = path.join(root, "fonts", "Roboto-Regular.ttf");
const boldFont = path.join(root, "fonts", "Roboto-Bold.ttf");
const marginPt = (20 * 72) / 25.4;

const columns = [
  { key: "n", title: "№", align: "center", min: 22 },
  { key: "name", title: "Наименование", align: "left", min: 70 },
  { key: "unit", title: "Ед. изм.", align: "center", min: 32 },
  { key: "qty", title: "Кол-во", align: "center", min: 34 },
  { key: "price", title: "Цена без НДС", align: "right", min: 58 },
  { key: "net", title: "Сумма без НДС", align: "right", min: 62 },
  { key: "rate", title: "Ставка НДС", align: "center", min: 40 },
  { key: "vat", title: "Сумма НДС", align: "right", min: 58 },
  { key: "gross", title: "Всего с НДС", align: "right", min: 62 },
];

const onesMale = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const onesFemale = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const teens = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function fail(message) {
  const error = new Error(message);
  error.userMessage = true;
  throw error;
}

function requireText(source, key, title) {
  const value = source?.[key];
  if (typeof value !== "string" || !value.trim()) fail(`Не заполнено поле «${title}».`);
  return value.trim();
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) fail("Дата заказа должна быть в формате ГГГГ-ММ-ДД.");
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatRate(rate) {
  return String(rate).replace(".", ",");
}

function formatQty(qty) {
  if (Number.isInteger(qty)) return String(qty);
  return String(qty).replace(".", ",");
}

// Деньги округляются только здесь, при показе на листе.
const moneySign = { KZT: "₸", RUB: "₽", USD: "$" };
const moneyName = { KZT: ["тенге", "тиын"], RUB: ["руб.", "коп."], USD: ["долл. США", "центов"] };

function currencyOf(value) {
  return value === "USD" || value === "RUB" || value === "KZT" ? value : "KZT";
}

function moneyRound(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatContactPhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return String(phone || "").trim();
}

function shopBuyer(name, phone) {
  return {
    name: String(name || "").trim(),
    bin: "—",
    address: "не указан",
    phone: formatContactPhone(phone),
  };
}

function formatMoney(value, currency = "KZT") {
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const sign = moneySign[currencyOf(currency)];
  return `${value < 0 ? "-" : ""}${grouped},${frac}\u00A0${sign}`;
}

function plural(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function triadWords(value, female) {
  const words = [];
  const hundred = Math.floor(value / 100);
  const ten = Math.floor((value % 100) / 10);
  const one = value % 10;
  if (hundred) words.push(hundreds[hundred]);
  if (ten === 1) words.push(teens[one]);
  else {
    if (ten) words.push(tens[ten]);
    if (one) words.push((female ? onesFemale : onesMale)[one]);
  }
  return words;
}

// Целая часть тенге прописью и тиыны двумя цифрами.
function amountInWords(value, currency = "KZT") {
  const [unit, fracName] = moneyName[currencyOf(currency)];
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  const tenge = Math.floor(cents / 100);
  const tiyn = String(cents % 100).padStart(2, "0");
  if (tenge === 0) return `ноль ${unit} ${tiyn} ${fracName}`;

  const groups = [
    { female: false, forms: null },
    { female: true, forms: ["тысяча", "тысячи", "тысяч"] },
    { female: false, forms: ["миллион", "миллиона", "миллионов"] },
    { female: false, forms: ["миллиард", "миллиарда", "миллиардов"] },
  ];
  const parts = [];
  let rest = tenge;
  let index = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk) {
      const group = groups[index];
      if (!group) fail("Сумма слишком большая для суммы прописью.");
      const words = triadWords(chunk, group.female);
      if (group.forms) words.push(plural(chunk, ...group.forms));
      parts.unshift(words.join(" "));
    }
    rest = Math.floor(rest / 1000);
    index += 1;
  }
  return `${parts.join(" ")} ${unit} ${tiyn} ${fracName}`;
}

function parseOrder(order) {
  if (!order || typeof order !== "object") fail("Файл заказа не является корректным JSON.");
  if (!Array.isArray(order.items) || order.items.length === 0) {
    fail("Список товаров пуст. Добавьте хотя бы одну позицию, чтобы сформировать счёт-фактуру.");
  }
  if (typeof order.vatRate !== "number" || !Number.isFinite(order.vatRate) || order.vatRate < 0) {
    fail("Ставка НДС (vatRate) должна быть числом в файле заказа.");
  }

  const includesVat = order.priceIncludesVat === true;
  const items = order.items.map((item, index) => {
    const place = index + 1;
    if (!item || typeof item !== "object") fail(`Позиция ${place} указана неверно.`);
    const name = requireText(item, "name", `наименование позиции ${place}`);
    const unit = requireText(item, "unit", `единица измерения позиции ${place}`);
    const qty = item.qty;
    const price = item.price;
    if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) fail(`Количество в позиции ${place} должно быть больше нуля.`);
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) fail(`Цена в позиции ${place} должна быть числом без НДС.`);
    const line = moneyRound(qty * price);
    const net = includesVat ? moneyRound((line * 100) / (100 + order.vatRate)) : line;
    const vat = includesVat ? moneyRound(line - net) : moneyRound((net * order.vatRate) / 100);
    const gross = moneyRound(net + vat);
    return { name, unit, qty, price: net / qty, net, vat, gross };
  });

  const totals = items.reduce(
    (sum, item) => ({
      net: moneyRound(sum.net + item.net),
      vat: moneyRound(sum.vat + item.vat),
      gross: moneyRound(sum.gross + item.gross),
    }),
    { net: 0, vat: 0, gross: 0 }
  );

  return {
    number: requireText(order, "number", "номер счёта"),
    date: formatDate(order.date),
    vatRate: order.vatRate,
    currency: currencyOf(order.currency),
    supplier: {
      name: requireText(order.supplier, "name", "поставщик"),
      bin: requireText(order.supplier, "bin", "БИН/ИИН поставщика"),
      address: requireText(order.supplier, "address", "адрес поставщика"),
      bank: requireText(order.supplier, "bank", "банк поставщика"),
      iik: requireText(order.supplier, "iik", "ИИК поставщика"),
      bik: requireText(order.supplier, "bik", "БИК поставщика"),
    },
    buyer: {
      name: requireText(order.buyer, "name", "получатель"),
      bin: requireText(order.buyer, "bin", "БИН/ИИН получателя"),
      address: requireText(order.buyer, "address", "адрес получателя"),
      phone: typeof order.buyer?.phone === "string" ? order.buyer.phone.trim() : "",
    },
    priceIncludesVat: includesVat,
    items,
    totals,
  };
}

function readOrder(filePath) {
  if (!fs.existsSync(filePath)) fail(`Не найден файл заказа: ${filePath}`);
  let order;
  try {
    order = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    fail("Файл заказа не является корректным JSON.");
  }
  return parseOrder(order);
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function textWidth(doc, text, fontName) {
  doc.font(fontName).fontSize(10);
  return doc.widthOfString(String(text));
}

function columnWidths(doc, rows, totalWidth) {
  const pad = 7;
  const nameIndex = columns.findIndex((column) => column.key === "name");
  const widths = columns.map((column, index) => {
    if (index === nameIndex) return 0;
    const samples = rows.map((row) => String(row[column.key] ?? "")).filter(Boolean);
    const widest = samples.reduce((max, sample) => Math.max(max, textWidth(doc, sample, "Bold")), 0);
    return Math.max(column.min, Math.ceil(widest) + pad);
  });
  let fixed = widths.reduce((sum, width) => sum + width, 0);
  const nameFloor = 110;
  if (totalWidth - fixed < nameFloor) {
    const overflow = nameFloor - (totalWidth - fixed);
    const cut = overflow / (columns.length - 1);
    for (let index = 0; index < widths.length; index += 1) {
      if (index === nameIndex) continue;
      widths[index] = Math.max(columns[index].min, widths[index] - cut);
    }
    fixed = widths.reduce((sum, width) => sum + width, 0);
  }
  widths[nameIndex] = totalWidth - fixed;
  return widths;
}

function rowHeight(doc, widths, row, fontName) {
  let height = 16;
  columns.forEach((column, index) => {
    doc.font(fontName).fontSize(10);
    const textHeight = doc.heightOfString(String(row[column.key] ?? ""), {
      width: Math.max(8, widths[index] - 6),
      align: column.align,
      lineGap: 1,
    });
    height = Math.max(height, Math.ceil(textHeight) + 8);
  });
  return height;
}

function paintRow(doc, widths, y, height, row, style) {
  const left = doc.page.margins.left;
  let x = left;
  columns.forEach((column, index) => {
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
    const boxHeight = doc.heightOfString(text, { width: boxWidth, align: column.align, lineGap: 1 });
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

function drawTable(doc, order) {
  const rate = `${formatRate(order.vatRate)}%`;
  const money = (value) => formatMoney(value, order.currency);
  const rows = order.items.map((item, index) => ({
    n: String(index + 1),
    name: item.name,
    unit: item.unit,
    qty: formatQty(item.qty),
    price: money(item.price),
    net: money(item.net),
    rate,
    vat: money(item.vat),
    gross: money(item.gross),
  }));
  const totalRow = {
    n: "",
    name: "Итого",
    unit: "",
    qty: "",
    price: "",
    net: money(order.totals.net),
    rate: "",
    vat: money(order.totals.vat),
    gross: money(order.totals.gross),
  };
  const headerRow = Object.fromEntries(columns.map((column) => [column.key, column.title]));
  const widths = columnWidths(doc, [...rows, totalRow], contentWidth(doc));
  const left = doc.page.margins.left;

  const paintHeader = () => {
    const height = rowHeight(doc, widths, headerRow, "Bold");
    paintRow(doc, widths, doc.y, height, headerRow, { font: "Bold", fill: "#e4e4e4", header: true });
  };

  const paintBody = (row, fontName) => {
    const height = rowHeight(doc, widths, row, fontName);
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + height > bottom) {
      doc.addPage();
      paintHeader();
    }
    paintRow(doc, widths, doc.y, height, row, { font: fontName, fill: "" });
  };

  const headerHeight = rowHeight(doc, widths, headerRow, "Bold");
  if (doc.y + headerHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
  paintHeader();
  rows.forEach((row) => paintBody(row, "Regular"));
  paintBody(totalRow, "Bold");
  doc.x = left;
}

function partyBlock(doc, title, lines) {
  doc.font("Bold").fontSize(12).fillColor("#161616").text(title);
  doc.moveDown(0.15);
  doc.font("Regular").fontSize(10);
  lines.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`);
  });
  doc.moveDown(0.7);
}

function drawSignatures(doc) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  if (doc.y + 48 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.moveDown(1.4);
  const y = doc.y;
  const column = width / 3;
  doc.font("Regular").fontSize(10).fillColor("#161616");
  doc.text("Руководитель ______", left, y, { width: column, lineBreak: false });
  doc.text("Главный бухгалтер ______", left + column, y, { width: column, lineBreak: false });
  doc.text("М.П.", left + column * 2, y, { width: column, lineBreak: false });
  doc.x = left;
  doc.y = y + 18;
}

function drawFootnote(doc) {
  const left = doc.page.margins.left;
  const footY = doc.page.height - 34;
  if (doc.y > footY - 8) doc.addPage();
  const previous = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.font("Regular").fontSize(8).fillColor("#666666");
  doc.text("Документ сформирован в учебных целях.", left, footY, {
    width: contentWidth(doc),
    lineBreak: false,
  });
  doc.page.margins.bottom = previous;
}

function drawInvoice(doc, order) {
  doc.registerFont("Regular", regularFont);
  doc.registerFont("Bold", boldFont);

  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  doc.font("Bold").fontSize(16).fillColor("#161616");
  doc.text(`Счёт-фактура № ${order.number} от ${order.date}`, left, doc.y, { width });
  if (order.priceIncludesVat) {
    doc.moveDown(0.15);
    doc.font("Regular").fontSize(10).fillColor("#161616");
    doc.text("Цена заказа включает НДС. В таблице цена и сумма без НДС посчитаны из этой цены.", left, doc.y, { width });
  }
  doc.moveDown(0.35);
  const ruleY = doc.y;
  doc.moveTo(left, ruleY).lineTo(left + width, ruleY).strokeColor("#222222").lineWidth(1).stroke();
  doc.moveDown(0.7);

  partyBlock(doc, "Поставщик", [
    ["Наименование", order.supplier.name],
    ["БИН/ИИН", order.supplier.bin],
    ["Адрес", order.supplier.address],
    ["Банк", order.supplier.bank],
    ["ИИК", order.supplier.iik],
    ["БИК", order.supplier.bik],
  ]);
  const buyerLines = [
    ["Наименование", order.buyer.name],
    ["БИН/ИИН", order.buyer.bin],
    ["Адрес", order.buyer.address],
  ];
  if (order.buyer.phone) buyerLines.push(["Телефон", order.buyer.phone]);
  partyBlock(doc, "Получатель", buyerLines);

  drawTable(doc, order);
  doc.moveDown(0.8);
  doc.font("Regular").fontSize(10).fillColor("#161616");
  doc.text(`Сумма без НДС: ${formatMoney(order.totals.net, order.currency)}`, { width, align: "right" });
  doc.text(`НДС ${formatRate(order.vatRate)}%: ${formatMoney(order.totals.vat, order.currency)}`, { width, align: "right" });
  doc.font("Bold").text(`Всего с НДС: ${formatMoney(order.totals.gross, order.currency)}`, { width, align: "right" });
  doc.moveDown(0.45);
  doc.font("Regular").text(`Всего к оплате: ${amountInWords(order.totals.gross, order.currency)}`, left, doc.y, { width });
  drawSignatures(doc);
  drawFootnote(doc);
}

function outputPathFor(number) {
  const safe = number.replace(/[\\/:*?"<>|]/g, "-");
  return path.join(root, "output", `invoice-${safe}.pdf`);
}

function renderPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt },
      info: { Title: `Счёт-фактура ${order.number}`, Author: order.supplier.name },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      drawInvoice(doc, order);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function createPdf(order, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt },
      info: { Title: `Счёт-фактура ${order.number}`, Author: order.supplier.name },
    });
    const stream = fs.createWriteStream(filePath);
    const done = (error) => {
      if (!error) {
        resolve();
        return;
      }
      fs.rmSync(filePath, { force: true });
      reject(error);
    };
    stream.on("finish", () => done());
    stream.on("error", done);
    doc.on("error", done);
    doc.pipe(stream);
    try {
      drawInvoice(doc, order);
      doc.end();
    } catch (error) {
      doc.end();
      done(error);
    }
  });
}

async function main() {
  const input = process.argv[2];
  if (!input) fail("Укажите файл заказа: node src/generateInvoice.js data/order.json");
  if (!fs.existsSync(regularFont) || !fs.existsSync(boldFont)) {
    fail("Не найдены шрифты fonts/Roboto-Regular.ttf и fonts/Roboto-Bold.ttf.");
  }
  const order = readOrder(path.resolve(input));
  const filePath = outputPathFor(order.number);
  await createPdf(order, filePath);
  console.log(`Сумма без НДС: ${formatMoney(order.totals.net, order.currency)}`);
  console.log(`НДС ${formatRate(order.vatRate)}%: ${formatMoney(order.totals.vat, order.currency)}`);
  console.log(`Всего с НДС: ${formatMoney(order.totals.gross, order.currency)}`);
  console.log(`Прописью: ${amountInWords(order.totals.gross, order.currency)}`);
  console.log(`Файл: ${filePath}`);
}

export { readOrder, parseOrder, createPdf, renderPdf, formatMoney, shopBuyer };

const startedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (startedAsScript) {
  main().catch((error) => {
    console.error(error.userMessage ? error.message : error.stack || error.message);
    process.exit(1);
  });
}
