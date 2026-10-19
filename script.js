const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

const catalog = document.getElementById("catalog");
const catalogSearch = document.getElementById("catalog-search");
const modal = document.getElementById("modal");
const form = document.getElementById("product-form");
const photoInput = document.getElementById("product-photo");
const photoDrop = document.getElementById("photo-drop");
let draftPhoto = "";
let catalogQuery = "";
let toastTimer = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(text) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function renderCatalog() {
  if (!catalog) return;
  const query = catalogQuery.trim().toLowerCase();
  const items = getProducts().filter((item) => {
    if (!query) return true;
    return `${item.name} ${item.description || ""}`.toLowerCase().includes(query);
  });
  if (!items.length) {
    catalog.innerHTML = `<p class="catalog-empty">Ничего не нашлось. Попробуйте другое слово.</p>`;
    return;
  }
  const inCart = new Map(cartLines().map((line) => [line.id, line.qty]));
  catalog.innerHTML = items
    .map((item) => {
      const picked = inCart.get(item.id) || 0;
      const cartLabel = picked ? `В корзине · ${picked}` : "В корзину";
      return `
      <article class="product-card">
        <img src="${item.photo}" alt="" />
        <div class="product-body">
          <div class="badges">
            <span>${typeLabel(item.type)}</span>
            <span>${Number(item.qty) > 0 ? `Кол-во: ${item.qty}` : "Нет в наличии"}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          <p class="price">${formatPrice(item.price, item.currency)}</p>
          <p class="desc">${escapeHtml(item.description || "")}</p>
          <div class="card-actions">
            <button type="button" class="btn ghost" data-edit="${item.id}">Изменить</button>
            <button type="button" class="btn ghost" data-cart="${item.id}"${Number(item.qty) > 0 ? "" : " disabled"}>${cartLabel}</button>
            <button type="button" class="btn primary" data-order="${item.id}"${Number(item.qty) > 0 ? "" : " disabled"}>Заказать</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function openModal(item) {
  if (!modal || !form) return;
  form.reset();
  document.getElementById("product-currency").value = "RUB";
  document.getElementById("product-type").value = "product";
  document.getElementById("product-qty").value = "1";
  draftPhoto = "";
  photoDrop.textContent = "Выбрать файл";
  if (item) {
    document.getElementById("modal-title").textContent = "Изменить товар";
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
    document.getElementById("modal-title").textContent = "Новый товар";
    document.getElementById("product-id").value = "";
  }
  modal.hidden = false;
  document.getElementById("product-name").focus();
}

function closeModal() {
  if (modal) modal.hidden = true;
}

if (catalog && modal && form) {
  document.getElementById("open-create").addEventListener("click", () => openModal(null));
  document.getElementById("modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (typeof closeOrder === "function" && orderModal && !orderModal.hidden) {
      closeOrder();
      return;
    }
    if (cartModal && !cartModal.hidden) {
      closeCart();
      return;
    }
    if (!modal.hidden) closeModal();
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
    renderCatalog();
  });
  catalog.addEventListener("click", (event) => {
    const cartId = event.target.closest("[data-cart]")?.dataset.cart;
    if (cartId) {
      const before = cartCount();
      addToCart(cartId);
      const added = cartCount() > before;
      const item = getProducts().find((entry) => entry.id === cartId);
      renderCart();
      renderCatalog();
      showToast(added && item ? `${item.name} в корзине` : "Больше этой позиции нет в наличии");
      return;
    }
    const orderId = event.target.closest("[data-order]")?.dataset.order;
    if (orderId) {
      const item = getProducts().find((entry) => entry.id === orderId);
      if (item && Number(item.qty) > 0) openOrder([Object.assign({}, item, { qty: 1 })]);
      return;
    }
    const editId = event.target.closest("[data-edit]")?.dataset.edit;
    if (!editId) return;
    const item = getProducts().find((entry) => entry.id === editId);
    if (item) openModal(item);
  });
  if (catalogSearch) {
    catalogSearch.addEventListener("input", () => {
      catalogQuery = catalogSearch.value;
      renderCatalog();
    });
  }
  shopReady.then(() => renderCatalog());
}

const orderModal = document.getElementById("order-modal");
const orderForm = document.getElementById("order-form");
const orderSummary = document.getElementById("order-summary");
const orderName = document.getElementById("order-name");
const orderPhone = document.getElementById("order-phone");
const cartModal = document.getElementById("cart-modal");
const cartBody = document.getElementById("cart-body");
const cartButton = document.getElementById("open-cart");
const navCart = document.getElementById("nav-cart");
let orderLines = [];
let orderFromCart = false;

function renderCart() {
  const count = cartCount();
  const label = count ? `Корзина · ${count}` : "Корзина";
  [cartButton, navCart].forEach((button) => {
    if (!button) return;
    button.textContent = label;
    button.classList.toggle("has-items", count > 0);
  });
  if (!cartBody) return;
  const lines = cartLines();
  const checkout = document.getElementById("cart-checkout");
  if (checkout) checkout.disabled = lines.length === 0;
  if (!lines.length) {
    cartBody.innerHTML = `<p class="cart-empty">Корзина пуста. Добавьте товар кнопкой «В корзину».</p>`;
    return;
  }
  const currencies = new Set(lines.map((line) => line.currency));
  const note =
    currencies.size > 1
      ? `<p class="cart-note">Позиции в разных валютах, общая сумма не считается.</p>`
      : "";
  cartBody.innerHTML =
    lines
      .map(
        (line) => `
      <div class="cart-line">
        <div>
          <strong>${escapeHtml(line.name)}</strong>
          <span>${formatPrice(line.price, line.currency)}</span>
        </div>
        <div class="cart-qty">
          <button type="button" data-cart-dec="${line.id}" aria-label="Меньше">−</button>
          <span>${line.qty}</span>
          <button type="button" data-cart-inc="${line.id}" aria-label="Больше">+</button>
          <button type="button" data-cart-remove="${line.id}">Убрать</button>
        </div>
      </div>`
      )
      .join("") + note;
}

function openCart() {
  if (!cartModal) return;
  renderCart();
  cartModal.hidden = false;
}

function closeCart() {
  if (cartModal) cartModal.hidden = true;
}

function closeOrder() {
  if (orderModal) orderModal.hidden = true;
  orderLines = [];
  orderFromCart = false;
}

function openOrder(lines, fromCart) {
  const list = (Array.isArray(lines) ? lines : []).filter((line) => line && Number(line.qty) > 0);
  if (!orderModal || !orderForm || !orderSummary || !list.length) return;
  orderLines = list.map((line) => ({
    id: line.id,
    name: line.name,
    price: line.price,
    currency: line.currency,
    type: line.type,
    qty: Number(line.qty) || 1,
  }));
  orderFromCart = Boolean(fromCart);
  orderForm.reset();
  if (orderName) orderName.setCustomValidity("");
  if (orderPhone) orderPhone.setCustomValidity("");
  orderSummary.innerHTML = orderLines
    .map(
      (line) =>
        `<strong>${escapeHtml(line.name)}${line.qty > 1 ? ` × ${line.qty}` : ""}</strong><span>${formatPrice(line.price, line.currency)} · ${typeLabel(line.type)}</span>`
    )
    .join("");
  orderModal.hidden = false;
  if (orderName) orderName.focus();
}

if (orderModal && orderForm && orderName && orderPhone) {
  document.getElementById("order-close").addEventListener("click", closeOrder);
  orderModal.addEventListener("click", (event) => {
    if (event.target === orderModal) closeOrder();
  });
  orderName.addEventListener("input", () => orderName.setCustomValidity(""));
  orderPhone.addEventListener("input", () => orderPhone.setCustomValidity(""));
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!orderLines.length) return;
    const channel = event.submitter && event.submitter.dataset.channel;
    if (channel !== "whatsapp" && channel !== "telegram") return;
    const fresh = orderLines.filter((line) => {
      const product = getProducts().find((item) => item.id === line.id);
      return product && Number(product.qty) >= line.qty;
    });
    if (fresh.length !== orderLines.length) {
      orderPhone.setCustomValidity("Часть товаров уже закончилась. Проверьте корзину.");
      orderForm.reportValidity();
      orderPhone.setCustomValidity("");
      return;
    }
    const name = orderName.value.trim();
    const digits = orderPhone.value.replace(/\D/g, "");
    orderName.setCustomValidity(name.length < 2 ? "Укажите имя" : "");
    orderPhone.setCustomValidity(digits.length < 10 || digits.length > 15 ? "Укажите номер телефона" : "");
    if (!orderForm.reportValidity()) return;
    const phone = orderPhone.value.trim().startsWith("+") ? `+${digits}` : digits;
    const customer = { name, phone };
    const bundle = {
      name: orderLines.map((line) => line.name).join(", "),
      price: orderLines[0].price,
      currency: orderLines[0].currency,
      type: orderLines[0].type,
      items: orderLines,
    };
    const url = channel === "telegram" ? telegramUrl(bundle, customer) : whatsappUrl(bundle, customer);
    const popup = window.open("about:blank", "_blank");
    const buttons = orderForm.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await addOrder({
        customerName: name,
        customerPhone: phone,
        channel,
        productId: orderLines[0].id,
        productName: orderLines.map((line) => (line.qty > 1 ? `${line.name} × ${line.qty}` : line.name)).join(", "),
        price: orderLines[0].price,
        currency: orderLines[0].currency,
        type: orderLines[0].type,
        fromCart: orderFromCart,
        items: orderLines.map((line) => ({
          productId: line.id,
          productName: line.name,
          price: line.price,
          currency: line.currency,
          type: line.type,
          qty: line.qty,
        })),
      });
      renderCatalog();
      renderCart();
    } catch {
      if (popup && !popup.closed) popup.close();
      orderPhone.setCustomValidity("Не удалось сохранить заказ. Повторите ещё раз.");
      orderForm.reportValidity();
      orderPhone.setCustomValidity("");
      return;
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
    if (popup && !popup.closed) {
      try {
        popup.location.replace(url);
      } catch {
        try {
          popup.close();
        } catch {
          /* вкладка уже закрыта */
        }
        window.location.assign(url);
      }
    } else {
      window.location.assign(url);
    }
    closeOrder();
  });
}

if (cartButton) cartButton.addEventListener("click", openCart);
if (navCart) navCart.addEventListener("click", openCart);
if (cartModal && cartBody) {
  document.getElementById("cart-close").addEventListener("click", closeCart);
  cartModal.addEventListener("click", (event) => {
    if (event.target === cartModal) closeCart();
  });
  cartBody.addEventListener("click", (event) => {
    const dec = event.target.closest("[data-cart-dec]")?.dataset.cartDec;
    const inc = event.target.closest("[data-cart-inc]")?.dataset.cartInc;
    const removeId = event.target.closest("[data-cart-remove]")?.dataset.cartRemove;
    if (dec) {
      const current = cartLines().find((line) => line.id === dec);
      setCartQty(dec, (current ? current.qty : 1) - 1);
    }
    if (inc) addToCart(inc);
    if (removeId) setCartQty(removeId, 0);
    if (dec || inc || removeId) {
      renderCart();
      renderCatalog();
    }
  });
  document.getElementById("cart-checkout").addEventListener("click", () => {
    const lines = cartLines();
    if (!lines.length) return;
    closeCart();
    openOrder(lines, true);
  });
}
shopReady.then(() => renderCart());

const chatPanel = document.getElementById("chat-panel");
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatOpen = document.getElementById("chat-open");

const chatPlus = document.getElementById("chat-plus");
const chatFile = document.getElementById("chat-file");
const chatAttach = document.getElementById("chat-attach");
let pendingFiles = [];

if (chatPanel && chatLog && chatForm && chatInput && chatOpen) {
  const consultant = "Иван";
  const thread = [];

  function bindResize(handle, axis) {
    if (!handle) return;
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const start = axis === "x" ? event.clientX : event.clientY;
      const startSize = axis === "x" ? chatPanel.offsetWidth : chatPanel.offsetHeight;
      const min = axis === "x" ? 280 : 320;
      const max = axis === "x" ? window.innerWidth - 40 : window.innerHeight - 90;
      function move(moveEvent) {
        const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
        const next = Math.min(max, Math.max(min, startSize + (start - current)));
        chatPanel.style[axis === "x" ? "width" : "height"] = `${next}px`;
      }
      function stop() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    });
  }

  bindResize(document.getElementById("chat-resize-x"), "x");
  bindResize(document.getElementById("chat-resize-y"), "y");

  function addBubble(text, role) {
    const bubble = document.createElement("p");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    chatLog.append(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function showPending() {
    if (!chatAttach) return;
    chatAttach.replaceChildren();
    if (!pendingFiles.length) {
      chatAttach.hidden = true;
      return;
    }
    chatAttach.hidden = false;
    pendingFiles.forEach((file, index) => {
      const row = document.createElement("div");
      row.textContent = file.name;
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "убрать";
      clear.addEventListener("click", () => {
        pendingFiles.splice(index, 1);
        if (chatFile) chatFile.value = "";
        showPending();
      });
      row.append(clear);
      chatAttach.append(row);
    });
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  function looksBinary(text) {
    if (text.includes("\u0000")) return true;
    const sample = text.slice(0, 2000);
    let ctrl = 0;
    for (const ch of sample) {
      const code = ch.charCodeAt(0);
      if (code < 9 || (code > 13 && code < 32)) ctrl += 1;
    }
    return sample.length > 40 && ctrl / sample.length > 0.1;
  }

  async function readTextFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    const broken = (utf8.match(/\uFFFD/g) || []).length;
    if (!broken) return utf8;
    return new TextDecoder("windows-1251").decode(bytes);
  }

  function xmlToText(xml) {
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZipEntries(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return [];
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    const entries = [];
    for (let n = 0; n < count; n += 1) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localOff = view.getUint32(ptr + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const packed = bytes.subarray(dataStart, dataStart + compSize);
      let raw = new Uint8Array();
      if (method === 0) raw = packed;
      else if (method === 8) raw = await inflateRaw(packed);
      entries.push({ name, text: new TextDecoder().decode(raw) });
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readOfficeText(file) {
    const entries = await readZipEntries(file);
    const chunks = [];
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      const useful =
        name === "word/document.xml" ||
        name.startsWith("word/header") ||
        name.startsWith("word/footer") ||
        name === "xl/sharedstrings.xml" ||
        name.startsWith("xl/worksheets/") ||
        name.startsWith("ppt/slides/slide");
      if (!useful) continue;
      const text = xmlToText(entry.text);
      if (text) chunks.push(text);
    }
    return chunks.join("\n\n").slice(0, 12000);
  }

  async function readAttachment(file) {
    const name = file.name || "file";
    const type = file.type || "";
    const image = type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
    if (image) return { kind: "image", name, dataUrl: await readDataUrl(file) };
    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      return { kind: "file", name, dataUrl: await readDataUrl(file) };
    }
    if (/\.(docx|xlsx|pptx)$/i.test(name)) {
      return { kind: "text", name, text: await readOfficeText(file) };
    }
    const text = await readTextFile(file);
    if (looksBinary(text)) {
      return { kind: "text", name, text: "" };
    }
    return { kind: "text", name, text };
  }

  if (chatPlus && chatFile) {
    chatPlus.addEventListener("click", () => chatFile.click());
    chatFile.addEventListener("change", async () => {
      const selected = [...(chatFile.files || [])];
      if (!selected.length) return;
      for (const file of selected) {
        if (file.size > 4 * 1024 * 1024) {
          addBubble(`«${file.name}» больше 4 МБ. Выбери файл поменьше.`, "bot");
          continue;
        }
        try {
          pendingFiles.push(await readAttachment(file));
        } catch {
          addBubble(`Не удалось прочитать «${file.name}».`, "bot");
        }
      }
      chatFile.value = "";
      showPending();
    });
  }

  function productLines() {
    return getProducts()
      .map((item) => `• ${item.name} — ${formatPrice(item.price, item.currency)} (${typeLabel(item.type)}), в наличии: ${Number(item.qty) || 0}`)
      .join("\n");
  }

  function answer(raw) {
    const text = raw.toLowerCase();
    const products = getProducts();
    const words = text.split(/[^a-zа-я0-9×]+/i).filter((word) => word.length > 2);
    const found = products.filter((item) => {
      const haystack = `${item.name} ${item.description || ""}`.toLowerCase();
      return words.some((word) => haystack.includes(word));
    });

    if (/привет|здравств|добрый|хай/.test(text)) {
      return `Здравствуйте, я ${consultant}. Подскажу по товарам, ценам и заказу.`;
    }
    if (/кто ты|как тебя|имя|консультант/.test(text)) {
      return `Меня зовут ${consultant}. Я консультант на этом сайте.`;
    }
    if (/валют|рубл|тенге|доллар/.test(text)) {
      return "Цены указаны в рублях, тенге или долларах. Символ стоит прямо на карточке: ₽, ₸ или $.";
    }
    if (/заказ|whatsapp|ватсап|купить|оформ/.test(text)) {
      return "Добавьте товар в корзину или нажмите «Заказать». Затем укажите имя и телефон и выберите WhatsApp или Telegram. Чат откроется на +7 777 422 2256.";
    }
    if (/товар|каталог|что есть|ассортимент|список|услуг/.test(text) || found.length > 1) {
      return `Сейчас в наличии:\n${productLines()}`;
    }
    if (found.length === 1) {
      const item = found[0];
      return `${item.name}: ${formatPrice(item.price, item.currency)}, ${typeLabel(item.type).toLowerCase()}. ${item.description || ""}`.trim();
    }
    return `Я ${consultant}. Спросите про товары, цену или как оформить заказ.`;
  }

  function openChat() {
    chatPanel.hidden = false;
    if (!chatLog.childElementCount) addBubble(`Здравствуйте, я ${consultant}. Чем помочь?`, "bot");
    chatInput.focus();
  }

  chatOpen.addEventListener("click", openChat);
  document.getElementById("chat-close").addEventListener("click", () => {
    chatPanel.hidden = true;
  });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const typed = chatInput.value.trim();
    if (!typed && !pendingFiles.length) return;
    const files = pendingFiles.slice();
    const caption = typed || `Посмотри ${files.map((file) => file.name).join(", ")}`;
    const visible = files.length ? `${caption}\nФайл: ${files.map((file) => file.name).join(", ")}` : caption;
    addBubble(visible, "user");
    chatInput.value = "";
    pendingFiles = [];
    if (chatFile) chatFile.value = "";
    showPending();

    const parts = [{ type: "text", text: caption }];
    let rich = false;
    for (const file of files) {
      if (file.kind === "image") {
        rich = true;
        parts.push({ type: "image_url", image_url: { url: file.dataUrl } });
      } else if (file.kind === "file") {
        rich = true;
        parts.push({ type: "file", file: { filename: file.name, file_data: file.dataUrl } });
      } else if (file.text) {
        parts[0].text += `\n\nСодержимое файла «${file.name}»:\n${file.text.slice(0, 12000)}`;
      } else {
        parts[0].text += `\n\nФайл «${file.name}» прикреплён, но это не текст, не PDF и не картинка. Содержимое прочитать нельзя.`;
      }
    }
    const content = rich ? parts : parts[0].text;
    thread.push({ role: "user", content });
    const sendButton = chatForm.querySelector("button[type=submit]");
    if (sendButton) sendButton.disabled = true;
    const pending = document.createElement("p");
    pending.className = "chat-bubble bot";
    pending.textContent = "Смотрю каталог…";
    chatLog.append(pending);
    chatLog.scrollTop = chatLog.scrollHeight;

    const messages = [
      {
        role: "system",
        content: `Ты Иван, AI-консультант сайта-визитки. Отвечай кратко по-русски. Если прислали изображение или файл, опиши или процитируй, что в нём. Товары кладут в корзину кнопкой «В корзину» или заказывают сразу кнопкой «Заказать». Затем клиент указывает имя и телефон и переходит в WhatsApp или Telegram на номер +7 777 422 2256. Если товара нет в наличии, его заказать нельзя. Товары:\n${productLines()}`,
      },
      ...thread.slice(-12),
    ];
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          addBubble("Чат с AI на этом адресе не подключён. Открой сайт так: http://127.0.0.1:8090/", "bot");
          return;
        }
        throw new Error(data.error || String(response.status));
      }
      thread.push({ role: "assistant", content: data.reply });
      addBubble(data.reply, "bot");
    } catch {
      addBubble(`Сейчас отвечаю без подключения к OpenAI.\n${answer(typed || files.map((file) => file.name).join(" "))}`, "bot");
    } finally {
      pending.remove();
      if (sendButton) sendButton.disabled = false;
    }
  });
}
