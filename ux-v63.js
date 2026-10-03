// Narrador v63 — consolidate playback into the v61 Now Playing surface.
// No speech/AI engine code is replaced here; this layer only routes UI and keeps surfaces in sync.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  let routing = false;
  let syncing = false;
  let lastSurface = "";

  function openDB() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} reject(new Error("db-upgrade")); };
    });
  }

  async function allBooks() {
    try {
      const db = await openDB();
      const rows = await new Promise((resolve,reject) => {
        const req = db.transaction(STORE,"readonly").objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
      return rows;
    } catch (_) { return []; }
  }

  async function putBook(book) {
    try {
      const db = await openDB();
      await new Promise((resolve,reject) => {
        const req = db.transaction(STORE,"readwrite").objectStore(STORE).put(book);
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
      return true;
    } catch (_) { return false; }
  }

  function detailTitle() {
    return String($("#bookTitle")?.textContent || $("#playerBook")?.textContent || "").trim();
  }

  async function detailBook() {
    const rows = await allBooks();
    const title = detailTitle();
    if (title) {
      const match = rows.find(b => String(b.title || "").trim() === title);
      if (match) return match;
    }
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) return rows.find(b => String(b.id) === String(id)) || null;
    return [...rows].sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0))[0] || null;
  }

  function activeViewId() {
    const active = $$(".view.active");
    const detail = active.find(v => ["readerView","playerView","bookView","processingView"].includes(v.id));
    return detail?.id || active[0]?.id || "";
  }

  function syncSurfaceChrome() {
    if (syncing) return;
    syncing = true;
    try {
      const active = activeViewId();
      const nowOpen = $("#n61NowPlaying")?.classList.contains("open");
      const allowed = ["homeView","libraryView","historyView","settingsView"].includes(active) && !nowOpen;
      document.body.classList.toggle("n63MiniAllowed", allowed);
      document.body.classList.toggle("n63DedicatedSurface", !allowed);
      document.body.classList.toggle("n63NowOpen", !!nowOpen);
      if (active !== lastSurface) {
        lastSurface = active;
        document.body.dataset.n63Surface = active || "none";
      }
    } finally { syncing = false; }
  }

  async function selectBookChapter(book,index,{openNow=true,refreshHome=true}={}) {
    if (!book?.chapters?.length) return;
    const chapter = Math.max(0,Math.min(Number(index || 0),book.chapters.length-1));
    book.lastChapter = chapter;
    book.lastSegment = 0;
    book.lastPlayedAt = Date.now();
    await putBook(book);

    const home = $("#homeFeatured");
    if (home) {
      home.dataset.bookId = String(book.id);
      home.dataset.chapter = String(chapter);
    }

    if (refreshHome) {
      try { await Promise.resolve(window.__narradorRefreshHome47?.()); } catch (_) {}
      try { await Promise.resolve(window.__narradorUX62?.refresh?.()); } catch (_) {}
    }
    try { await Promise.resolve(window.__narradorUX61?.refresh?.()); } catch (_) {}

    if (openNow) {
      try { window.__narradorUX61?.openNowPlaying?.(); } catch (_) {}
      setTimeout(syncSurfaceChrome,0);
    }
  }

  async function routeBookChapter(row) {
    if (routing || !row) return;
    routing = true;
    try {
      const book = await detailBook();
      if (!book) return;
      const rows = $$("#bookView #chapters .chapterRow");
      const index = Math.max(0,rows.indexOf(row));
      await selectBookChapter(book,index,{openNow:true,refreshHome:true});
    } finally { routing = false; }
  }

  async function recoverLegacyPlayer() {
    const player = $("#playerView");
    if (!player?.classList.contains("active") || routing) return;
    routing = true;
    try {
      const book = await detailBook();
      const index = Math.max(0,Number($("#playerChapterSelect")?.value || book?.lastChapter || 0));
      if (book) await selectBookChapter(book,index,{openNow:false,refreshHome:true});

      player.classList.remove("active");
      const bookView = $("#bookView");
      if (bookView) bookView.classList.add("active");
      document.body.dataset.detailView = "1";
      try { window.__narradorUX61?.openNowPlaying?.(); } catch (_) {}
    } finally {
      routing = false;
      setTimeout(syncSurfaceChrome,0);
    }
  }

  // A chapter selected from the modern chapter sheet keeps the existing playback
  // semantics from v56, then returns the user to Now Playing so there is only one
  // visible playback destination.
  function reopenAfterSheetChapter() {
    setTimeout(async () => {
      try { await Promise.resolve(window.__narradorRefreshHome47?.()); } catch (_) {}
      try { await Promise.resolve(window.__narradorUX61?.refresh?.()); } catch (_) {}
      try { await Promise.resolve(window.__narradorUX62?.refresh?.()); } catch (_) {}
      try { window.__narradorUX61?.openNowPlaying?.(); } catch (_) {}
      syncSurfaceChrome();
    },180);
  }

  function bindRouting() {
    // Window capture runs before legacy document/target click handlers.
    window.addEventListener("click", event => {
      const chapter = event.target?.closest?.("#bookView #chapters .chapterRow");
      if (chapter) {
        event.preventDefault();
        event.stopImmediatePropagation();
        routeBookChapter(chapter);
        return;
      }

      if (event.target?.closest?.("#dailySheet56 [data-chapter56]")) reopenAfterSheetChapter();
      setTimeout(syncSurfaceChrome,0);
    },true);
  }

  function installObservers() {
    $$(".view").forEach(view => {
      if (view.dataset.n63Observed === "1") return;
      view.dataset.n63Observed = "1";
      new MutationObserver(() => {
        syncSurfaceChrome();
        if (view.id === "playerView" && view.classList.contains("active")) setTimeout(recoverLegacyPlayer,0);
      }).observe(view,{attributes:true,attributeFilter:["class"]});
    });

    const watchNow = () => {
      const now = $("#n61NowPlaying");
      if (!now || now.dataset.n63Observed === "1") return;
      now.dataset.n63Observed = "1";
      new MutationObserver(syncSurfaceChrome).observe(now,{attributes:true,attributeFilter:["class"]});
    };
    watchNow();
    setTimeout(watchNow,250);
    setTimeout(watchNow,900);
  }

  function install() {
    bindRouting();
    installObservers();
    syncSurfaceChrome();
    recoverLegacyPlayer();

    window.addEventListener("pageshow",() => setTimeout(syncSurfaceChrome,100));
    window.addEventListener("focus",() => setTimeout(syncSurfaceChrome,100));
    window.addEventListener("narrador:auth-ready",() => setTimeout(syncSurfaceChrome,120));
    document.addEventListener("visibilitychange",() => { if (!document.hidden) setTimeout(syncSurfaceChrome,80); });

    // Light heartbeat only reconciles visibility; it never rewrites the Home DOM.
    setInterval(syncSurfaceChrome,700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

  window.__narradorUX63 = { sync:syncSurfaceChrome, selectBookChapter };
})();