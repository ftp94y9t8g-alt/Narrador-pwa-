// Narrador v27: use direct native file controls only.
// - Library Import PDF restores its own in-view input (#pdfInput2), matching the working Home + pattern.
// - Editar portada itself becomes a <label for="coverEditorInput">, so one tap opens iOS Files directly.
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

    // Store a portrait book cover instead of a square thumbnail.
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
      console.error("Narrador v27 cover:", error);
      toast("No pude usar esa imagen. Prueba con otro archivo.", 3800);
    }
  }

  function cleanupOldCoverUI() {
    $("#coverSheetV26")?.remove();
    $("#coverSheetStyleV26")?.remove();
    $("#coverFileInputV26")?.remove();
    $("#coverFileInputV25")?.remove();
    $("#coverSourceSheetV24")?.remove();
    $("#coverSourceStyleV24")?.remove();
    $("#coverEditorModalV23")?.remove();
    $("#coverEditorStyleV23")?.remove();
  }

  function repairLibraryImport() {
    const label = $(".libraryImport");
    const input = $("#pdfInput2");
    if (!label || !input) return;
    // Important: keep the input inside the currently visible Library view.
    // This is the same native label/input relationship used by the working Home + control.
    label.setAttribute("for", "pdfInput2");
    label.htmlFor = "pdfInput2";
    input.accept = "application/pdf,.pdf";
  }

  function ensureCoverInputListener() {
    const input = $("#coverEditorInput");
    if (!input || input.dataset.v27Ready === "1") return;
    input.dataset.v27Ready = "1";
    input.accept = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/*";
    input.addEventListener("change", (event) => {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      event.target.value = "";
      $("#bookActionMenu")?.classList.remove("open");
      if (file) saveCover(file, id);
    }, true);
  }

  function installDirectCoverLabel() {
    const menu = $("#bookActionMenu");
    if (!menu) return;

    let existing = menu.querySelector("#directCoverLabelV27");
    if (existing) return;

    const old = menu.querySelector(
      '[data-book-action="cover"], [data-v25-cover-action], [data-v24-cover-action], [data-v23-cover-action], .nativeCoverAction, .nativeCoverSlotV22'
    );
    if (!old) return;

    const label = document.createElement("label");
    label.id = "directCoverLabelV27";
    label.htmlFor = "coverEditorInput";
    label.setAttribute("for", "coverEditorInput");
    label.setAttribute("role", "menuitem");
    label.textContent = "▧ Editar portada";
    old.replaceWith(label);
  }

  function addStyle() {
    if ($("#fileControlsStyleV27")) return;
    const style = document.createElement("style");
    style.id = "fileControlsStyleV27";
    style.textContent = `
      #directCoverLabelV27{
        width:100%;display:flex;align-items:center;gap:9px;
        padding:10px 12px;border-radius:11px;box-sizing:border-box;
        color:#1f2937;font-size:14px;font-weight:700;text-align:left;
        cursor:pointer;user-select:none;-webkit-user-select:none;
      }
      #directCoverLabelV27:active{background:#f1f5ff}
    `;
    document.head.appendChild(style);
  }

  // Capture the selected book, but never cancel the label's native default action.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }

    const label = event.target.closest?.("#directCoverLabelV27");
    if (label) {
      const input = $("#coverEditorInput");
      if (input) {
        input.dataset.bookId = currentBookId;
        input.value = "";
      }
      // Do NOT preventDefault here: the label must natively activate the file input.
    }
  }, true);

  function init() {
    cleanupOldCoverUI();
    addStyle();
    repairLibraryImport();
    ensureCoverInputListener();
    installDirectCoverLabel();
    setTimeout(() => {
      repairLibraryImport();
      ensureCoverInputListener();
      installDirectCoverLabel();
    }, 0);
    setTimeout(() => {
      repairLibraryImport();
      ensureCoverInputListener();
      installDirectCoverLabel();
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", init);

  const observer = new MutationObserver(() => {
    repairLibraryImport();
    ensureCoverInputListener();
    installDirectCoverLabel();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
