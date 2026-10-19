import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ProductForm } from "../components/ProductForm.jsx";
import {
  ORDER_STATUSES,
  channelLabel,
  formatPhone,
  formatPrice,
  formatWhen,
  orderCountLabel,
  phoneKey,
  typeLabel,
} from "../lib/catalog.js";
import { downloadInvoice, getOrders, loadClients, refreshOrders, removeOrder, syncClientsFromOrders, updateOrder } from "../lib/crm.js";
import { useShop } from "../shop-context.jsx";

function orderRows(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  return [
    {
      productName: order.productName,
      price: order.price,
      currency: order.currency,
      type: order.type,
      qty: 1,
    },
  ];
}

export function Admin() {
  const { products, ready, saveProduct, deleteProduct } = useShop();
  const [tab, setTab] = useState("products");
  const [orders, setOrders] = useState(getOrders);
  const [clients, setClients] = useState(loadClients);
  const [editing, setEditing] = useState(undefined);
  const [invoiceError, setInvoiceError] = useState("");

  useEffect(() => {
    document.title = "Админка — товары, заказы и клиенты";
    document.body.classList.add("admin-body");
    return () => document.body.classList.remove("admin-body");
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setEditing(undefined);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const changed = await refreshOrders();
        if (stop || !changed) return;
      } catch {
        syncClientsFromOrders();
      }
      if (stop) return;
      setOrders(getOrders());
      setClients(loadClients());
    }
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  async function onStatus(id, status, previous, select) {
    try {
      await updateOrder(id, { status });
      setOrders(getOrders());
      setClients(loadClients());
    } catch {
      select.value = previous;
    }
  }

  async function onInvoice(id) {
    setInvoiceError("");
    try {
      await downloadInvoice(id);
    } catch {
      setInvoiceError("Не удалось сформировать счёт-фактуру. Обновите страницу и попробуйте ещё раз.");
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Удалить этот заказ? Клиент останется, если у него есть другие заказы.")) return;
    try {
      await removeOrder(id);
    } catch {
      /* список обновится следующим опросом */
    }
    setOrders(getOrders());
    setClients(loadClients());
  }

  return (
    <>
      <header className="admin-bar">
        <div className="admin-brand">
          <h1>Админка</h1>
          <div className="admin-tabs" role="tablist">
            <button type="button" className={tab === "products" ? "is-active" : ""} role="tab" aria-selected={tab === "products"} onClick={() => setTab("products")}>
              Товары
            </button>
            <button type="button" className={tab === "orders" ? "is-active" : ""} role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>
              {orders.length ? `Заказы · ${orders.length}` : "Заказы"}
            </button>
            <button type="button" className={tab === "clients" ? "is-active" : ""} role="tab" aria-selected={tab === "clients"} onClick={() => setTab("clients")}>
              {clients.length ? `Клиенты · ${clients.length}` : "Клиенты"}
            </button>
          </div>
        </div>
        {tab === "products" ? (
          <button className="btn primary" type="button" onClick={() => setEditing(null)}>
            + Новый товар
          </button>
        ) : null}
      </header>
      <main className="admin-main">
        {tab === "products" ? (
          <div className="product-grid">
            {!ready ? <p className="orders-empty">Загрузка каталога…</p> : null}
            {products.map((item) => (
              <article className="product-card" key={item.id}>
                <img src={item.photo} alt="" />
                <div className="product-body">
                  <div className="badges">
                    <span>{typeLabel(item.type)}</span>
                    <span>Кол-во: {item.qty}</span>
                  </div>
                  <h3>{item.name}</h3>
                  <p className="price">{formatPrice(item.price, item.currency)}</p>
                  <p className="desc">{item.description}</p>
                  <div className="card-actions">
                    <button className="btn ghost" type="button" onClick={() => setEditing(item)}>
                      Изменить
                    </button>
                    <button className="btn danger" type="button" onClick={() => deleteProduct(item.id).catch(() => {})}>
                      Удалить
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "orders" ? (
          <div className="orders-list">
            {invoiceError ? <p className="orders-empty">{invoiceError}</p> : null}
            {orders.length === 0 ? (
              <p className="orders-empty">
                Заказов пока нет. Они появятся, когда клиент укажет имя и телефон и перейдёт в WhatsApp или Telegram.
              </p>
            ) : (
              orders.map((order) => {
                const status = order.status || "new";
                return (
                  <article className="order-card" data-status={status} key={order.id}>
                    <div className="card-top">
                      <p className="card-kicker">Клиент</p>
                      <h3>{order.customerName}</h3>
                      <p className="order-meta">
                        <a href={`tel:${order.customerPhone}`}>{formatPhone(order.customerPhone)}</a>
                      </p>
                    </div>
                    <div className="card-product">
                      <p className="card-kicker">Заказ</p>
                      {orderRows(order).map((item, index) => (
                        <p className="order-line" key={`${order.id}-${index}`}>
                          <strong>
                            {item.productName}
                            {Number(item.qty) > 1 ? ` × ${item.qty}` : ""}
                          </strong>
                          <span>
                            {formatPrice(item.price, item.currency)} · {typeLabel(item.type)}
                          </span>
                        </p>
                      ))}
                    </div>
                    <p className="order-foot">
                      {channelLabel(order.channel)} · {formatWhen(order.createdAt)}
                    </p>
                    <label>
                      Статус
                      <select
                        className="order-status"
                        defaultValue={status}
                        key={`${order.id}-${status}`}
                        onChange={(event) => onStatus(order.id, event.target.value, status, event.target)}
                      >
                        {ORDER_STATUSES.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="card-actions">
                      <button className="btn primary" type="button" onClick={() => onInvoice(order.id)}>
                        Счёт-фактура
                      </button>
                      <button className="btn danger" type="button" onClick={() => onDelete(order.id)}>
                        Удалить
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : null}
        {tab === "clients" ? (
          <div className="clients-list">
            {clients.length === 0 ? (
              <p className="orders-empty">Клиентов пока нет. Один телефон — одна карточка, даже если заказов несколько.</p>
            ) : (
              clients.map((client) => {
                const key = phoneKey(client.phone);
                const related = orders
                  .filter((order) => phoneKey(order.customerPhone) === key)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                const last = related[0];
                return (
                  <article className="client-card" key={client.id}>
                    <div className="card-top">
                      <p className="card-kicker">Клиент</p>
                      <h3>{client.name}</h3>
                      <p className="order-meta">
                        <a href={`tel:${client.phone}`}>{formatPhone(client.phone)}</a>
                      </p>
                    </div>
                    <p className="count-pill">{orderCountLabel(related.length)}</p>
                    <p className="order-foot">
                      {last ? `${last.productName}${last.createdAt ? ` · ${formatWhen(last.createdAt)}` : ""}` : "Заказов пока нет"}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        ) : null}
      </main>
      <p className="admin-foot">
        <Link to="/">На сайт</Link>
      </p>
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
    </>
  );
}
