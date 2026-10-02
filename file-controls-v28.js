// Narrador v28: direct synchronous iPhone Files activation.
// Use the ONE file input already proven to work on this device: #pdfInput (Home +).
// Library Importar PDF and Editar portada call that exact input during the user's pointer gesture.
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
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = source;
    });
    const width = 900, height = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  async function saveCover(file, id) {
    if (!file || !id) return;
    try {
      toast("Preparando portada…");
      const book = await getBook(id);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await imageToCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 220);
    } catch (error) {
      console.error("Narrador v28 cover:", error);
      toast("No pude usar esa imagen. Prueba con otra.", 3800);
    }
  }

  function mainInput() {
    return $("#pdfInput");
  }

  function setPdfMode() {
    const input = mainInput();
    if (!input) return null;
    input.dataset.narradorMode = "pdf";
    delete input.dataset.bookId;
    input.accept = "application/pdf,.pdf";
    input.value = "";
    return input;
  }

  function setCoverMode() {
    const input = mainInput();
    if (!input) return null;
    input.dataset.narradorMode = "cover";
    input.dataset.bookId = currentBookId;
    input.accept = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*";
    input.value = "";
    return input;
  }

  function installLibraryImport() {
    const old = $(".libraryImport");
    if (!old || old.dataset.v28Ready === "1") return;
    old.dataset.v28Ready = "1";
    // Disable label default behavior; v28 opens the known-working input synchronously itself.
    old.removeAttribute("for");
    try { old.htmlFor = ""; } catch (_) {}
  }

  function installCoverAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return;
    if (menu.querySelector("#directCoverActionV28")) return;
    const old = menu.querySelector(
      '#directCoverLabelV27, [data-book-action="cover"], [data-v25-cover-action], [data-v24-cover-action], [data-v23-cover-action], .nativeCoverAction, .nativeCoverSlotV22'
    );
    if (!old) return;
    const action = document.createElement("div");
    action.id = "directCoverActionV28";
    action.setAttribute("role", "menuitem");
    action.setAttribute("tabindex", "0");
    action.textContent = "▧ Editar portada";
    old.replaceWith(action);
  }

  function addStyle() {
    if ($("#fileControlsStyleV28")) return;
    const style = document.createElement("style");
    style.id = "fileControlsStyleV28";
    style.textContent = `
      #directCoverActionV28{
        width:100%;display:flex;align-items:center;gap:9px;padding:10px 12px;
        border-radius:11px;box-sizing:border-box;color:#1f2937;font-size:14px;
        font-weight:700;text-align:left;cursor:pointer;user-select:none;-webkit-user-select:none;
      }
      #directCoverActionV28:active{background:#f1f5ff}
    `;
    document.head.appendChild(style);
  }

  // Capture image changes BEFORE app.js sees #pdfInput. PDF changes are allowed through unchanged.
  window.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== "pdfInput") return;
    if (input.dataset.narradorMode !== "cover") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const file = input.files?.[0];
    const id = input.dataset.bookId || currentBookId;
    input.value = "";
    setPdfMode();
    $("#bookActionMenu")?.classList.remove("open");
    if (file) saveCover(file, id);
  }, true);

  // Window capture runs before the existing document handlers.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }

    // Keep the already-working Home + untouched except for restoring PDF mode after a cancelled cover picker.
    if (event.target.closest?.(".homePlus")) {
      setPdfMode();
      return;
    }

    const libraryImport = event.target.closest?.(".libraryImport");
    if (libraryImport) {
      const input = setPdfMode();
      if (!input) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Must remain in this same synchronous user gesture for iOS.
      input.click();
      return;
    }

    const cover = event.target.closest?.("#directCoverActionV28");
    if (cover) {
      const input = setCoverMode();
      if (!input || !currentBookId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      $("#bookActionMenu")?.classList.remove("open");
      // Same proven #pdfInput, opened synchronously in the user's touch.
      input.click();
    }
  }, true);

  function init() {
    // Remove prior custom cover UI so no older handler competes with v28.
    $("#coverSheetV26")?.remove();
    $("#coverSourceSheetV24")?.remove();
    addStyle();
    setPdfMode();
    installLibraryImport();
    installCoverAction();
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 0);
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 250);
  }

  document.addEventListener("DOMContentLoaded", init);
  const observer = new MutationObserver(() => {
    installLibraryImport();
    installCoverAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
