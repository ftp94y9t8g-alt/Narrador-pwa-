// Narrador v57 — fixes chapter sheet layout and makes speed changes immediate/reliable.
(() => {
  const BOOK_DB = "narrador-db-v1";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const SESSION_KEY = "narrador-auth-session-v51";
  const $ = (s) => document.querySelector(s);
  let books = [];
  let patchedMedia = false;

  function currentUserId() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return session?.userId ? String(session.userId) : "guest";
    } catch (_) { return "guest"; }
  }

  function liveSpeedKey() { return `narrador-live-speed-v57::${currentUserId()}`; }

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }

  function clampSpeed(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0.75, Math.min(1.50, n)) : 1.00;
  }

  function liveSpeed() {
    const stored = Number(localStorage.getItem(liveSpeedKey()));
    return Number.isFinite(stored) && stored > 0 ? clampSpeed(stored) : clampSpeed(prefs().speed || 1.00);
  }

  function setLiveSpeed(value) {
    const speed = clampSpeed(value);
    try { localStorage.setItem(liveSpeedKey(), String(speed)); } catch (_) {}
    syncSpeedUI(speed);
    applyRateToPlayingMedia();
    return speed;
  }

  function aiRate() {
    const base = clampSpeed(prefs().speed || 1.00);
    const desired = liveSpeed();
    return Math.max(0.65, Math.min(1.75, desired / Math.max(0.5, base)));
  }

  function syncSpeedUI(value = liveSpeed()) {
    const slider = $("#homeSpeed45");
    if (slider && prefs().engine === "kokoro") {
      slider.min = "0.75";
      slider.max = "1.50";
      slider.step = "0.05";
      slider.value = String(value);
    }
    const big = $("#homeSpeedValue45");
    if (big && prefs().engine === "kokoro") big.textContent = `${Number(value).toFixed(2)}×`;
    const marks = document.querySelector(".homeSpeedMarks45");
    if (marks && prefs().engine === "kokoro") marks.innerHTML = "<span>0.75×</span><span>1.00×</span><span>1.50×</span>";
    const card = $("#homeFeatured [data-home45-action='speed'] span span");
    if (card && prefs().engine === "kokoro") card.textContent = `${Number(value).toFixed(2)}×`;
    const detail = $("#speedRange");
    if (detail && prefs().engine === "kokoro") {
      detail.min = "0.75";
      detail.max = "1.50";
      detail.step = "0.05";
      if (document.activeElement !== detail) detail.value = String(value);
      const label = $("#speedLabel");
      if (label) label.textContent = `${Number(value).toFixed(2)}×`;
    }
  }

  function installStyle() {
    if ($("#polish57Style")) return;
    const style = document.createElement("style");
    style.id = "polish57Style";
    style.textContent = `
      #dailySheet56{overflow:hidden!important}
      #dailySheet56 .daily56Panel{
        box-sizing:border-box!important;
        width:auto!important;
        max-width:min(570px,calc(100vw - 20px))!important;
        max-height:calc(100dvh - env(safe-area-inset-top) - 26px)!important;
        overflow-x:hidden!important;
        overscroll-behavior:contain!important;
        padding-left:16px!important;
        padding-right:16px!important;
      }
      #dailySheet56 .daily56Head{
        position:sticky!important;
        top:-10px!important;
        z-index:4!important;
        margin:0 -6px 12px!important;
        padding:10px 6px 9px!important;
        background:var(--surface,#fff)!important;
      }
      #dailySheet56 .daily56Head h3{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      #dailySheet56 .daily56List,#dailySheet56 .daily56Item,#dailySheet56 .grow56{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
      #dailySheet56 .daily56Item{width:100%!important;overflow:hidden!important;align-items:flex-start!important}
      #dailySheet56 .daily56Item strong{
        white-space:normal!important;
        overflow:visible!important;
        text-overflow:clip!important;
        overflow-wrap:anywhere!important;
        word-break:normal!important;
        line-height:1.18!important;
      }
      #dailySheet56 .daily56Item .grow56>span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important}
      html[data-narrador-theme="dark"] #dailySheet56 .daily56Head{background:#141a24!important}
      .homeSpeedSlider45{touch-action:pan-x!important}
    `;
    document.head.appendChild(style);
  }

  async function loadBooks() {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(BOOK_DB, 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      books = await new Promise((resolve, reject) => {
        const req = db.transaction("books", "readonly").objectStore("books").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
    } catch (_) {}
    return books;
  }

  function homeBook() {
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) {
      const found = books.find(b => String(b.id) === String(id));
      if (found) return found;
    }
    return [...books].sort((a,b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0))[0] || null;
  }

  const playingMedia = new Set();

  function patchMediaPlayback() {
    if (patchedMedia || !window.HTMLMediaElement) return;
    patchedMedia = true;
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalPause = HTMLMediaElement.prototype.pause;

    HTMLMediaElement.prototype.play = function(...args) {
      try {
        if (prefs().engine === "kokoro") {
          this.playbackRate = aiRate();
          if ("preservesPitch" in this) this.preservesPitch = true;
          if ("webkitPreservesPitch" in this) this.webkitPreservesPitch = true;
        }
      } catch (_) {}
      const result = originalPlay.apply(this, args);
      playingMedia.add(this);
      Promise.resolve(result).catch(() => playingMedia.delete(this));
      const clear = () => playingMedia.delete(this);
      this.addEventListener?.("ended", clear, { once:true });
      this.addEventListener?.("error", clear, { once:true });
      return result;
    };

    HTMLMediaElement.prototype.pause = function(...args) {
      playingMedia.delete(this);
      return originalPause.apply(this, args);
    };
  }

  function applyRateToPlayingMedia() {
    if (prefs().engine !== "kokoro") return;
    const rate = aiRate();
    for (const media of [...playingMedia]) {
      try {
        if (media.ended) { playingMedia.delete(media); continue; }
        media.playbackRate = rate;
      } catch (_) {}
    }
  }

  function handleAISpeedEvent(event) {
    const target = event.target;
    if (!target?.matches?.("#homeSpeed45,#speedRange")) return false;
    if (prefs().engine !== "kokoro") return false;

    // AI audio is already generated. Speed is therefore a playback setting, not
    // a reason to invalidate/regenerate the saved audiobook.
    event.stopImmediatePropagation();
    event.stopPropagation();
    const value = setLiveSpeed(target.value);
    if (target.id === "speedRange") {
      const label = $("#speedLabel");
      if (label) label.textContent = `${value.toFixed(2)}×`;
    }
    return true;
  }

  function restartSystemAtNewSpeed() {
    if (prefs().engine === "kokoro") return;
    const play = $("#homeFeatured [data-home45-action='play']");
    const wasPlaying = /Ⅱ|❚❚/.test(play?.textContent || "") || speechSynthesis.speaking || speechSynthesis.pending;
    if (!wasPlaying) return;
    const book = homeBook();
    if (!book) return;
    try {
      window.__narradorSpeech49?.stop?.(false);
      speechSynthesis.cancel();
      speechSynthesis.resume();
      window.__narradorSpeech49?.playBook?.(book);
    } catch (_) {}
  }

  function installSpeedHandlers() {
    // Window capture happens before legacy/v50 document handlers. For IA we own
    // the speed event so changing speed never marks the prepared audiobook stale.
    window.addEventListener("input", event => { handleAISpeedEvent(event); }, true);
    window.addEventListener("change", event => {
      if (handleAISpeedEvent(event)) return;
      if (event.target?.matches?.("#homeSpeed45,#speedRange")) restartSystemAtNewSpeed();
    }, true);

    window.addEventListener("pointerdown", event => {
      if (event.target?.closest?.("#homeFeatured [data-home45-action='speed']")) {
        setTimeout(() => syncSpeedUI(), 40);
      }
    }, true);
  }

  function installObservers() {
    const host = $("#homeFeatured");
    if (host && !host.dataset.polish57Observed) {
      host.dataset.polish57Observed = "1";
      new MutationObserver(() => setTimeout(() => syncSpeedUI(), 20)).observe(host, { childList:true, subtree:true });
    }
    if (!document.documentElement.dataset.polish57SheetObserved) {
      document.documentElement.dataset.polish57SheetObserved = "1";
      new MutationObserver(() => {
        if ($("#dailySheet56")?.classList.contains("open")) installStyle();
        if ($("#homeControlSheet45")?.classList.contains("open")) syncSpeedUI();
      }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    }
  }

  function install() {
    installStyle();
    patchMediaPlayback();
    installSpeedHandlers();
    loadBooks().then(() => syncSpeedUI());
    installObservers();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
  window.addEventListener("pageshow", () => setTimeout(() => loadBooks().then(() => syncSpeedUI()), 100));
  window.addEventListener("narrador:auth-ready", () => setTimeout(() => loadBooks().then(() => syncSpeedUI()), 120));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadBooks().then(() => syncSpeedUI()); });
})();
