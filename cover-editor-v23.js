// Narrador v23: iOS-safe cover editor with a dedicated sheet and a VISIBLE native file input.
// No programmatic picker calls and no transparent/hidden file control.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  let currentBookId = "";
  let installed = false;

  const $ = (s) => document.querySelector(s);

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
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
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

  async function fileToCover(file) {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source;
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

  async function saveCover(file, id) {
    if (!file || !id) return;
    try {
      const status = $("#coverEditorStatusV23");
      if (status) status.textContent = "Guardando portada…";
      const book = await getBook(id);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await fileToCover(file);
      await putBook(book);
      if (status) status.textContent = "Portada actualizada";
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 260);
    } catch (error) {
      console.error("Narrador cover editor v23:", error);
      const status = $("#coverEditorStatusV23");
      if (status) status.textContent = "No pude guardar esa imagen. Prueba con otra.";
      toast("No pude guardar esa portada.", 3600);
    }
  }

  function buildSheet() {
    if ($("#coverEditorModalV23")) return;
    const modal = document.createElement("div");
    modal.id = "coverEditorModalV23";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="coverEditorBackdropV23"></div>
      <section class="coverEditorSheetV23" role="dialog" aria-modal="true" aria-labelledby="coverEditorTitleV23">
        <div class="coverEditorHandleV23"></div>
        <h3 id="coverEditorTitleV23">Editar portada</h3>
        <p>Selecciona una imagen desde Fotos o Archivos. En iPhone, toca directamente el botón de abajo.</p>
        <div class="coverNativeBoxV23">
          <div class="coverNativeLabelV23">Imagen de portada</div>
          <input id="coverPickerV23" type="file" accept="image/*" />
        </div>
        <div id="coverEditorStatusV23" class="coverEditorStatusV23">Ninguna imagen seleccionada</div>
        <button id="coverEditorCancelV23" type="button">Cancelar</button>
      </section>`;
    document.body.appendChild(modal);

    const style = document.createElement("style");
    style.id = "coverEditorStyleV23";
    style.textContent = `
      #coverEditorModalV23{position:fixed;inset:0;z-index:50000;display:none;align-items:flex-end;justify-content:center;padding:14px;box-sizing:border-box}
      #coverEditorModalV23.open{display:flex}
      .coverEditorBackdropV23{position:absolute;inset:0;background:rgba(10,16,28,.48)}
      .coverEditorSheetV23{position:relative;z-index:1;width:min(520px,100%);background:#fff;border-radius:24px;padding:16px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 28px 80px rgba(10,20,40,.28);box-sizing:border-box}
      .coverEditorHandleV23{width:42px;height:5px;border-radius:99px;background:#d9dee8;margin:0 auto 16px}
      .coverEditorSheetV23 h3{margin:0 0 8px;font-size:22px;color:#111827}
      .coverEditorSheetV23 p{margin:0 0 18px;color:#667085;font-size:14px;line-height:1.45}
      .coverNativeBoxV23{border:1px solid #dfe4ed;background:#f8f9fb;border-radius:15px;padding:13px}
      .coverNativeLabelV23{font-size:12px;color:#667085;font-weight:800;margin-bottom:9px}
      #coverPickerV23{display:block!important;position:static!important;opacity:1!important;width:100%!important;height:auto!important;pointer-events:auto!important;font-size:16px!important;color:#111827!important;background:#fff!important;border:1px solid #d9dee7!important;border-radius:12px!important;padding:10px!important;box-sizing:border-box!important;-webkit-appearance:auto!important;appearance:auto!important}
      #coverPickerV23::file-selector-button{font:inherit;font-weight:800;border:0;border-radius:10px;background:#2f6df6;color:#fff;padding:10px 13px;margin-right:10px}
      .coverEditorStatusV23{min-height:20px;margin:12px 2px 14px;color:#6b7280;font-size:13px}
      #coverEditorCancelV23{width:100%;min-height:48px;border:0;border-radius:13px;background:#eef1f6;color:#374151;font-size:15px;font-weight:850}
    `;
    document.head.appendChild(style);

    $("#coverPickerV23")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const status = $("#coverEditorStatusV23");
      if (status) status.textContent = `Seleccionada: ${file.name || "imagen"}`;
      saveCover(file, currentBookId);
    });

    $("#coverEditorCancelV23")?.addEventListener("click", closeSheet);
    modal.querySelector(".coverEditorBackdropV23")?.addEventListener("click", closeSheet);
  }

  function openSheet() {
    buildSheet();
    $("#bookActionMenu")?.classList.remove("open");
    const modal = $("#coverEditorModalV23");
    const input = $("#coverPickerV23");
    const status = $("#coverEditorStatusV23");
    if (input) input.value = "";
    if (status) status.textContent = "Ninguna imagen seleccionada";
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    const modal = $("#coverEditorModalV23");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
  }

  function installMenuAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return false;

    const old = menu.querySelector('[data-book-action="cover"], .nativeCoverAction, .nativeCoverSlotV22, [data-v23-cover-action]');
    if (!old) return false;
    if (old.matches?.('[data-v23-cover-action]')) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.v23CoverAction = "1";
    button.textContent = "▧ Editar portada";
    old.replaceWith(button);
    return true;
  }

  // Keep track of the selected book before older document handlers can interfere.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }

    const action = event.target.closest?.("[data-v23-cover-action]");
    if (action) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSheet();
    }
  }, true);

  window.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-v23-cover-action]");
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  function init() {
    if (!installed) {
      installed = true;
      buildSheet();
    }
    installMenuAction();
    setTimeout(installMenuAction, 0);
    setTimeout(installMenuAction, 150);
    setTimeout(installMenuAction, 600);
  }

  document.addEventListener("DOMContentLoaded", init);

  const observer = new MutationObserver(() => {
    const menu = $("#bookActionMenu");
    if (menu && !menu.querySelector("[data-v23-cover-action]")) installMenuAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
