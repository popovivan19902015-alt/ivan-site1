import { formatPrice, typeLabel } from "./catalog.js";

export function productLines(products) {
  return products
    .map(
      (item) =>
        `• ${item.name} — ${formatPrice(item.price, item.currency)} (${typeLabel(item.type)}), в наличии: ${Number(item.qty) || 0}`
    )
    .join("\n");
}

export function localAnswer(raw, products) {
  const text = String(raw || "").toLowerCase();
  const words = text.split(/[^a-zа-я0-9×]+/i).filter((word) => word.length > 2);
  const found = products.filter((item) => {
    const haystack = `${item.name} ${item.description || ""}`.toLowerCase();
    return words.some((word) => haystack.includes(word));
  });

  if (/привет|здравств|добрый|хай/.test(text)) {
    return "Здравствуйте, я Иван. Подскажу по товарам, ценам и заказу.";
  }
  if (/кто ты|как тебя|имя|консультант/.test(text)) {
    return "Меня зовут Иван. Я консультант на этом сайте.";
  }
  if (/валют|рубл|тенге|доллар/.test(text)) {
    return "Цены указаны в рублях, тенге или долларах. Символ стоит прямо на карточке: ₽, ₸ или $.";
  }
  if (/заказ|whatsapp|ватсап|купить|оформ/.test(text)) {
    return "Добавьте товар в корзину или нажмите «Заказать». Затем укажите имя и телефон и выберите WhatsApp или Telegram. Чат откроется на +7 777 422 2256.";
  }
  if (/товар|каталог|что есть|ассортимент|список|услуг/.test(text) || found.length > 1) {
    return `Сейчас в наличии:\n${productLines(products)}`;
  }
  if (found.length === 1) {
    const item = found[0];
    return `${item.name}: ${formatPrice(item.price, item.currency)}, ${typeLabel(item.type).toLowerCase()}. ${item.description || ""}`.trim();
  }
  return "Я Иван. Спросите про товары, цену или как оформить заказ.";
}
