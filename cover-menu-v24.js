// Narrador v24: iPhone-style cover source menu.
// The three source rows contain real file inputs, so iOS receives a genuine user tap.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s) => document.querySelector(s);
  let currentBookId = "";

  function toast(message, ms = 2600) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), ms);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function putBook(book) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function makeCover(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    const size = 900;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  async function saveCover(file) {
    if (!file || !currentBookId) return;
    try {
      closeSheet();
      toast("Preparando portada…");
      const book = await getBook(currentBookId);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await makeCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 220);
    } catch (error) {
      console.error("Narrador cover v24:", error);
      toast("No pude usar esa imagen. Prueba con otra.", 3800);
    }
  }

  function fileRow(icon, title, subtitle, opts = {}) {
    const row = document.createElement("div");
    row.className = "coverSourceRowV24";
    row.innerHTML = `<span class="coverSourceIconV24">${icon}</span><span class="coverSourceTextV24"><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ""}</span><span class="coverSourceChevronV24">›</span>`;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = opts.accept || "image/*";
    if (opts.capture) input.setAttribute("capture", opts.capture);
    input.setAttribute("aria-label", title);
    input.className = "coverSourceInputV24";
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) saveCover(file);
    });
    row.appendChild(input);
    return row;
  }

  function buildSheet() {
    if ($("#coverSourceSheetV24")) return;
    const wrap = document.createElement("div");
    wrap.id = "coverSourceSheetV24";
    wrap.setAttribute("aria-hidden", "true");

    const backdrop = document.createElement("div");
    backdrop.className = "coverSourceBackdropV24";

    const sheet = document.createElement("section");
    sheet.className = "coverSourcePanelV24";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.innerHTML = `<div class="coverSourceHandleV24"></div><div class="coverSourceTitleV24">Cambiar portada</div><div class="coverSourceHintV24">Elige de dónde quieres obtener la imagen.</div>`;

    const group = document.createElement("div");
    group.className = "coverSourceGroupV24";
    group.append(
      fileRow("▧", "Biblioteca de fotos", "Elegir una foto existente", { accept: "image/*" }),
      fileRow("◉", "Tomar foto", "Usar la cámara del iPhone", { accept: "image/*", capture: "environment" }),
      fileRow("▤", "Elegir archivo", "Buscar una imagen en Archivos", { accept: "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" })
    );

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "coverSourceCancelV24";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", closeSheet);

    sheet.append(group, cancel);
    wrap.append(backdrop, sheet);
    document.body.appendChild(wrap);
    backdrop.addEventListener("click", closeSheet);

    const style = document.createElement("style");
    style.id = "coverSourceStyleV24";
    style.textContent = `
      #coverSourceSheetV24{position:fixed;inset:0;z-index:65000;display:none;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}
      #coverSourceSheetV24.open{display:flex}
      .coverSourceBackdropV24{position:absolute;inset:0;background:rgba(0,0,0,.36);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
      .coverSourcePanelV24{position:relative;z-index:1;width:min(520px,100%);padding:10px 10px calc(10px + env(safe-area-inset-bottom));border-radius:28px;background:rgba(242,242,247,.96);box-shadow:0 24px 70px rgba(0,0,0,.28);box-sizing:border-box;overflow:hidden}
      .coverSourceHandleV24{width:38px;height:5px;border-radius:999px;background:#aeb1b7;margin:0 auto 12px}
      .coverSourceTitleV24{text-align:center;font-size:17px;font-weight:800;color:#111827;margin:2px 0 4px}
      .coverSourceHintV24{text-align:center;font-size:12px;color:#6b7280;margin:0 12px 12px}
      .coverSourceGroupV24{overflow:hidden;border-radius:18px;background:#fff;border:1px solid rgba(60,60,67,.12)}
      .coverSourceRowV24{position:relative;min-height:64px;display:flex;align-items:center;gap:12px;padding:8px 16px;box-sizing:border-box;background:#fff;border-bottom:1px solid rgba(60,60,67,.12)}
      .coverSourceRowV24:last-child{border-bottom:0}
      .coverSourceRowV24:active{background:#eceef2}
      .coverSourceIconV24{width:34px;height:34px;border-radius:10px;background:#eef3ff;color:#2f6df6;display:grid;place-items:center;font-size:18px;font-weight:900;flex:none}
      .coverSourceTextV24{display:flex;flex-direction:column;min-width:0;flex:1;color:#111827;text-align:left}
      .coverSourceTextV24 strong{font-size:16px;line-height:1.2}
      .coverSourceTextV24 small{font-size:12px;color:#7a8494;margin-top:3px}
      .coverSourceChevronV24{font-size:24px;color:#a3a8b1}
      .coverSourceInputV24{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;opacity:0!important;z-index:5!important;pointer-events:auto!important;cursor:pointer!important;margin:0!important;padding:0!important;border:0!important}
      .coverSourceCancelV24{width:100%;min-height:52px;margin-top:10px;border:0;border-radius:17px;background:#fff;color:#2f6df6;font-size:17px;font-weight:800}
    `;
    document.head.appendChild(style);
  }

  function openSheet() {
    buildSheet();
    $("#bookActionMenu")?.classList.remove("open");
    const sheet = $("#coverSourceSheetV24");
    sheet?.classList.add("open");
    sheet?.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    const sheet = $("#coverSourceSheetV24");
    sheet?.classList.remove("open");
    sheet?.setAttribute("aria-hidden", "true");
  }

  function installMenuAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return false;
    const existing = menu.querySelector("[data-v24-cover-action]");
    if (existing) return true;
    const old = menu.querySelector('[data-book-action="cover"], .nativeCoverAction, .nativeCoverSlotV22, [data-v23-cover-action]');
    if (!old) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.v24CoverAction = "1";
    button.textContent = "▧ Editar portada";
    old.replaceWith(button);
    return true;
  }

  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }
    const action = event.target.closest?.("[data-v24-cover-action]");
    if (action) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSheet();
    }
  }, true);

  window.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-v24-cover-action]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  function init() {
    buildSheet();
    installMenuAction();
    setTimeout(installMenuAction, 0);
    setTimeout(installMenuAction, 150);
    setTimeout(installMenuAction, 600);
  }

  document.addEventListener("DOMContentLoaded", init);
  const observer = new MutationObserver(() => {
    const menu = $("#bookActionMenu");
    if (menu && !menu.querySelector("[data-v24-cover-action]")) installMenuAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
