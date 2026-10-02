// Narrador v32: stable iPhone library controller + native cover picker.
// This file intentionally owns the entire Library toolbar so legacy click handlers
// cannot interfere. It also keeps file selection on native <label for=file-input> paths.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const VIEW_KEY = "narrador-library-view-v16";
  const ORDER_KEY = "narrador-library-order-v16";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let currentBookId = "";
  let activeFilter = "all";
  let organizing = false;
  let drag = null;
  let applyingOrder = false;
  let libraryObserver = null;

  // app.js still registers an old service-worker URL. Canonicalize every Narrador
  // registration before the deferred app module runs, so only one SW version exists.
  if ("serviceWorker" in navigator && !navigator.serviceWorker.__narradorV32Patched) {
    const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (url, options = {}) => {
      const src = String(url || "");
      if (/sw\.js(?:\?|$)/.test(src)) {
        return originalRegister("./sw.js?v=32", { ...options, updateViaCache: "none" });
      }
      return originalRegister(url, options);
    };
    try { navigator.serviceWorker.__narradorV32Patched = true; } catch (_) {}
  }

  function toast(message, ms = 2400) {
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

  async function allBooks() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      return [];
    }
  }

  async function bookById(id) {
    return (await allBooks()).find((b) => String(b.id) === String(id)) || null;
  }

  async function putBook(book) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function rows() {
    return $$("#library .bookRow");
  }

  function rowBook(row, byId, all) {
    const direct = byId.get(String(row.dataset.bookId || ""));
    if (direct) return direct;
    const title = row.querySelector("h4")?.textContent?.trim() || "";
    return all.find((b) => String(b.title || "").trim() === title) || null;
  }

  function addLibraryStyle() {
    if ($("#libraryV32Style")) return;
    const style = document.createElement("style");
    style.id = "libraryV32Style";
    style.textContent = `
      /* interface-v16 uses display:block!important / flex!important; filtering needs
         its own !important rule or Recientes/En progreso/search can never hide rows. */
      #library .bookRow.libraryFilteredOut{display:none!important}
      #libraryView .filterChip,#libraryView .viewToggle button,#libraryView .organizeBtn{
        touch-action:manipulation;-webkit-tap-highlight-color:transparent
      }
      #libraryView .filterChip:active,#libraryView .viewToggle button:active,#libraryView .organizeBtn:active{
        transform:scale(.97)
      }
      #libraryView .libraryImport{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
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

  // Use the exact PDF input that is already proven to open Files from Home.
  // No input.click(), no overlay, no second picker.
  function fixNativeImportPath() {
    const label = $("#libraryView .libraryImport");
    const workingInput = $("#pdfInput");
    if (!label || !workingInput) return;
    label.setAttribute("for", "pdfInput");
    try { label.htmlFor = "pdfInput"; } catch (_) {}
    label.setAttribute("aria-controls", "pdfInput");
  }

  // Remove only the legacy event listeners from Library toolbar controls. Interface
  // functions query these elements dynamically, so replacing them is safe.
  function replaceNodeWithoutListeners(selector) {
    const el = $(selector);
    if (!el) return null;
    const clone = el.cloneNode(true);
    el.replaceWith(clone);
    return clone;
  }

  function resetLibraryToolbarListeners() {
    replaceNodeWithoutListeners("#librarySearch");
    $$("#libraryView .filterChip").forEach((el) => {
      const clone = el.cloneNode(true);
      el.replaceWith(clone);
    });
    replaceNodeWithoutListeners("#gridViewBtn");
    replaceNodeWithoutListeners("#listViewBtn");
    replaceNodeWithoutListeners("#organizeBtn");
  }

  // app.js creates <button class=bookRow>, and interface-v16 inserts another button
  // inside it for •••. Nested buttons are invalid HTML and are especially flaky on iOS.
  // Convert the outer book row to a div while preserving its original open-book handler.
  function normalizeBookRows() {
    $$("#library button.bookRow").forEach((row) => {
      const replacement = document.createElement("div");
      for (const attr of [...row.attributes]) replacement.setAttribute(attr.name, attr.value);
      replacement.className = row.className;
      replacement.innerHTML = row.innerHTML;
      replacement.style.cssText = row.style.cssText;
      replacement.setAttribute("role", "button");
      replacement.setAttribute("tabindex", "0");
      replacement.onclick = row.onclick;
      replacement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          replacement.click();
        }
      });
      row.replaceWith(replacement);
    });
  }

  function currentView() {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  }

  function setView(view) {
    const wrap = $("#library");
    if (!wrap) return;
    const next = view === "list" ? "list" : "grid";
    wrap.dataset.view = next;
    try { localStorage.setItem(VIEW_KEY, next); } catch (_) {}
    $("#gridViewBtn")?.classList.toggle("active", next === "grid");
    $("#listViewBtn")?.classList.toggle("active", next === "list");
  }

  async function applyFilter() {
    const wrap = $("#library");
    if (!wrap) return;
    const all = await allBooks();
    const byId = new Map(all.map((b) => [String(b.id), b]));
    const search = String($("#librarySearch")?.value || "").trim().toLowerCase();
    const recent = new Set(
      [...all]
        .sort((a, b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0))
        .slice(0, 6)
        .map((b) => String(b.id))
    );
    const progress = new Set(
      all
        .filter((b) => (b.lastChapter || 0) > 0 || (b.lastSegment || 0) > 0)
        .map((b) => String(b.id))
    );

    rows().forEach((row) => {
      const book = rowBook(row, byId, all);
      const id = String(book?.id ?? row.dataset.bookId ?? "");
      const haystack = `${book?.title || row.querySelector("h4")?.textContent || ""} ${book?.author || row.querySelector(".libraryAuthor")?.textContent || ""}`.toLowerCase();
      let visible = !search || haystack.includes(search);
      if (activeFilter === "recent") visible = visible && recent.has(id);
      if (activeFilter === "progress") visible = visible && progress.has(id);
      row.classList.toggle("libraryFilteredOut", !visible);
    });
  }

  function chooseFilter(name, button) {
    activeFilter = ["recent", "progress"].includes(name) ? name : "all";
    $$("#libraryView .filterChip").forEach((chip) => chip.classList.toggle("active", chip === button));
    applyFilter();
  }

  function loadOrder() {
    try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]") || []; }
    catch (_) { return []; }
  }

  function saveOrder() {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(rows().map((r) => String(r.dataset.bookId || "")).filter(Boolean)));
    } catch (_) {}
  }

  function applyOrder() {
    const wrap = $("#library");
    if (!wrap || applyingOrder) return;
    const order = loadOrder();
    if (!order.length) return;
    const rank = new Map(order.map((id, index) => [String(id), index]));
    const current = rows();
    const sorted = [...current].sort((a, b) => (rank.get(String(a.dataset.bookId)) ?? 9999) - (rank.get(String(b.dataset.bookId)) ?? 9999));
    const same = current.every((row, index) => row === sorted[index]);
    if (same) return;
    applyingOrder = true;
    sorted.forEach((row) => wrap.appendChild(row));
    queueMicrotask(() => { applyingOrder = false; });
  }

  function toggleOrganize() {
    organizing = !organizing;
    const wrap = $("#library");
    const btn = $("#organizeBtn");
    wrap?.classList.toggle("organizing", organizing);
    if (btn) {
      btn.classList.toggle("active", organizing);
      btn.textContent = organizing ? "Listo" : "Organizar";
    }
    if (organizing) toast("Mantén y arrastra un libro para cambiar su posición.", 3000);
    else {
      if (drag) finishDrag();
      saveOrder();
    }
  }

  function startDrag(event, row) {
    if (!organizing || !row || event.target.closest?.(".bookMenuBtn")) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = { row, pointerId: event.pointerId };
    row.classList.add("dragging");
    try { row.setPointerCapture(event.pointerId); } catch (_) {}
    return true;
  }

  function moveDrag(event) {
    if (!drag) return;
    event.preventDefault();
    const wrap = $("#library");
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("#library .bookRow");
    if (!wrap || !target || target === drag.row || target.parentElement !== wrap) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    wrap.insertBefore(drag.row, before ? target : target.nextSibling);
  }

  function finishDrag() {
    if (!drag) return;
    drag.row.classList.remove("dragging");
    drag = null;
    saveOrder();
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
      book.coverDataUrl = await makeCover(file);
      await putBook(book);
      toast("Portada actualizada.");
      setTimeout(() => location.reload(), 160);
    } catch (error) {
      console.error("Narrador v32 cover:", error);
      toast("No pude usar esa imagen. Prueba con JPG o PNG.", 3800);
    }
  }

  function bindCoverInput() {
    const input = $("#coverEditorInput");
    if (!input || input.dataset.v32Bound === "1") return;
    input.dataset.v32Bound = "1";
    input.addEventListener("change", (event) => {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      const id = event.target.dataset.bookId || currentBookId;
      event.target.value = "";
      if (file) saveCover(file, id);
    }, true);
  }

  // Capture toolbar actions at window level, before any legacy document handlers.
  // File labels are deliberately excluded so iOS can perform their native default action.
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
      return;
    }

    if (!event.target.closest?.("#libraryView")) return;

    const chip = event.target.closest?.(".filterChip");
    if (chip) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chooseFilter(chip.dataset.filter || "all", chip);
      return;
    }

    const grid = event.target.closest?.("#gridViewBtn");
    if (grid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setView("grid");
      return;
    }

    const list = event.target.closest?.("#listViewBtn");
    if (list) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setView("list");
      return;
    }

    const organize = event.target.closest?.("#organizeBtn");
    if (organize) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleOrganize();
      return;
    }

    const row = event.target.closest?.("#library .bookRow");
    if (row && organizing) startDrag(event, row);
  }, true);

  window.addEventListener("pointermove", moveDrag, { capture: true, passive: false });
  window.addEventListener("pointerup", finishDrag, true);
  window.addEventListener("pointercancel", finishDrag, true);

  // Prevent the synthetic click that follows our pointerdown-owned toolbar actions.
  window.addEventListener("click", (event) => {
    if (!event.target.closest?.("#libraryView")) return;
    if (event.target.closest?.(".filterChip,#gridViewBtn,#listViewBtn,#organizeBtn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.id === "librarySearch") applyFilter();
  });

  function refreshLibraryAfterMutation() {
    if (applyingOrder) return;
    normalizeBookRows();
    applyOrder();
    setView(currentView());
    setTimeout(applyFilter, 0);
  }

  function init() {
    addLibraryStyle();
    fixNativeImportPath();
    resetLibraryToolbarListeners();
    fixNativeImportPath();
    bindCoverInput();
    normalizeBookRows();
    applyOrder();
    setView(currentView());
    applyFilter();

    const wrap = $("#library");
    if (wrap && !libraryObserver) {
      libraryObserver = new MutationObserver(refreshLibraryAfterMutation);
      libraryObserver.observe(wrap, { childList: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
