const listEl = document.getElementById("admin-list");
const modal = document.getElementById("modal");
const form = document.getElementById("product-form");
const titleEl = document.getElementById("modal-title");
const photoInput = document.getElementById("product-photo");
const photoDrop = document.getElementById("photo-drop");
let draftPhoto = "";

const ordersList = document.getElementById("orders-list");
const clientsList = document.getElementById("clients-list");
const tabProducts = document.getElementById("tab-products");
const tabOrders = document.getElementById("tab-orders");
const tabClients = document.getElementById("tab-clients");
const createButton = document.getElementById("open-create");

function clientOrderStats(phone) {
  const key = phoneKey(phone);
  const orders = getOrders()
    .filter((order) => phoneKey(order.customerPhone) === key)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const last = orders[0];
  return {
    count: orders.length,
    lastAt: last ? last.createdAt : "",
    lastProduct: last ? last.productName : "",
  };
}

function statusOptions(current) {
  return ORDER_STATUSES.map(
    (status) =>
      `<option value="${status.id}"${status.id === current ? " selected" : ""}>${status.label}</option>`
  ).join("");
}

function formatPhone(phone) {
  const key = phoneKey(phone);
  if (key.length === 11 && key.startsWith("7")) {
    return `+7 ${key.slice(1, 4)} ${key.slice(4, 7)} ${key.slice(7, 9)} ${key.slice(9)}`;
  }
  return String(phone || "");
}

function orderCountLabel(count) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return `${count} заказов`;
  if (last === 1) return `${count} заказ`;
  if (last >= 2 && last <= 4) return `${count} заказа`;
  return `${count} заказов`;
}

