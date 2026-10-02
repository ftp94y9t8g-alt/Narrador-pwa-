// Narrador v47 — final late Home recovery.
// Runs after the legacy body scripts so Home can no longer be left in a false empty state.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s) => document.querySelector(s);
  let refreshing = false;
  let timer = 0;
  let heartbeat = 0;

  const esc = (s = "") => String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
  const author = (b) => String(b?.author || "Autor no especificado").trim() || "Autor no especificado";
  const initials = (t = "Narrador") => String(t).split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "NV";
  const mins = (n) => {
    n = Math.max(0, Math.round(n || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  };

  // Deliberately omit a database version here. This opens whatever version already
  // exists on the iPhone and cannot trigger an accidental upgrade/empty-store race.
  function readBooks() {
    return new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME);
      } catch (_) {
        resolve([]);
        return;
      }

      req.onerror = () => resolve([]);
      req.onblocked = () => resolve([]);
      req.onupgradeneeded = () => {
        // Recovery must never create/modify the user's database.
        try { req.transaction?.abort(); } catch (_) {}
        resolve([]);
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          try { db.close(); } catch (_) {}
          resolve([]);
          return;
        }
        let tx;
        try {
          tx = db.transaction(STORE, "readonly");
        } catch (_) {
          try { db.close(); } catch (_) {}
          resolve([]);
          return;
        }
        const get = tx.objectStore(STORE).getAll();
        get.onerror = () => {
          try { db.close(); } catch (_) {}
          resolve([]);
        };
        get.onsuccess = () => {
          const rows = Array.isArray(get.result) ? get.result : [];
          try { db.close(); } catch (_) {}
          resolve(rows);
        };
      };
    });
  }

  function setCover(el, book) {
    if (!el) return;
    if (book?.coverDataUrl) {
      el.style.backgroundImage = `url("${String(book.coverDataUrl).replace(/"/g, "%22")}")`;
      el.style.backgroundSize = "contain";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
      el.classList.add("hasCustomCover");
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.classList.remove("hasCustomCover");
      el.textContent = initials(book?.title);
    }
  }

  function render(book) {
    const host = $("#homeFeatured");
    if (!host || !book) return false;

    const total = Math.max(1, book.chapters?.length || 1);
    const chapterIndex = Math.max(0, Math.min(Number(book.lastChapter || 0), total - 1));
    const pct = Math.round((chapterIndex / Math.max(1, total - 1)) * 100);
    const totalMin = Math.max(1, Math.round((book.charCount || 0) / 900));
    const elapsed = Math.round(totalMin * pct / 100);

    host.dataset.bookId = String(book.id);
    host.dataset.chapter = String(chapterIndex);
    host.classList.remove("hidden");
    $("#homeEmpty")?.classList.add("hidden");

    host.innerHTML = `<div class="v18HomeShell" data-book-id="${esc(book.id)}">
      <div class="v18HomeCover"></div>
      <div class="v18HomeTitle">${esc(book.title || "Libro")}</div>
      <div class="v18HomeAuthor">${esc(author(book))}</div>
      <button class="v18Open" type="button" data-v19-home="read">▱ Abrir</button>
      <div class="v18Player">
        <div class="v18Guide">Narrador está leyendo para ti</div>
        <h3>${esc(book.title || "Libro")}</h3>
        <div class="v18PlayerAuthor">${esc(author(book))} · ${esc(book.chapters?.[chapterIndex]?.title || `Capítulo ${chapterIndex + 1}`)}</div>
        <div class="v18Progress"><i style="width:${pct}%"></i></div>
        <div class="v18Times"><span>${mins(elapsed)}</span><span>${mins(totalMin)}</span></div>
        <div class="v18Transport">
          <button type="button" data-v19-home="prev">◀</button>
          <button class="homePlayerPlay" type="button" data-v19-home="play">▶</button>
          <button type="button" data-v19-home="next">▶</button>
        </div>
        <div class="v18Wave">${Array.from({ length: 32 }, () => "<span></span>").join("")}</div>
        <div class="v18Quick">
          <button class="homeQuickAction" type="button" data-v19-home="speed"><i class="homeQuickIcon">↗</i><span><strong>Velocidad</strong><span>0.95×</span></span></button>
          <button class="homeQuickAction" type="button" data-v19-home="voice"><i class="homeQuickIcon">◉</i><span><strong>Elegir voz</strong><span>Preferencias de narración</span></span></button>
        </div>
      </div>
    </div>`;

    setCover(host.querySelector(".v18HomeCover"), book);
    return true;
  }

  async function refresh(force = false) {
    if (refreshing) return false;
    const host = $("#homeFeatured");
    if (!host) return false;

    if (!force && host.querySelector(".v18HomeShell") && !host.classList.contains("hidden")) {
      $("#homeEmpty")?.classList.add("hidden");
      return true;
    }

    refreshing = true;
    try {
      const books = await readBooks();
      if (!books.length) return false;
      books.sort((a, b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0));
      return render(books[0]);
    } finally {
      refreshing = false;
    }
  }

  function schedule(delay = 0, force = false) {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(force).catch(() => {}), delay);
  }

  function install() {
    // Run after interaction-v19's initial render (it schedules its own render at ~80ms).
    schedule(140, true);
    setTimeout(() => schedule(0, true), 420);
    setTimeout(() => schedule(0, true), 1000);
    setTimeout(() => schedule(0, true), 2200);

    const host = $("#homeFeatured");
    if (host) {
      new MutationObserver(() => {
        if (!host.querySelector(".v18HomeShell") || host.classList.contains("hidden")) schedule(60, true);
      }).observe(host, { childList: true });
    }

    // Window capture fires before interaction-v19's document capture handler. This
    // guarantees a refresh whenever the user taps Inicio, even if that older handler
    // stops propagation afterwards.
    window.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".bottomNav .navItem[data-tab='home']")) {
        setTimeout(() => schedule(0, true), 90);
      }
    }, true);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule(80, true);
    });
    window.addEventListener("pageshow", () => schedule(100, true));
    window.addEventListener("focus", () => schedule(120, true));

    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (document.body?.dataset.mainTab !== "home") return;
      const current = $("#homeFeatured");
      if (current && (!current.querySelector(".v18HomeShell") || current.classList.contains("hidden"))) {
        refresh(true).catch(() => {});
      }
    }, 1800);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.__narradorRefreshHome47 = () => refresh(true);
})();