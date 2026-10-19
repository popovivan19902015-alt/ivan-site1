import { getTool, listTools } from "./registry.js";

const SYSTEM = `Ты Иван, AI-консультант сайта-визитки. Отвечай по-русски по сути, в том числе на вопросы не про магазин. Цены, остатки, список товаров и содержимое корзины бери только из функций, не выдумывай позиции. Функции вызывай только когда нужны каталог, цена, остаток или корзина. В корзину клади функцией add_to_cart, по одной штуке за вызов. Оформление заказа с именем и телефоном делает сам клиент кнопкой «Заказать», затем выбирает WhatsApp или Telegram на номер +7 777 422 2256. Если товара нет в наличии, его заказать нельзя. Если пользователь прислал фотографию, смотри на само изображение и отвечай по тому, что на нём видно: товар, маркировка, схема, дефект. Если прислали файл, процитируй важное из него.`;

const history = [];

export class ChatError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function messageContent(text, attachments) {
  const parts = [{ type: "text", text: text || "" }];
  let rich = false;
  for (const file of attachments) {
    if (file.kind === "image") {
      rich = true;
      parts.push({ type: "image_url", image_url: { url: file.dataUrl, detail: "auto" } });
    } else if (file.kind === "file") {
      rich = true;
      parts.push({ type: "file", file: { filename: file.name, file_data: file.dataUrl } });
    } else if (file.text) {
      parts[0].text += `\n\nСодержимое файла «${file.name}»:\n${file.text.slice(0, 12000)}`;
    } else {
      parts[0].text += `\n\nФайл «${file.name}» прикреплён, но это не текст, не PDF и не картинка. Содержимое прочитать нельзя.`;
    }
  }
  return rich ? parts : parts[0].text;
}

function shopNow(shop) {
  return typeof shop === "function" ? shop() : shop;
}

function textOf(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function readArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  if (!raw) return {};
  return JSON.parse(String(raw));
}

async function runTool(call, shop) {
  const name = call?.function?.name || call?.name || "";
  const tool = getTool(name);
  if (!tool) return JSON.stringify({ error: `Функция «${name}» не зарегистрирована.` });
  try {
    const args = readArgs(call.function?.arguments);
    const result = await tool.run(args, shopNow(shop));
    return typeof result === "string" ? result : JSON.stringify(result ?? {});
  } catch {
    return JSON.stringify({ error: `Не удалось выполнить «${name}».` });
  }
}

async function complete(messages, withTools) {
  const body = { messages };
  if (withTools && listTools().length) body.tools = listTools();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ChatError(data.error || String(response.status), response.status);
  if (!data.message && typeof data.reply === "string") return { role: "assistant", content: data.reply };
  if (!data.message) throw new ChatError("empty", response.status);
  return data.message;
}

export async function ask({ text, attachments = [], shop, onStatus }) {
  history.push({ role: "user", content: messageContent(text, attachments) });
  const messages = [{ role: "system", content: SYSTEM }, ...history.slice(-12)];
  try {
    for (let round = 0; round < 4; round += 1) {
      const message = await complete(messages, true);
      const calls = asList(message.tool_calls).filter((call) => call?.function?.name || call?.name);
      if (!calls.length) {
        const reply = textOf(message.content);
        if (!reply) throw new ChatError("empty", 502);
        history.push({ role: "assistant", content: reply });
        if (history.length > 12) history.splice(0, history.length - 12);
        return { text: reply };
      }
      if (onStatus) onStatus("Смотрю…");
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: call.function?.name || call.name,
            arguments: typeof call.function?.arguments === "string" ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}),
          },
        })),
      });
      for (const call of calls) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: await runTool(call, shop),
        });
      }
    }
    const message = await complete(messages, false);
    const reply = textOf(message.content);
    if (!reply) throw new ChatError("empty", 502);
    history.push({ role: "assistant", content: reply });
    if (history.length > 12) history.splice(0, history.length - 12);
    return { text: reply };
  } catch (error) {
    history.pop();
    throw error;
  }
}
