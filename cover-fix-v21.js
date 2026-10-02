// Narrador v21: native iOS cover picker. Uses a real <label for="file-input"> tap
// instead of a delayed/programmatic input.click(), which iOS can silently block.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  let currentBookId = "";

  function toast(message, ms = 2400) {
    const el = document.querySelector("#toast");
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

  async function resizeCover(file) {
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
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  async function saveCover(file, id) {
    if (!file || !id) return;
    try {
      toast("Preparando portada…");
      const book = await getBook(id);
      if (!book) throw new Error("book_not_found");
      book.coverDataUrl = await resizeCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 180);
    } catch (error) {
      console.error("Narrador cover picker:", error);
      toast("No pude guardar esa portada.", 3500);
    }
  }

  // Capture the book id BEFORE interaction-v19's document-level handler stops propagation.
  window.addEventListener("pointerdown", (event) => {
    const dots = event.target.closest?.(".bookMenuBtn");
    if (dots) {
      currentBookId = String(dots.closest(".bookRow")?.dataset.bookId || "");
      return;
    }

    const coverLabel = event.target.closest?.(".nativeCoverAction");
    if (coverLabel) {
      const input = document.querySelector("#coverEditorInput");
      if (input) {
        input.dataset.bookId = currentBookId;
        input.value = "";
      }
    }
  }, true);

  function installNativePicker() {
    const input = document.querySelector("#coverEditorInput");
    const oldButton = document.querySelector('#bookActionMenu [data-book-action="cover"]');
    if (!input || !oldButton) return;

    // Keep the real file control mounted. display:none can make label activation flaky in iOS.
    input.accept = "image/*";
    input.removeAttribute("capture");
    input.style.setProperty("display", "block", "important");
    input.style.setProperty("position", "fixed", "important");
    input.style.setProperty("left", "-10000px", "important");
    input.style.setProperty("top", "0", "important");
    input.style.setProperty("width", "1px", "important");
    input.style.setProperty("height", "1px", "important");
    input.style.setProperty("opacity", "0", "important");

    const label = document.createElement("label");
    label.className = "nativeCoverAction";
    label.htmlFor = "coverEditorInput";
    label.setAttribute("role", "menuitem");
    label.setAttribute("tabindex", "0");
    label.textContent = "▧ Editar portada";
    label.style.cssText = [
      "width:100%",
      "border:0",
      "background:transparent",
      "color:#1f2937",
      "border-radius:11px",
      "padding:10px 12px",
      "text-align:left",
      "font-size:14px",
      "font-weight:700",
      "display:flex",
      "align-items:center",
      "gap:9px",
      "cursor:pointer",
      "box-sizing:border-box"
    ].join(";");
    oldButton.replaceWith(label);

    // A genuine label tap now opens Photos/Files natively. We only process the result here.
    input.addEventListener("change", (event) => {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      const menu = document.querySelector("#bookActionMenu");
      menu?.classList.remove("open");
      if (file) saveCover(file, id);
    }, true);

    label.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      input.dataset.bookId = currentBookId;
      input.value = "";
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // interaction-v19 resets/clones the old menu/input first; install after that listener runs.
    installNativePicker();
  });
})();
