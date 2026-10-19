import { useEffect, useRef, useState } from "react";
import { ask } from "../ai/index.js";
import { localAnswer } from "../lib/answer.js";
import { isImageFile, readAttachment } from "../lib/files.js";
import { useShop } from "../shop-context.jsx";

export function ChatWidget() {
  const shop = useShop();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [bubbles, setBubbles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState("Смотрю каталог…");
  const [size, setSize] = useState({ width: 380, height: 520 });
  const logRef = useRef(null);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const menuRef = useRef(null);
  const greeted = useRef(false);
  const shopRef = useRef(shop);
  shopRef.current = {
    products: shop.products,
    cart: shop.lines,
    addToCart: shop.addToCart,
    changeQty: shop.changeQty,
    saveProduct: shop.saveProduct,
    deleteProduct: shop.deleteProduct,
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [bubbles, sending]);

  useEffect(() => {
    if (!attachOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (menuRef.current?.contains(target)) return;
      if (target.closest?.(".chat-plus")) return;
      setAttachOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [attachOpen]);

  function pushBubble(text, role, images = []) {
    setBubbles((current) => [...current, { id: `${Date.now()}-${current.length}`, text, role, images }]);
  }

  function openChat() {
    setOpen(true);
    if (!greeted.current) {
      greeted.current = true;
      pushBubble("Здравствуйте, я Иван. Чем помочь?", "bot");
    }
  }

  function startResize(event, axis) {
    event.preventDefault();
    const start = axis === "x" ? event.clientX : event.clientY;
    const startSize = axis === "x" ? size.width : size.height;
    const min = axis === "x" ? 280 : 320;
    const max = axis === "x" ? window.innerWidth - 40 : window.innerHeight - 90;
    function move(moveEvent) {
      const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const next = Math.min(max, Math.max(min, startSize + (start - current)));
      setSize((prev) => (axis === "x" ? { ...prev, width: next } : { ...prev, height: next }));
    }
    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  async function onFiles(event) {
    const selected = [...(event.target.files || [])];
    event.target.value = "";
    if (!selected.length) return;
    const next = [];
    for (const file of selected) {
      const photo = isImageFile(file);
      const limit = photo ? 15 * 1024 * 1024 : 4 * 1024 * 1024;
      if (file.size > limit) {
        pushBubble(
          photo ? `«${file.name}» больше 15 МБ. Выбери фото поменьше.` : `«${file.name}» больше 4 МБ. Выбери файл поменьше.`,
          "bot"
        );
        continue;
      }
      try {
        next.push(await readAttachment(file));
      } catch {
        pushBubble(
          photo ? `«${file.name}» не открывается как фото. Сохрани его в JPG или PNG.` : `Не удалось прочитать «${file.name}».`,
          "bot"
        );
      }
    }
    if (next.length) setPendingFiles((current) => [...current, ...next]);
  }

  async function submit(event) {
    event.preventDefault();
    const typed = input.trim();
    if ((!typed && !pendingFiles.length) || sending) return;
    const files = pendingFiles.slice();
    const caption = typed || `Посмотри ${files.map((file) => file.name).join(", ")}`;
    const visible = files.length
      ? `${caption}\n${files.map((file) => `${file.kind === "image" ? "Фото" : "Файл"}: ${file.name}`).join("\n")}`
      : caption;
    const images = files.filter((file) => file.kind === "image").map((file) => file.dataUrl);
    pushBubble(visible, "user", images);
    setInput("");
    setPendingFiles([]);
    setSendingLabel(images.length ? "Смотрю фото…" : "Думаю…");
    setSending(true);
    try {
      const result = await ask({
        text: caption,
        attachments: files,
        shop: () => shopRef.current,
        onStatus: setSendingLabel,
      });
      pushBubble(result.text, "bot");
    } catch (error) {
      if (error?.status === 404) {
        pushBubble("Чат с AI на этом адресе не подключён. Открой сайт так: http://127.0.0.1:8090/", "bot");
        return;
      }
      const fallback = localAnswer(typed || files.map((file) => file.name).join(" "), shopRef.current.products);
      const photoNote = images.length ? "Фото получил, но без OpenAI не могу его разобрать.\n" : "";
      pushBubble(`Сейчас отвечаю без подключения к OpenAI.\n${photoNote}${fallback}`, "bot");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-widget">
      {open ? (
        <section className="chat-panel" style={{ width: size.width, height: size.height }}>
          <button className="chat-resize chat-resize-y" type="button" aria-label="Изменить высоту" onPointerDown={(event) => startResize(event, "y")} />
          <button className="chat-resize chat-resize-x" type="button" aria-label="Изменить ширину" onPointerDown={(event) => startResize(event, "x")} />
          <header className="chat-head">
            <div>
              <strong>Иван</strong>
              <span>AI-консультант</span>
            </div>
            <button className="icon-x" type="button" aria-label="Закрыть чат" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <div className="chat-log" ref={logRef}>
            {bubbles.map((bubble) => (
              <div key={bubble.id} className={`chat-bubble ${bubble.role}`}>
                {bubble.text}
                {bubble.images?.map((src, index) => (
                  <img key={`${bubble.id}-${index}`} src={src} alt="Фото в сообщении" />
                ))}
              </div>
            ))}
            {sending ? <p className="chat-bubble bot">{sendingLabel}</p> : null}
          </div>
          {pendingFiles.length ? (
            <div className="chat-attach">
              {pendingFiles.map((file, index) => (
                <div className="chat-attach-item" key={`${file.name}-${index}`}>
                  {file.kind === "image" ? <img src={file.dataUrl} alt="" /> : null}
                  <span>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((current) => current.filter((_, item) => item !== index))}
                  >
                    убрать
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="chat-form-wrap">
            {attachOpen ? (
              <div className="chat-attach-menu" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setAttachOpen(false);
                    photoRef.current?.click();
                  }}
                >
                  Фото
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachOpen(false);
                    fileRef.current?.click();
                  }}
                >
                  Файл
                </button>
              </div>
            ) : null}
          <form className="chat-form" onSubmit={submit}>
            <button
              className="chat-plus"
              type="button"
              aria-label="Прикрепить фото или файл"
              aria-expanded={attachOpen}
              onClick={() => setAttachOpen((open) => !open)}
            >
              +
            </button>
            <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
            <input
              type="text"
              placeholder="Напишите вопрос"
              autoComplete="off"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="btn primary" type="submit" disabled={sending}>
              Отправить
            </button>
          </form>
          </div>
        </section>
      ) : null}
      <button className="chat-launcher" type="button" aria-label="Открыть чат с Иваном" onClick={openChat}>
        Чат
      </button>
    </div>
  );
}
