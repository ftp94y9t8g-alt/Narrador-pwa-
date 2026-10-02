// Narrador v29: direct native file-input overlays for iPhone/PWA.
// Instead of programmatic input.click(), the user's finger taps the real <input type=file>.
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

  async function bookById(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).find((b) => String(b.id) === String(id)) || null);
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
      $("#bookActionMenu")?.classList.remove("open");
      toast("Preparando portada…");
      const book = await bookById(id);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await imageToCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 220);
    } catch (error) {
      console.error("Narrador v29 cover:", error);
      toast("No pude usar esa imagen. Prueba con otra.", 3800);
    }
  }

  function nativeOverlayStyle(input) {
    input.style.setProperty("display", "block", "important");
    input.style.setProperty("position", "absolute", "important");
    input.style.setProperty("inset", "0", "important");
    input.style.setProperty("width", "100%", "important");
    input.style.setProperty("height", "100%", "important");
    input.style.setProperty("opacity", "0", "important");
    input.style.setProperty("z-index", "20", "important");
    input.style.setProperty("pointer-events", "auto", "important");
    input.style.setProperty("cursor", "pointer", "important");
    input.style.setProperty("margin", "0", "important");
    input.style.setProperty("padding", "0", "important");
    input.style.setProperty("border", "0", "important");
  }

  function installLibraryImport() {
    const host = $(".libraryImport");
    const input = $("#pdfInput2");
    if (!host || !input) return;

    host.removeAttribute("for");
    try { host.htmlFor = ""; } catch (_) {}
    host.style.position = "relative";
    host.style.overflow = "hidden";
    host.style.touchAction = "manipulation";

    if (input.parentElement !== host) host.appendChild(input);
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    nativeOverlayStyle(input);
    input.dataset.v29Native = "pdf";
  }

  function installCoverAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return;

    let host = menu.querySelector("#directCoverActionV29");
    if (!host) {
      const old = menu.querySelector(
        '#directCoverActionV28, #directCoverLabelV27, [data-book-action="cover"], [data-v25-cover-action], [data-v24-cover-action], [data-v23-cover-action], .nativeCoverAction, .nativeCoverSlotV22'
      );
      if (!old) return;

      host = document.createElement("div");
      host.id = "directCoverActionV29";
      host.setAttribute("role", "menuitem");
      host.textContent = "▧ Editar portada";
      old.replaceWith(host);
    }

    host.style.position = "relative";
    host.style.overflow = "hidden";
    host.style.touchAction = "manipulation";

    let input = $("#coverEditorInput");
    if (!input) {
      input = document.createElement("input");
      input.id = "coverEditorInput";
      input.type = "file";
    }
    input.accept = "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif";
    nativeOverlayStyle(input);
    if (input.parentElement !== host) host.appendChild(input);

    if (input.dataset.v29Bound !== "1") {
      input.dataset.v29Bound = "1";
      input.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const file = event.target.files?.[0];
        const id = event.target.dataset.bookId || currentBookId;
        event.target.value = "";
        if (file) saveCover(file, id);
      }, true);
    }
  }

  function addStyle() {
    if ($("#fileControlsStyleV29")) return;
    const style = document.createElement("style");
    style.id = "fileControlsStyleV29";
    style.textContent = `
      #directCoverActionV29{
        width:100%;display:flex;align-items:center;gap:9px;padding:10px 12px;
        border-radius:11px;box-sizing:border-box;color:#1f2937;font-size:14px;
        font-weight:700;text-align:left;cursor:pointer;user-select:none;-webkit-user-select:none;
      }
      #directCoverActionV29:active{background:#f1f5ff}
      .libraryImport{position:relative!important;overflow:hidden!important}
    `;
    document.head.appendChild(style);
  }

  // Set the active book before the menu opens. Do not cancel any native file-input events.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      const coverInput = $("#coverEditorInput");
      if (coverInput) coverInput.dataset.bookId = currentBookId;
    }
  }, true);

  function init() {
    $("#coverSheetV26")?.remove();
    $("#coverSourceSheetV24")?.remove();
    $("#coverEditorModalV23")?.remove();
    addStyle();
    installLibraryImport();
    installCoverAction();
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 0);
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 250);
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 700);
  }

  document.addEventListener("DOMContentLoaded", init);
  const observer = new MutationObserver(() => {
    installLibraryImport();
    installCoverAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
