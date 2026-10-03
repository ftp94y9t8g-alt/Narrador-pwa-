// Narrador v55 — visible Home skip controls for system and AI playback.
(() => {
  const BOOK_DB = "narrador-db-v1";
  const AUDIO_DB = "narrador-audio-v1";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);
  let books = [];
  let decorating = false;

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }

  function toast(message, ms = 2800) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), ms);
  }

  function openDB(name, version) {
    return new Promise((resolve, reject) => {
      const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadBooks() {
    try {
      const db = await openDB(BOOK_DB, 1);
      books = await new Promise((resolve, reject) => {
        const req = db.transaction("books", "readonly").objectStore("books").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
    } catch (_) {}
    return books;
  }

  async function putBook(book) {
    try {
      const db = await openDB(BOOK_DB, 1);
      await new Promise((resolve, reject) => {
        const req = db.transaction("books", "readwrite").objectStore("books").put(book);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
    } catch (_) {}
  }

  function splitText(text = "") {
    const sentences = String(text).replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
    const out = [];
    let buf = "";
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      if (buf && (buf + " " + s).length > 220) { out.push(buf); buf = ""; }
      if (s.length > 260 && !buf) {
        let rest = s;
        while (rest.length > 220) {
          let cut = rest.lastIndexOf(" ", 210);
          if (cut < 120) cut = 210;
          out.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        buf = rest;
      } else {
        buf += (buf ? " " : "") + s;
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.length ? out : [String(text).trim()].filter(Boolean);
  }

  function homeBook() {
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) {
      const found = books.find(b => String(b.id) === String(id));
      if (found) return found;
    }
    return [...books].sort((a,b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0))[0] || null;
  }

  function shiftBookTextPosition(book, direction) {
    if (!book?.chapters?.length) return false;
    let chapter = Math.max(0, Math.min(Number(book.lastChapter || 0), book.chapters.length - 1));
    let blocks = splitText(book.chapters[chapter]?.text || "");
    let block = Math.max(0, Math.min(Number(book.lastSegment || 0), Math.max(0, blocks.length - 1)));

    if (direction > 0) {
      if (block + 1 < blocks.length) block++;
      else if (chapter + 1 < book.chapters.length) { chapter++; block = 0; }
      else return false;
    } else {
      if (block > 0) block--;
      else if (chapter > 0) {
        chapter--;
        blocks = splitText(book.chapters[chapter]?.text || "");
        block = Math.max(0, blocks.length - 1);
      } else return false;
    }

    book.lastChapter = chapter;
    book.lastSegment = block;
    book.lastPlayedAt = Date.now();
    return true;
  }

  function skipSystem(direction) {
    const book = homeBook();
    if (!book) return toast("No pude localizar el libro actual.");
    if (!shiftBookTextPosition(book, direction)) return toast(direction > 0 ? "Ya estás al final." : "Ya estás al principio.");

    // Keep the speech start inside the user's tap for iPhone reliability.
    try { window.__narradorSpeech49?.stop?.(false); } catch (_) {}
    try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (_) {}
    window.__narradorSpeech49?.playBook?.(book);
    putBook(book);
  }

  async function getAIJob(bookId) {
    try {
      const db = await openDB(AUDIO_DB, 1);
      const job = await new Promise((resolve, reject) => {
        const req = db.transaction("jobs", "readonly").objectStore("jobs").get(String(bookId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
      return job;
    } catch (_) { return null; }
  }

  async function putAIJob(job) {
    const db = await openDB(AUDIO_DB, 1);
    await new Promise((resolve, reject) => {
      const req = db.transaction("jobs", "readwrite").objectStore("jobs").put(job);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    try { db.close(); } catch (_) {}
  }

  async function skipAI(direction) {
    const book = homeBook();
    if (!book) return toast("No pude localizar el libro actual.");
    const job = await getAIJob(book.id);
    if (!job || job.state !== "ready" || !job.chapterBlockCounts?.length) {
      toast("Prepara primero el audiolibro IA.");
      return;
    }

    let chapter = Math.max(0, Math.min(Number(job.playChapter || book.lastChapter || 0), job.chapterBlockCounts.length - 1));
    let block = Math.max(0, Number(job.playBlock || 0));
    if (direction > 0) {
      if (block + 1 < (job.chapterBlockCounts[chapter] || 1)) block++;
      else if (chapter + 1 < job.chapterBlockCounts.length) { chapter++; block = 0; }
      else return toast("Ya estás al final.");
    } else {
      if (block > 0) block--;
      else if (chapter > 0) { chapter--; block = Math.max(0, (job.chapterBlockCounts[chapter] || 1) - 1); }
      else return toast("Ya estás al principio.");
    }

    job.playChapter = chapter;
    job.playBlock = block;
    job.lastPlayedAt = Date.now();
    book.lastChapter = chapter;
    book.lastSegment = 0;
    book.lastPlayedAt = Date.now();
    await Promise.allSettled([putAIJob(job), putBook(book)]);
    try { window.__narradorAudiobook50?.stop?.(false); } catch (_) {}
    await window.__narradorAudiobook50?.play?.(book);
  }

  function skip(direction) {
    window.__narradorUnlockAudio?.();
    const engine = prefs()?.engine || "system";
    if (engine === "kokoro") skipAI(direction);
    else skipSystem(direction);
  }

  function installStyle() {
    if ($("#homeSkipStyle55")) return;
    const style = document.createElement("style");
    style.id = "homeSkipStyle55";
    style.textContent = `
      .homeSkip55{display:flex;justify-content:center;align-items:center;gap:14px;margin:2px 0 10px}
      .homeSkip55 button{min-width:86px;height:38px;border:1px solid #dfe5ef;border-radius:999px;background:#f8faff;color:#354158;font-size:13px;font-weight:850;box-shadow:0 5px 14px rgba(28,39,64,.05);touch-action:manipulation}
      .homeSkip55 button:active{transform:scale(.96)}
      .homeSkip55 small{color:#8a94a6;font-size:10px;font-weight:750}
      html[data-narrador-theme="dark"] .homeSkip55 button{background:#151c28!important;color:#e8edf5!important;border-color:#2b3749!important;box-shadow:none!important}
      html[data-narrador-theme="dark"] .homeSkip55 small{color:#8f9caf!important}
    `;
    document.head.appendChild(style);
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      installStyle();
      const host = $("#homeFeatured");
      const transport = host?.querySelector(".v18Transport");
      if (!transport || host.querySelector(".homeSkip55")) return;
      const row = document.createElement("div");
      row.className = "homeSkip55";
      row.setAttribute("aria-label", "Saltos rápidos");
      row.innerHTML = `<button type="button" data-home-skip55="-1" aria-label="Retroceder aproximadamente 15 segundos">↶ 15 s</button><small>salto rápido</small><button type="button" data-home-skip55="1" aria-label="Avanzar aproximadamente 15 segundos">15 s ↷</button>`;
      transport.insertAdjacentElement("afterend", row);
      row.addEventListener("pointerdown", event => {
        const button = event.target.closest?.("[data-home-skip55]");
        if (!button) return;
        window.__narradorUnlockAudio?.();
      }, { passive: true });
      row.addEventListener("click", event => {
        const button = event.target.closest?.("[data-home-skip55]");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        skip(Number(button.dataset.homeSkip55 || 0));
      });
    } finally { decorating = false; }
  }

  function init() {
    installStyle();
    loadBooks().then(decorate);
    decorate();
    const host = $("#homeFeatured");
    if (host && !host.dataset.skip55Observed) {
      host.dataset.skip55Observed = "1";
      new MutationObserver(() => setTimeout(decorate, 0)).observe(host, { childList: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  window.addEventListener("pageshow", () => setTimeout(() => loadBooks().then(decorate), 100));
  window.addEventListener("narrador:auth-ready", () => setTimeout(() => loadBooks().then(decorate), 120));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadBooks().then(decorate); });
})();
