// Narrador v46 — recover Home reliably from IndexedDB after PWA startup/update races.
// Never treats a transient IndexedDB read as an empty library.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s) => document.querySelector(s);
  let running = false;
  let timer = 0;

  const esc = (s = "") => String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const author = (b) => String(b?.author || "Autor no especificado").trim() || "Autor no especificado";
  const initials = (t = "Narrador") => String(t).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase()).join("") || "NV";
  const mins = (n) => { n = Math.max(0, Math.round(n || 0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`; };

  function readBooksOnce() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onerror = () => reject(req.error || new Error("db_open_failed"));
      req.onsuccess = () => {
        const db = req.result;
        let tx;
        try { tx = db.transaction(STORE, "readonly"); } catch (e) { db.close(); reject(e); return; }
        const get = tx.objectStore(STORE).getAll();
        get.onerror = () => { try { db.close(); } catch (_) {} reject(get.error || new Error("db_read_failed")); };
        get.onsuccess = () => { const rows = get.result || []; try { db.close(); } catch (_) {} resolve(rows); };
      };
    });
  }

  async function readBooksRetry() {
    const waits = [0, 70, 160, 320, 650, 1000];
    let last = [];
    for (const wait of waits) {
      if (wait) await new Promise(r => setTimeout(r, wait));
      try {
        const rows = await readBooksOnce();
        last = rows;
        if (rows.length) return rows;
      } catch (_) {}
    }
    return last;
  }

  function setCover(el, book) {
    if (!el) return;
    if (book?.coverDataUrl) {
      el.style.backgroundImage = `url("${String(book.coverDataUrl).replace(/"/g, "%22")}")`;
      el.classList.add("hasCustomCover");
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.classList.remove("hasCustomCover");
      el.textContent = initials(book?.title);
    }
  }

  function renderBook(book) {
    const host = $("#homeFeatured");
    if (!host || !book) return false;
    const total = Math.max(1, book.chapters?.length || 1);
    const ci = Math.max(0, Math.min(Number(book.lastChapter || 0), total - 1));
    const pct = Math.round((ci / Math.max(1, total - 1)) * 100);
    const totalMin = Math.max(1, Math.round((book.charCount || 0) / 900));
    const elapsed = Math.round(totalMin * pct / 100);

    host.classList.remove("hidden");
    $("#homeEmpty")?.classList.add("hidden");
    host.dataset.bookId = String(book.id);
    host.dataset.chapter = String(ci);
    host.innerHTML = `<div class="v18HomeShell" data-book-id="${esc(book.id)}">
      <div class="v18HomeCover"></div>
      <div class="v18HomeTitle">${esc(book.title)}</div>
      <div class="v18HomeAuthor">${esc(author(book))}</div>
      <button class="v18Open" type="button" data-v19-home="read">▱ Abrir</button>
      <div class="v18Player">
        <div class="v18Guide">Narrador está leyendo para ti</div>
        <h3>${esc(book.title)}</h3>
        <div class="v18PlayerAuthor">${esc(author(book))} · ${esc(book.chapters?.[ci]?.title || `Capítulo ${ci + 1}`)}</div>
        <div class="v18Progress"><i style="width:${pct}%"></i></div>
        <div class="v18Times"><span>${mins(elapsed)}</span><span>${mins(totalMin)}</span></div>
        <div class="v18Transport"><button type="button" data-v19-home="prev">◀</button><button class="homePlayerPlay" type="button" data-v19-home="play">▶</button><button type="button" data-v19-home="next">▶</button></div>
        <div class="v18Wave">${Array.from({length:32}, () => "<span></span>").join("")}</div>
        <div class="v18Quick"><button class="homeQuickAction" type="button" data-v19-home="speed"><i class="homeQuickIcon">↗</i><span><strong>Velocidad</strong><span>0.95×</span></span></button><button class="homeQuickAction" type="button" data-v19-home="voice"><i class="homeQuickIcon">◉</i><span><strong>Elegir voz</strong><span>Preferencias de narración</span></span></button></div>
      </div>
    </div>`;
    setCover(host.querySelector(".v18HomeCover"), book);
    return true;
  }

  async function ensureHome() {
    if (running) return;
    const host = $("#homeFeatured");
    if (!host) return;
    if (host.querySelector(".v18HomeShell") && !host.classList.contains("hidden")) {
      $("#homeEmpty")?.classList.add("hidden");
      return;
    }
    running = true;
    try {
      const books = (await readBooksRetry()).sort((a,b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0));
      if (books.length) renderBook(books[0]);
      // If still empty, leave the existing empty state alone. A later retry can recover it.
    } finally {
      running = false;
    }
  }

  function schedule(delay = 0) {
    clearTimeout(timer);
    timer = setTimeout(() => ensureHome().catch(() => {}), delay);
  }

  function init() {
    schedule(0);
    schedule(120);
    setTimeout(() => schedule(0), 450);
    setTimeout(() => schedule(0), 1200);
    setTimeout(() => schedule(0), 2600);

    const host = $("#homeFeatured");
    if (host) {
      new MutationObserver(() => {
        if (!host.querySelector(".v18HomeShell")) schedule(80);
      }).observe(host, { childList: true });
    }

    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(50); });
    window.addEventListener("pageshow", () => schedule(50));
    window.addEventListener("focus", () => schedule(80));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.__narradorEnsureHome = ensureHome;
})();