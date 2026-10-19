import { useState } from "react";

const empty = {
  name: "",
  price: "",
  currency: "RUB",
  qty: 1,
  type: "product",
  description: "",
};

export function ProductForm({ product, onClose, onSave }) {
  const [draft, setDraft] = useState(
    product
      ? {
          name: product.name,
          price: product.price,
          currency: product.currency,
          qty: product.qty,
          type: product.type,
          description: product.description || "",
        }
      : empty
  );
  const [photo, setPhoto] = useState(product?.photo || "");
  const [photoLabel, setPhotoLabel] = useState(product?.photo ? "Фото выбрано" : "Выбрать файл");

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function onPhoto(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result || ""));
      setPhotoLabel(file.name);
    };
    reader.readAsDataURL(file);
  }

  function submit(event) {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length < 1) return;
    onSave({
      id: product?.id || `p${Date.now()}`,
      name,
      price: Number(draft.price),
      currency: draft.currency,
      qty: Number(draft.qty),
      type: draft.type,
      description: draft.description.trim(),
      photo,
    });
  }

  return (
    <div className="modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-head">
          <h2 id="modal-title">{product ? "Изменить товар" : "Новый товар"}</h2>
          <button className="icon-x" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <form className="stack-form" onSubmit={submit}>
          <label>
            Название
            <input
              value={draft.name}
              onChange={(event) => setField("name", event.target.value)}
              required
              autoComplete="off"
              autoFocus
            />
          </label>
          <div className="form-row">
            <label>
              Цена
              <input
                value={draft.price}
                onChange={(event) => setField("price", event.target.value)}
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              Валюта
              <select value={draft.currency} onChange={(event) => setField("currency", event.target.value)}>
                <option value="RUB">Рубли (₽)</option>
                <option value="KZT">Тенге (₸)</option>
                <option value="USD">Доллары ($)</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Количество
              <input
                value={draft.qty}
                onChange={(event) => setField("qty", event.target.value)}
                type="number"
                min="0"
                step="1"
                required
              />
            </label>
            <label>
              Тип
              <select value={draft.type} onChange={(event) => setField("type", event.target.value)}>
                <option value="product">Товар</option>
                <option value="service">Услуга</option>
              </select>
            </label>
          </div>
          <label>
            Описание
            <textarea
              value={draft.description}
              onChange={(event) => setField("description", event.target.value)}
              rows={4}
            />
          </label>
          <label className="photo-label">
            Фото
            <span className="photo-drop" onClick={() => document.getElementById("product-photo").click()}>
              {photoLabel}
            </span>
            <input id="product-photo" type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
          <button className="btn primary form-submit" type="submit">
            Сохранить
          </button>
        </form>
      </div>
    </div>
  );
}
