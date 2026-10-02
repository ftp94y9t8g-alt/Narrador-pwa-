// Narrador v31: minimal native cover picker.
// Important: no programmatic click(), no overlay, no replacement of the native input.
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

  async function makeCover(file) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = data;
    });

    const width = 900;
    const height = 1200;
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
      book.coverDataUrl = await makeCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 180);
    } catch (error) {
      console.error("Narrador v31 cover:", error);
      toast("No pude usar esa imagen. Prueba con JPG o PNG.", 3800);
    }
  }

  function bindFinalNativeInput() {
    const input = $("#coverEditorInput");
    if (!input || input.dataset.v31Bound === "1") return;
    input.dataset.v31Bound = "1";
    input.addEventListener("change", (event) => {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      event.target.value = "";
      if (file) saveCover(file, id);
    }, true);
  }

  function addStyle() {
    if ($("#coverNativeStyleV31")) return;
    const style = document.createElement("style");
    style.id = "coverNativeStyleV31";
    style.textContent = `
      #bookActionMenu #coverActionNative{
        width:100%;display:flex;align-items:center;gap:9px;
        padding:10px 12px;border-radius:11px;box-sizing:border-box;
        color:#1f2937;font-size:14px;font-weight:700;text-align:left;
        cursor:pointer;user-select:none;-webkit-user-select:none;
      }
      #bookActionMenu #coverActionNative:active{background:#f1f5ff}
    `;
    document.head.appendChild(style);
  }

  // Capture the selected book only. Never preventDefault on the native label/input path.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      const input = $("#coverEditorInput");
      if (input) input.dataset.bookId = currentBookId;
      return;
    }
    const coverLabel = event.target.closest?.("#coverActionNative");
    if (coverLabel) {
      const input = $("#coverEditorInput");
      if (input) {
        input.dataset.bookId = currentBookId;
        input.value = "";
      }
    }
  }, true);

  function init() {
    addStyle();
    bindFinalNativeInput();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
