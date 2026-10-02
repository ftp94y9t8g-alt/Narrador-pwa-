// Narrador v25: simplest reliable cover change flow.
// Mirrors the working PDF import pattern: a normal <label for="file-input"> opens one image file input.
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

  async function saveCover(file, id) {
    if (!file || !id) return;
    try {
      toast("Preparando portada…");
      const book = await getBook(id);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await makeCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 220);
    } catch (error) {
      console.error("Narrador cover v25:", error);
      toast("No pude usar esa imagen. Prueba con otro archivo.", 3800);
    }
  }

  function ensureInput() {
    let input = $("#coverFileInputV25");
    if (input) return input;
    input = document.createElement("input");
    input.id = "coverFileInputV25";
    input.type = "file";
    input.accept = "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif";
    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      $("#bookActionMenu")?.classList.remove("open");
      if (file) saveCover(file, id);
      event.target.value = "";
    });
    document.body.appendChild(input);
    return input;
  }

  function installMenuAction() {
    const menu = $("#bookActionMenu");
    if (!menu) return false;
    const existing = menu.querySelector("[data-v25-cover-action]");
    if (existing) return true;

    const old = menu.querySelector('[data-book-action="cover"], .nativeCoverAction, .nativeCoverSlotV22, [data-v23-cover-action], [data-v24-cover-action]');
    if (!old) return false;

    ensureInput();
    const label = document.createElement("label");
    label.htmlFor = "coverFileInputV25";
    label.dataset.v25CoverAction = "1";
    label.textContent = "▧ Editar portada";
    label.setAttribute("role", "menuitem");
    label.style.cssText = "display:block;width:100%;padding:10px 12px;border-radius:11px;box-sizing:border-box;color:#1f2937;font-size:14px;font-weight:700;text-align:left;cursor:pointer;";
    old.replaceWith(label);
    return true;
  }

  // Same idea as the working PDF import labels: set context before the label activates the file input.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }
    const action = event.target.closest?.("[data-v25-cover-action]");
    if (action) {
      const input = ensureInput();
      input.dataset.bookId = currentBookId;
      input.value = "";
    }
  }, true);

  function init() {
    ensureInput();
    installMenuAction();
    setTimeout(installMenuAction, 0);
    setTimeout(installMenuAction, 150);
    setTimeout(installMenuAction, 600);
  }

  document.addEventListener("DOMContentLoaded", init);
  const observer = new MutationObserver(() => {
    const menu = $("#bookActionMenu");
    if (menu && !menu.querySelector("[data-v25-cover-action]")) installMenuAction();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
})();