function uniqueClients(clients) {
  const seen = new Set();
  return clients.filter((client) => {
    const key = phoneKey(client.phone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderItemRows(order) {
  const rows = Array.isArray(order.items) && order.items.length
    ? order.items
    : [{ productName: order.productName, price: order.price, currency: order.currency, type: order.type, qty: 1 }];
  return rows
    .map((item) => {
      const qty = Number(item.qty) > 1 ? ` × ${item.qty}` : "";
      return `<p class="order-line"><strong>${escapeHtml(item.productName)}${qty}</strong><span>${formatPrice(item.price, item.currency)} · ${typeLabel(item.type)}</span></p>`;
    })
    .join("");
}

function renderOrders() {
  const orders = getOrders();
  if (tabOrders) tabOrders.textContent = orders.length ? `Заказы · ${orders.length}` : "Заказы";
  if (!ordersList) return;
  if (!orders.length) {
    ordersList.innerHTML = `<p class="orders-empty">Заказов пока нет. Они появятся, когда клиент укажет имя и телефон и перейдёт в WhatsApp или Telegram.</p>`;
    return;
  }
  ordersList.innerHTML = orders
    .map((order) => {
      const status = order.status || "new";
      return `
      <article class="order-card" data-status="${escapeHtml(status)}">
        <div class="card-top">
          <p class="card-kicker">Клиент</p>
          <h3>${escapeHtml(order.customerName)}</h3>
          <p class="order-meta"><a href="tel:${escapeHtml(order.customerPhone)}">${escapeHtml(formatPhone(order.customerPhone))}</a></p>
        </div>
        <div class="card-product">
          <p class="card-kicker">Заказ</p>
          ${orderItemRows(order)}
        </div>
        <p class="order-foot">${channelLabel(order.channel)} · ${escapeHtml(formatWhen(order.createdAt))}</p>
        <label>
          Статус
          <select class="order-status" data-status="${escapeHtml(status)}" data-order-status="${order.id}">
            ${statusOptions(status)}
          </select>
        </label>
        <button type="button" class="btn danger" data-order-delete="${order.id}">Удалить</button>
      </article>`;
    })
    .join("");
}

function renderClients() {
  const clients = uniqueClients(getClients());
  if (tabClients) tabClients.textContent = clients.length ? `Клиенты · ${clients.length}` : "Клиенты";
  if (!clientsList) return;
  if (!clients.length) {
    clientsList.innerHTML = `<p class="orders-empty">Клиентов пока нет. Один телефон — одна карточка, даже если заказов несколько.</p>`;
    return;
  }
  clientsList.innerHTML = clients
    .map((client) => {
      const stats = clientOrderStats(client.phone);
      const lastLine = stats.lastProduct
        ? `${escapeHtml(stats.lastProduct)}${stats.lastAt ? ` · ${escapeHtml(formatWhen(stats.lastAt))}` : ""}`
        : "Заказов пока нет";
      const countLabel = orderCountLabel(stats.count);
      return `
      <article class="client-card">
        <div class="card-top">
          <p class="card-kicker">Клиент</p>
          <h3>${escapeHtml(client.name)}</h3>
          <p class="order-meta"><a href="tel:${escapeHtml(client.phone)}">${escapeHtml(formatPhone(client.phone))}</a></p>
        </div>
        <p class="count-pill">${countLabel}</p>
        <p class="order-foot">${lastLine}</p>
      </article>`;
    })
    .join("");
}

function setTab(button, active) {
  if (!button) return;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-selected", String(active));
}

function showTab(name) {
  const products = name === "products";
  const orders = name === "orders";
  const clients = name === "clients";
  listEl.hidden = !products;
  if (ordersList) ordersList.hidden = !orders;
  if (clientsList) clientsList.hidden = !clients;
  if (createButton) createButton.hidden = !products;
  setTab(tabProducts, products);
  setTab(tabOrders, orders);
  setTab(tabClients, clients);
  if (orders) renderOrders();
  if (clients) renderClients();
}

function renderAdmin() {
  const items = getProducts();
  listEl.innerHTML = items
    .map(
      (item) => `
      <article class="product-card">
        <img src="${item.photo}" alt="" />
        <div class="product-body">
          <div class="badges">
            <span>${typeLabel(item.type)}</span>
            <span>Кол-во: ${item.qty}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="price">${formatPrice(item.price, item.currency)}</p>
          <p class="desc">${escapeHtml(item.description || "")}</p>
          <div class="card-actions">
            <button type="button" class="btn ghost" data-edit="${item.id}">Изменить</button>
            <button type="button" class="btn danger" data-delete="${item.id}">Удалить</button>
          </div>
        </div>
      </article>`
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openModal(item) {
  form.reset();
  document.getElementById("product-currency").value = "RUB";
  document.getElementById("product-type").value = "product";
  document.getElementById("product-qty").value = "1";
  draftPhoto = "";
  photoDrop.textContent = "Выбрать файл";
  if (item) {
    titleEl.textContent = "Изменить товар";
    document.getElementById("product-id").value = item.id;
    document.getElementById("product-name").value = item.name;
    document.getElementById("product-price").value = item.price;
    document.getElementById("product-currency").value = item.currency;
    document.getElementById("product-qty").value = item.qty;
    document.getElementById("product-type").value = item.type;
    document.getElementById("product-desc").value = item.description || "";
    draftPhoto = item.photo || "";
    if (draftPhoto) photoDrop.textContent = "Фото выбрано";
  } else {
    titleEl.textContent = "Новый товар";
    document.getElementById("product-id").value = "";
  }
  modal.hidden = false;
  document.getElementById("product-name").focus();
}

function closeModal() {
  modal.hidden = true;
}

document.getElementById("open-create").addEventListener("click", () => openModal(null));
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});

photoDrop.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    draftPhoto = String(reader.result || "");
    photoDrop.textContent = file.name;
  };
  reader.readAsDataURL(file);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.getElementById("product-id").value;
  const next = {
    id: id || `p${Date.now()}`,
    name: document.getElementById("product-name").value.trim(),
    price: Number(document.getElementById("product-price").value),
    currency: document.getElementById("product-currency").value,
    qty: Number(document.getElementById("product-qty").value),
    type: document.getElementById("product-type").value,
    description: document.getElementById("product-desc").value.trim(),
    photo: draftPhoto || cover("#3a3a3a", "#161616", "Фото"),
  };
  const items = getProducts();
  const index = items.findIndex((item) => item.id === next.id);
  if (index >= 0) items[index] = next;
  else items.unshift(next);
  saveProducts(items);
  closeModal();
  renderAdmin();
});

listEl.addEventListener("click", (event) => {
  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (editId) {
    const item = getProducts().find((entry) => entry.id === editId);
    if (item) openModal(item);
  }
  if (deleteId) {
    saveProducts(getProducts().filter((entry) => entry.id !== deleteId));
    renderAdmin();
  }
});

if (tabProducts) tabProducts.addEventListener("click", () => showTab("products"));
if (tabOrders) tabOrders.addEventListener("click", () => showTab("orders"));
if (tabClients) tabClients.addEventListener("click", () => showTab("clients"));

if (ordersList) {
  ordersList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-order-status]");
    if (!select) return;
    const previous = select.dataset.status || "new";
    try {
      await updateOrder(select.dataset.orderStatus, { status: select.value });
      select.dataset.status = select.value;
    } catch {
      select.value = previous;
    }
  });
  ordersList.addEventListener("click", async (event) => {
    const deleteId = event.target.closest("[data-order-delete]")?.dataset.orderDelete;
    if (!deleteId) return;
    if (!window.confirm("Удалить этот заказ? Клиент останется, если у него есть другие заказы.")) return;
    try {
      await removeOrder(deleteId);
      renderOrders();
      renderClients();
    } catch {
      renderOrders();
    }
  });
}

async function pullCrm() {
  const changed = await refreshOrders();
  if (!changed) return;
  renderOrders();
  renderClients();
}

shopReady.then(() => {
  renderAdmin();
  return pullCrm();
}).catch(() => {
  syncClientsFromOrders();
  renderOrders();
  renderClients();
});
setInterval(() => {
  pullCrm().catch(() => {});
}, 4000);
