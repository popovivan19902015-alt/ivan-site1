import { formatPrice } from "../../lib/catalog.js";

function wordsOf(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-zа-я0-9×]+/i)
    .filter((word) => word.length > 1);
}

function findProduct(shop, args) {
  const products = Array.isArray(shop?.products) ? shop.products : [];
  const id = String(args?.product_id || "").trim();
  if (id) {
    const byId = products.find((item) => item.id === id);
    if (byId) return { product: byId };
  }
  const words = wordsOf(args?.query);
  if (!words.length) return { product: null, matches: [] };
  const matches = products.filter((item) => {
    const haystack = `${item.name} ${item.description || ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  if (matches.length === 1) return { product: matches[0] };
  return { product: null, matches };
}

function lineView(line) {
  return {
    id: line.id,
    name: line.name,
    qty: line.qty,
    priceText: formatPrice(line.price, line.currency),
    currency: line.currency,
  };
}

export const getCartTool = {
  name: "get_cart",
  description: "Показать, что сейчас лежит в корзине: название, количество и цена. Вызывай, когда спрашивают про корзину.",
  parameters: { type: "object", properties: {} },
  run(_args, shop) {
    const items = (shop?.cart || []).map(lineView);
    const count = items.reduce((sum, item) => sum + item.qty, 0);
    return JSON.stringify({ count, items });
  },
};

export const addToCartTool = {
  name: "add_to_cart",
  description:
    "Положить в корзину одну штуку товара, как кнопка «В корзину». Передай product_id из search_products или точное название в query. Повторный вызов добавляет ещё одну штуку, если она есть в наличии. Заказ с именем и телефоном эта функция не оформляет.",
  parameters: {
    type: "object",
    properties: {
      product_id: { type: "string", description: "id товара из search_products." },
      query: { type: "string", description: "Название, если id неизвестен." },
    },
  },
  async run(args, shop) {
    const { product, matches = [] } = findProduct(shop, args);
    if (!product) {
      return JSON.stringify({
        added: false,
        error: matches.length ? "Подходит несколько товаров. Уточни, какой именно." : "Товар не найден.",
        matches: matches.slice(0, 8).map((item) => ({ id: item.id, name: item.name, qty: Number(item.qty) || 0 })),
      });
    }
    const already = (shop.cart || []).find((line) => line.id === product.id);
    const added = typeof shop.addToCart === "function" ? Boolean(await shop.addToCart(product.id)) : false;
    return JSON.stringify({
      added,
      id: product.id,
      name: product.name,
      qtyInCart: (already ? already.qty : 0) + (added ? 1 : 0),
      stock: Number(product.qty) || 0,
      error: added ? "" : "Больше этой позиции нет в наличии.",
    });
  },
};
