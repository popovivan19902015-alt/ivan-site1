import { useState } from "react";
import { formatPrice, telegramUrl, typeLabel, whatsappUrl } from "../lib/catalog.js";
import { addOrder } from "../lib/crm.js";
import { useShop } from "../shop-context.jsx";

export function OrderModal({ lines, fromCart, onClose }) {
  const { products, applyShop } = useShop();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [chat, setChat] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const channel = event.nativeEvent.submitter?.dataset.channel;
    if (channel !== "whatsapp" && channel !== "telegram") return;
    const fresh = lines.every((line) => {
      const product = products.find((item) => item.id === line.id);
      return product && Number(product.qty) >= line.qty;
    });
    if (!fresh) {
      setError("Часть товаров уже закончилась. Проверьте корзину.");
      return;
    }
    const customerName = name.trim();
    const digits = phone.replace(/\D/g, "");
    if (customerName.length < 2) {
      setError("Укажите имя");
      return;
    }
    if (digits.length < 10 || digits.length > 15) {
      setError("Укажите номер телефона");
      return;
    }
    const customerPhone = phone.trim().startsWith("+") ? `+${digits}` : digits;
    const customer = { name: customerName, phone: customerPhone };
    const bundle = {
      name: lines.map((line) => line.name).join(", "),
      price: lines[0].price,
      currency: lines[0].currency,
      type: lines[0].type,
      items: lines,
    };
    const url = channel === "telegram" ? telegramUrl(bundle, customer) : whatsappUrl(bundle, customer);
    const popup = window.open("about:blank", "_blank");
    setPending(true);
    setError("");
    try {
      const saved = await addOrder({
        customerName,
        customerPhone,
        channel,
        fromCart,
        productId: lines[0].id,
        productName: lines.map((line) => (line.qty > 1 ? `${line.name} × ${line.qty}` : line.name)).join(", "),
        price: lines[0].price,
        currency: lines[0].currency,
        type: lines[0].type,
        items: lines.map((line) => ({
          productId: line.id,
          productName: line.name,
          price: line.price,
          currency: line.currency,
          type: line.type,
          qty: line.qty,
        })),
      });
      if (!saved.order) throw new Error("save");
      applyShop(saved);
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      setError(error?.status === 409 ? "Часть товаров уже закончилась. Проверьте корзину." : "Не удалось сохранить заказ. Повторите ещё раз.");
      setPending(false);
      return;
    }
    setPending(false);
    if (popup && !popup.closed) {
      try {
        popup.location.replace(url);
      } catch {
        try {
          popup.close();
        } catch {
          /* вкладка уже закрыта */
        }
      }
    }
    setChat({ url, channel });
  }

  return (
    <div className="modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <header className="modal-head">
          <h2 id="order-title">Оформление заказа</h2>
          <button className="icon-x" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <form className="stack-form" onSubmit={submit}>
          <p className="order-summary">
            {lines.map((line) => (
              <span key={line.id}>
                <strong>
                  {line.name}
                  {line.qty > 1 ? ` × ${line.qty}` : ""}
                </strong>
                <span>
                  {formatPrice(line.price, line.currency)} · {typeLabel(line.type)}
                </span>
              </span>
            ))}
          </p>
          <label>
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" autoFocus />
          </label>
          <label>
            Номер телефона
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7"
            />
          </label>
          {error ? <p className="cart-note">{error}</p> : null}
          {chat ? (
            <p className="cart-note">
              Заказ сохранён. Если чат не открылся сам, нажмите кнопку ниже.
            </p>
          ) : null}
          <div className="order-channels">
            {chat ? (
              <a className="btn primary" href={chat.url} target="_blank" rel="noreferrer">
                {chat.channel === "telegram" ? "Открыть Telegram" : "Открыть WhatsApp"}
              </a>
            ) : (
              <>
                <button className="btn primary" type="submit" data-channel="whatsapp" disabled={pending}>
                  WhatsApp
                </button>
                <button className="btn telegram" type="submit" data-channel="telegram" disabled={pending}>
                  Telegram
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
