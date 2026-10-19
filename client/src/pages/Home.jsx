import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartModal } from "../components/CartModal.jsx";
import { ChatWidget } from "../components/ChatWidget.jsx";
import { OrderModal } from "../components/OrderModal.jsx";
import { ProductForm } from "../components/ProductForm.jsx";
import { formatPrice, SHOP_PHONE, typeLabel } from "../lib/catalog.js";
import { useShop } from "../shop-context.jsx";

export function Home() {
  const { products, lines, count, toast, ready, addToCart, saveProduct } = useShop();
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [order, setOrder] = useState(null);
  const [editing, setEditing] = useState(undefined);

  useEffect(() => {
    document.title = "Иван — Software engineer";
    document.body.classList.remove("admin-body");
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (order) setOrder(null);
      else if (cartOpen) setCartOpen(false);
      else if (editing !== undefined) setEditing(undefined);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, cartOpen, editing]);

  const needle = query.trim().toLowerCase();
  const visible = products.filter((item) => {
    if (!needle) return true;
    return `${item.name} ${item.description || ""}`.toLowerCase().includes(needle);
  });
  const inCart = new Map(lines.map((line) => [line.id, line.qty]));
  const label = count ? `Корзина · ${count}` : "Корзина";

  function orderOne(item) {
    if (Number(item.qty) < 1) return;
    setOrder({ lines: [{ ...item, qty: 1 }], fromCart: false });
  }

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <header className="nav">
        <a className="mark" href="#top">
          И.
        </a>
        <nav>
          <a href="#shop">Товары</a>
          <a href="#work">Работа</a>
          <a href="#skills">Навыки</a>
          <a href="#contact">Контакт</a>
          <Link to="/admin">Админка</Link>
          <button className={`nav-cart${count ? " has-items" : ""}`} type="button" onClick={() => setCartOpen(true)}>
            {label}
          </button>
        </nav>
      </header>
      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Сайт-визитка · Software engineer</p>
            <h1>Иван</h1>
            <p className="lead">
              Пишу код, который держит нагрузку и читается через год. Веб, сервисы, автоматизация — без лишнего шума.
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="#contact">
                Написать
              </a>
              <a className="btn ghost" href="#work">
                Что делаю
              </a>
            </div>
            <dl className="meta">
              <div>
                <dt>Роль</dt>
                <dd>Software engineer</dd>
              </div>
              <div>
                <dt>Формат</dt>
                <dd>Проекты и консультации</dd>
              </div>
              <div>
                <dt>Язык</dt>
                <dd>Русский · English</dd>
              </div>
            </dl>
          </div>
          <figure className="hero-visual">
            <img src="/porsche.jpg" alt="Porsche 964 Singer, вид сзади" width="1600" height="900" />
          </figure>
        </section>

        <section id="work" className="block">
          <header className="block-head">
            <h2>Чем занимаюсь</h2>
            <p>Коротко, без портфолио на десять экранов.</p>
          </header>
          <div className="cards">
            <article className="card">
              <span className="idx">01</span>
              <h3>Веб и интерфейсы</h3>
              <p>Лендинги, кабинеты, внутренние инструменты. Чистая вёрстка, понятная навигация, быстрая загрузка.</p>
            </article>
            <article className="card">
              <span className="idx">02</span>
              <h3>Сервисы и API</h3>
              <p>Backend, интеграции, данные. Стабильные эндпоинты и понятная структура проекта.</p>
            </article>
            <article className="card">
              <span className="idx">03</span>
              <h3>Автоматизация</h3>
              <p>Скрипты и пайплайны, которые снимают рутину: сборки, отчёты, ручные шаги в процессе.</p>
            </article>
          </div>
        </section>

        <section id="skills" className="block skills">
          <header className="block-head">
            <h2>Стек</h2>
            <p>То, с чем работаю каждый день.</p>
          </header>
          <ul className="tags">
            {["JavaScript", "TypeScript", "Python", "HTML / CSS", "React", "Node.js", "REST API", "Git"].map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </section>

        <section id="shop" className="block">
          <header className="block-head shop-head">
            <div>
              <h2>Товары</h2>
              <p>Соберите корзину и оформите заказ: имя, телефон, затем WhatsApp или Telegram.</p>
            </div>
            <div className="shop-actions">
              <button className={`btn ghost${count ? " has-items" : ""}`} type="button" onClick={() => setCartOpen(true)}>
                {label}
              </button>
              <button className="btn primary" type="button" onClick={() => setEditing(null)}>
                + Новый товар
              </button>
            </div>
          </header>
          <input
            className="catalog-search"
            type="search"
            placeholder="Найти по названию или описанию"
            autoComplete="off"
            aria-label="Поиск товара"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="product-grid">
            {!ready ? (
              <p className="catalog-empty">Загрузка каталога…</p>
            ) : visible.length === 0 ? (
              <p className="catalog-empty">Ничего не нашлось. Попробуйте другое слово.</p>
            ) : (
              visible.map((item) => {
                const picked = inCart.get(item.id) || 0;
                const available = Number(item.qty) > 0;
                return (
                  <article className="product-card" key={item.id}>
                    <img src={item.photo} alt="" />
                    <div className="product-body">
                      <div className="badges">
                        <span>{typeLabel(item.type)}</span>
                        <span>{available ? `Кол-во: ${item.qty}` : "Нет в наличии"}</span>
                      </div>
                      <h3>{item.name}</h3>
                      <p className="price">{formatPrice(item.price, item.currency)}</p>
                      <p className="desc">{item.description}</p>
                      <div className="card-actions">
                        <button className="btn ghost" type="button" onClick={() => setEditing(item)}>
                          Изменить
                        </button>
                        <button className="btn ghost" type="button" disabled={!available} onClick={() => addToCart(item.id)}>
                          {picked ? `В корзине · ${picked}` : "В корзину"}
                        </button>
                        <button className="btn primary" type="button" disabled={!available} onClick={() => orderOne(item)}>
                          Заказать
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section id="contact" className="block contact">
          <header className="block-head">
            <h2>Связаться</h2>
            <p>Опишите задачу в паре абзацев — отвечу по сути.</p>
          </header>
          <div className="contact-grid">
            <a className="contact-card" href={`https://wa.me/${SHOP_PHONE}`} target="_blank" rel="noreferrer">
              <span>WhatsApp</span>
              <strong>+7 777 422 2256</strong>
            </a>
            <a className="contact-card" href="mailto:ivan@example.com">
              <span>Почта</span>
              <strong>ivan@example.com</strong>
            </a>
            <a className="contact-card" href="https://t.me/username" target="_blank" rel="noreferrer">
              <span>Telegram</span>
              <strong>@username</strong>
            </a>
            <a className="contact-card" href="https://github.com/username" target="_blank" rel="noreferrer">
              <span>GitHub</span>
              <strong>github.com/username</strong>
            </a>
          </div>
        </section>
      </main>
      <footer>
        <p>© {new Date().getFullYear()} Иван. Сайт-визитка.</p>
        <a href="#top">Наверх</a>
      </footer>
      {toast ? <p className="toast">{toast}</p> : null}
      {cartOpen ? (
        <CartModal
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            if (!lines.length) return;
            setCartOpen(false);
            setOrder({ lines, fromCart: true });
          }}
        />
      ) : null}
      {order ? <OrderModal lines={order.lines} fromCart={order.fromCart} onClose={() => setOrder(null)} /> : null}
      {editing !== undefined ? (
        <ProductForm
          product={editing}
          onClose={() => setEditing(undefined)}
          onSave={async (item) => {
            try {
              await saveProduct(item);
              setEditing(undefined);
            } catch {
              /* сообщение уже показано */
            }
          }}
        />
      ) : null}
      <ChatWidget />
    </>
  );
}
