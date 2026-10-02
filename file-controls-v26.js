// Narrador v26: unify file controls around the PDF-import pattern that works on iPhone.
// - Library "Importar PDF" reuses the exact same working #pdfInput as the Home + button.
// - "Editar portada" opens a tiny sheet with ONE native label/input for choosing an image file.
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

  async function imageToCover(file) {
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

  async function saveCover(file) {
    if (!file || !currentBookId) return;
    try {
      closeSheet();
      toast("Preparando portada…");
      const book = await getBook(currentBookId);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await imageToCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 220);
    } catch (error) {
      console.error("Narrador v26 cover:", error);
      toast("No pude usar esa imagen. Prueba con otro archivo.", 3800);
    }
  }

  function buildCoverSheet() {
    if ($("#coverSheetV26")) return;

    const input = document.createElement("input");
    input.id = "coverFileInputV26";
    input.type = "file";
    // Deliberately extension-based instead of image/* so iPhone behaves more like the working PDF Files picker.
    input.accept = ".jpg,.jpeg,.png,.webp,.heic,.heif";
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) saveCover(file);
    });
    document.body.appendChild(input);

    const modal = document.createElement("div");
    modal.id = "coverSheetV26";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="coverSheetBackdropV26"></div>
      <section class="coverSheetPanelV26" role="dialog" aria-modal="true" aria-label="Editar portada">
        <div class="coverSheetHandleV26"></div>
        <h3>Editar portada</h3>
        <p>Selecciona una imagen guardada en Archivos.</p>
        <label class="coverChooseFileV26" for="coverFileInputV26">▤ Elegir archivo</label>
        <button class="coverCancelV26" type="button">Cancelar</button>
      </section>`;
    document.body.appendChild(modal);

    const style = document.createElement("style");
    style.id = "coverSheetStyleV26";
    style.textContent = `
      #coverFileInputV26{display:none!important}
      #coverSheetV26{position:fixed;inset:0;z-index:70000;display:none;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box}
      #coverSheetV26.open{display:flex}
      .coverSheetBackdropV26{position:absolute;inset:0;background:rgba(10,16,28,.42);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
      .coverSheetPanelV26{position:relative;z-index:1;width:min(500px,100%);background:#fff;border-radius:26px;padding:12px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 24px 70px rgba(0,0,0,.25);box-sizing:border-box}
      .coverSheetHandleV26{width:38px;height:5px;border-radius:99px;background:#d0d5dd;margin:0 auto 15px}
      .coverSheetPanelV26 h3{margin:0 0 7px;font-size:22px;color:#111827}
      .coverSheetPanelV26 p{margin:0 0 16px;color:#667085;font-size:14px}
      .coverChooseFileV26{min-height:54px;border-radius:15px;background:#2f6df6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:850;cursor:pointer;user-select:none;-webkit-user-select:none}
      .coverChooseFileV26:active{transform:scale(.985)}
      .coverCancelV26{width:100%;min-height:50px;margin-top:10px;border:0;border-radius:15px;background:#eef1f6;color:#374151;font-size:16px;font-weight:800}
    `;
    document.head.appendChild(style);

    modal.querySelector(".coverSheetBackdropV26")?.addEventListener("click", closeSheet);
    modal.querySelector(".coverCancelV26")?.addEventListener("click", closeSheet);
  }

  function openSheet() {
    buildCoverSheet();
    $("#bookActionMenu")?.classList.remove("open");
    const modal = $("#coverSheetV26");
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    const modal = $("#coverSheetV26");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
  }

  function normalizeCoverMenuAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return;
    let action = menu.querySelector('[data-book-action="cover"]');
    if (action) return;

    const old = menu.querySelector('[data-v25-cover-action], [data-v24-cover-action], [data-v23-cover-action], .nativeCoverAction, .nativeCoverSlotV22');
    if (!old) return;

    action = document.createElement("button");
    action.type = "button";
    action.dataset.bookAction = "cover";
    action.textContent = "▧ Editar portada";
    old.replaceWith(action);
  }

  function repairLibraryImport() {
    const label = $(".libraryImport");
    const workingInput = $("#pdfInput");
    if (!label || !workingInput) return;
    // Reuse the exact input that the working Home + button already opens.
    label.htmlFor = "pdfInput";
  }

  // Track which book is being edited before document-level legacy handlers run.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }

    const cover = event.target.closest?.('#bookActionMenu [data-book-action="cover"]');
    if (cover) {
      event.preventDefault();
      event.stopPropagation();
      openSheet();
    }
  }, true);

  function init() {
    repairLibraryImport();
    buildCoverSheet();
    normalizeCoverMenuAction();
    setTimeout(repairLibraryImport, 0);
    setTimeout(normalizeCoverMenuAction, 0);
    setTimeout(normalizeCoverMenuAction, 150);
    setTimeout(normalizeCoverMenuAction, 600);
  }

  document.addEventListener("DOMContentLoaded", init);

  const observer = new MutationObserver(() => {
    repairLibraryImport();
    normalizeCoverMenuAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
