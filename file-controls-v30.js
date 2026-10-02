// Narrador v30: iPhone-native file controls that remain real, visible browser controls.
// The v29 overlays were fully transparent. iOS Home Screen PWAs can ignore those.
// v30 keeps the actual <input type="file"> rendered at opacity 1 and only makes
// the browser button text transparent, so the user's finger lands on the native control.
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
    return canvas.toDataURL("image/jpeg", 0.9);
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
      console.error("Narrador v30 cover:", error);
      toast("No pude usar esa imagen. Prueba con otra.", 3800);
    }
  }

  function makeNativeInput(input, kind) {
    if (!input) return;
    input.classList.add("nativeFileInputV30");
    input.style.setProperty("display", "block", "important");
    input.style.setProperty("position", "absolute", "important");
    input.style.setProperty("left", "0", "important");
    input.style.setProperty("top", "0", "important");
    input.style.setProperty("width", "100%", "important");
    input.style.setProperty("height", "100%", "important");
    input.style.setProperty("opacity", "1", "important");
    input.style.setProperty("z-index", "50", "important");
    input.style.setProperty("pointer-events", "auto", "important");
    input.style.setProperty("cursor", "pointer", "important");
    input.style.setProperty("margin", "0", "important");
    input.style.setProperty("padding", "0", "important");
    input.style.setProperty("border", "0", "important");
    input.style.setProperty("border-radius", "inherit", "important");
    input.style.setProperty("font-size", "0", "important");
    input.style.setProperty("color", "transparent", "important");
    input.style.setProperty("background", "transparent", "important");
    input.dataset.nativeKindV30 = kind;
  }

  function installLibraryImport() {
    const oldHost = $(".libraryImport");
    const input = $("#pdfInput2");
    if (!oldHost || !input) return;

    let host = $("#libraryImportNativeV30");
    if (!host) {
      host = document.createElement("div");
      host.id = "libraryImportNativeV30";
      host.className = "libraryImport";
      host.innerHTML = '<span class="nativeFileTextV30">＋ Importar PDF</span>';
      oldHost.replaceWith(host);
    }

    host.style.position = "relative";
    host.style.overflow = "hidden";
    host.style.touchAction = "manipulation";
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.removeAttribute("hidden");
    if (input.parentElement !== host) host.appendChild(input);
    makeNativeInput(input, "pdf");
  }

  function installCoverAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return;

    let host = menu.querySelector("#coverNativeV30");
    if (!host) {
      const old = menu.querySelector(
        '#directCoverActionV29, #directCoverActionV28, #directCoverLabelV27, [data-book-action="cover"], [data-v25-cover-action], [data-v24-cover-action], [data-v23-cover-action], .nativeCoverAction, .nativeCoverSlotV22'
      );
      if (!old) return;
      host = document.createElement("div");
      host.id = "coverNativeV30";
      host.setAttribute("role", "menuitem");
      host.innerHTML = '<span class="nativeFileTextV30">▧ Editar portada</span>';
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
    input.removeAttribute("hidden");
    if (input.parentElement !== host) host.appendChild(input);
    makeNativeInput(input, "cover");

    if (input.dataset.boundV30 !== "1") {
      input.dataset.boundV30 = "1";
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
    if ($("#fileControlsStyleV30")) return;
    const style = document.createElement("style");
    style.id = "fileControlsStyleV30";
    style.textContent = `
      #libraryImportNativeV30{
        position:relative!important;overflow:hidden!important;
        display:inline-flex;align-items:center;justify-content:center;
      }
      #coverNativeV30{
        position:relative!important;overflow:hidden!important;
        width:100%;display:flex;align-items:center;gap:9px;padding:10px 12px;
        border-radius:11px;box-sizing:border-box;color:#1f2937;font-size:14px;
        font-weight:700;text-align:left;cursor:pointer;user-select:none;-webkit-user-select:none;
      }
      #coverNativeV30:active{background:#f1f5ff}
      .nativeFileTextV30{position:relative;z-index:2;pointer-events:none;display:block;width:100%;text-align:center}
      #coverNativeV30 .nativeFileTextV30{text-align:left}
      .nativeFileInputV30::-webkit-file-upload-button{
        width:100%;height:100%;margin:0;border:0;padding:0;background:transparent;color:transparent;font-size:0;
      }
      .nativeFileInputV30::file-selector-button{
        width:100%;height:100%;margin:0;border:0;padding:0;background:transparent;color:transparent;font-size:0;
      }
    `;
    document.head.appendChild(style);
  }

  // Capture the selected book before the legacy menu code runs.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      const input = $("#coverEditorInput");
      if (input) input.dataset.bookId = currentBookId;
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
    setTimeout(() => { installLibraryImport(); installCoverAction(); }, 800);
  }

  document.addEventListener("DOMContentLoaded", init);
  const observer = new MutationObserver(() => {
    installLibraryImport();
    installCoverAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
