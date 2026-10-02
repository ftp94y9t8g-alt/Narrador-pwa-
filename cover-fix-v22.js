// Narrador v22: iPhone cover picker using a REAL file input as the tapped menu row.
// No programmatic click(), no label indirection: the user taps the native file control itself.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  let currentBookId = "";

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

  async function imageToCover(file) {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = source;
    });

    // Square crop for the Spotify-style library cards.
    const size = 900;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
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
      console.error("Narrador cover v22:", error);
      toast("No pude usar esa imagen. Prueba con otra foto.", 3800);
    }
  }

  // Record which book's menu was opened. Window capture runs before document capture handlers.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (!dots) return;
    currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
  }, true);

  function installPicker() {
    const menu = $("#bookActionMenu");
    if (!menu) return false;

    // If already installed and still mounted, nothing else to do.
    if (menu.querySelector(".nativeCoverSlotV22")) return true;

    const legacy = menu.querySelector('[data-book-action="cover"], .nativeCoverAction');
    if (!legacy) return false;

    const slot = document.createElement("div");
    slot.className = "nativeCoverSlotV22";
    slot.setAttribute("role", "menuitem");
    slot.style.cssText = [
      "position:relative",
      "width:100%",
      "min-height:42px",
      "border-radius:11px",
      "overflow:hidden",
      "box-sizing:border-box"
    ].join(";");

    const text = document.createElement("div");
    text.textContent = "▧ Editar portada";
    text.style.cssText = [
      "width:100%",
      "padding:10px 12px",
      "box-sizing:border-box",
      "font-size:14px",
      "font-weight:700",
      "color:#1f2937",
      "display:flex",
      "align-items:center",
      "gap:9px",
      "pointer-events:none"
    ].join(";");

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("aria-label", "Editar portada");
    // Critical: the real input occupies the whole visible row. The finger touches THIS control.
    input.style.setProperty("display", "block", "important");
    input.style.setProperty("position", "absolute", "important");
    input.style.setProperty("inset", "0", "important");
    input.style.setProperty("width", "100%", "important");
    input.style.setProperty("height", "100%", "important");
    input.style.setProperty("opacity", "0", "important");
    input.style.setProperty("z-index", "3", "important");
    input.style.setProperty("cursor", "pointer", "important");
    input.style.setProperty("pointer-events", "auto", "important");

    input.addEventListener("pointerdown", () => {
      input.dataset.bookId = currentBookId;
      input.value = "";
    }, true);

    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      menu.classList.remove("open");
      if (file) saveCover(file, id);
    }, true);

    slot.append(text, input);
    legacy.replaceWith(slot);
    return true;
  }

  function ensurePicker() {
    installPicker();
    setTimeout(installPicker, 0);
    setTimeout(installPicker, 120);
    setTimeout(installPicker, 500);
  }

  document.addEventListener("DOMContentLoaded", ensurePicker);

  // If another compatibility layer rebuilds the menu later, restore our direct native input.
  const observer = new MutationObserver(() => {
    const menu = $("#bookActionMenu");
    if (menu && !menu.querySelector(".nativeCoverSlotV22")) installPicker();
  });
  document.documentElement && observer.observe(document.documentElement, { childList: true, subtree: true });
})();
