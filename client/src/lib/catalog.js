export const SHOP_PHONE = "77774222256";

export function cover(a, b, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><defs><radialGradient id="g" cx="50%" cy="35%" r="70%"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="640" height="420" fill="url(#g)"/><text x="36" y="380" fill="rgba(255,255,255,.9)" font-size="32" font-family="Georgia,serif">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function cartLines(products, cart) {
  return cart
    .map((line) => {
      const product = products.find((item) => item.id === line.id);
      if (!product) return null;
      const qty = Math.min(Number(line.qty) || 0, Number(product.qty) || 0);
      if (qty < 1) return null;
      return { ...product, qty };
    })
    .filter(Boolean);
}

export function formatPrice(price, currency) {
  const n = Number(price) || 0;
  if (currency === "USD") {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const formatted = Math.round(n).toLocaleString("ru-RU");
  return currency === "RUB" ? `${formatted} ₽` : `${formatted} ₸`;
}

export function typeLabel(type) {
  return type === "service" ? "Услуга" : "Товар";
}

export function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

export function formatPhone(phone) {
  const key = phoneKey(phone);
  if (key.length === 11 && key.startsWith("7")) {
    return `+7 ${key.slice(1, 4)} ${key.slice(4, 7)} ${key.slice(7, 9)} ${key.slice(9)}`;
  }
  return String(phone || "");
}

export function orderCountLabel(count) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return `${count} заказов`;
  if (last === 1) return `${count} заказ`;
  if (last >= 2 && last <= 4) return `${count} заказа`;
  return `${count} заказов`;
}

export const ORDER_STATUSES = [
  { id: "new", label: "Новый" },
  { id: "progress", label: "В работе" },
  { id: "done", label: "Выполнен" },
  { id: "cancelled", label: "Отменён" },
];

export function channelLabel(channel) {
  return channel === "telegram" ? "Telegram" : "WhatsApp";
}

export function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function orderText(item, customer) {
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

export function whatsappUrl(item, customer) {
  return `https://wa.me/${SHOP_PHONE}?text=${encodeURIComponent(orderText(item, customer))}`;
}

export function telegramUrl(item, customer) {
  return `https://t.me/+${SHOP_PHONE}?text=${encodeURIComponent(orderText(item, customer))}`;
}
