import { formatPrice, typeLabel } from "../../lib/catalog.js";

function wordsOf(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-zа-я0-9×]+/i)
    .filter((word) => word.length > 1);
}

export const searchProductsTool = {
  name: "search_products",
  description:
    "Найти товары и услуги в каталоге по названию или описанию. Возвращает цену, валюту и остаток. Вызывай, когда спрашивают про товары, цену, наличие или ассортимент. Пустой query возвращает каталог.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Слова из названия или описания. Пустая строка — весь каталог.",
      },
    },
    required: ["query"],
  },
  run(args, shop) {
    const words = wordsOf(args?.query);
    const products = Array.isArray(shop?.products) ? shop.products : [];
    const found = words.length
      ? products.filter((item) => {
          const haystack = `${item.name} ${item.description || ""}`.toLowerCase();
          return words.some((word) => haystack.includes(word));
        })
      : products;
    const items = found.slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      currency: item.currency,
      priceText: formatPrice(item.price, item.currency),
      qty: Number(item.qty) || 0,
      type: typeLabel(item.type),
      description: item.description || "",
    }));
    return JSON.stringify({ count: found.length, items });
  },
};
