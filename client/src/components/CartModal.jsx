import { formatPrice } from "../lib/catalog.js";
import { useShop } from "../shop-context.jsx";

export function CartModal({ onClose, onCheckout }) {
  const { lines, changeQty } = useShop();
  const currencies = new Set(lines.map((line) => line.currency));

  return (
    <div className="modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <header className="modal-head">
          <h2 id="cart-title">Корзина</h2>
          <button className="icon-x" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="cart-body">
          {lines.length === 0 ? (
            <p className="cart-empty">Корзина пуста. Добавьте товар кнопкой «В корзину».</p>
          ) : (
            lines.map((line) => (
              <div className="cart-line" key={line.id}>
                <div>
                  <strong>{line.name}</strong>
                  <span>{formatPrice(line.price, line.currency)}</span>
                </div>
                <div className="cart-qty">
                  <button type="button" aria-label="Меньше" onClick={() => changeQty(line.id, line.qty - 1)}>
                    −
                  </button>
                  <span>{line.qty}</span>
                  <button type="button" aria-label="Больше" onClick={() => changeQty(line.id, line.qty + 1)}>
                    +
                  </button>
                  <button type="button" onClick={() => changeQty(line.id, 0)}>
                    Убрать
                  </button>
                </div>
              </div>
            ))
          )}
          {currencies.size > 1 ? (
            <p className="cart-note">Позиции в разных валютах, общая сумма не считается.</p>
          ) : null}
        </div>
        <button className="btn primary form-submit" type="button" disabled={lines.length === 0} onClick={onCheckout}>
          Оформить заказ
        </button>
      </div>
    </div>
  );
}
