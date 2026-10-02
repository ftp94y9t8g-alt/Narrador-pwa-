// Narrador v49 — fixes iPhone speech start, stable system-voice selection, and History layout/progress.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const STYLE = {
    warm: { rate: 0.95, pitch: 1.00 },
    cinematic: { rate: 0.90, pitch: 0.97 },
    expressive: { rate: 1.00, pitch: 1.03 },
    calm: { rate: 0.86, pitch: 0.99 },
  };

  let booksCache = [];
  let historyPatching = false;
  const speech = {
    book: null,
    chapterIndex: 0,
    blocks: [],
    blockIndex: 0,
    playing: false,
    token: 0,
    utterance: null,
    retryTimer: 0,
  };

  function toast(message, ms = 3200) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), ms);
  }

  function prefs() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch (_) {}
    return {
      engine: p?.engine || "system",
      language: p?.language || "auto",
      voice: p?.voice || "",
      style: p?.style || "warm",
      speed: String(p?.speed || "0.95"),
    };
  }

  function savePrefs(next) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...prefs(), ...next })); } catch (_) {}
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readBooks() {
    try {
      const db = await openDB();
      const rows = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
      booksCache = rows;
      return rows;
    } catch (_) {
      return booksCache;
    }
  }

  async function putBook(book) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(book);
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
      if (buf && (buf + " " + s).length > 220) {
        out.push(buf);
        buf = "";
      }
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

  function detectLanguage(text = "") {
    const s = String(text).slice(0, 4000).toLowerCase();
    const es = (s.match(/\b(el|la|los|las|que|de|del|una|un|por|para|con|como|pero|era|su|sus)\b/g) || []).length;
    const en = (s.match(/\b(the|and|of|to|in|was|that|with|for|his|her|had|but|as)\b/g) || []).length;
    return es >= en ? "es" : "en";
  }

  function activeLanguage(book = speech.book, chapterIndex = speech.chapterIndex) {
    const p = prefs();
    if (p.language === "es" || p.language === "en") return p.language;
    return detectLanguage(book?.chapters?.[chapterIndex]?.text || "");
  }

  function voiceFromPrefs(forceDefault = false) {
    if (forceDefault) return null;
    const list = speechSynthesis.getVoices();
    const p = prefs();
    const lang = activeLanguage();
    let chosen = null;
    if (p.voice && String(p.voice).includes("|")) chosen = list.find(v => `${v.name}|${v.lang}` === p.voice);
    if (!chosen && p.voice && !Number.isNaN(Number(p.voice))) chosen = list[Number(p.voice)] || null;
    if (!chosen && p.voice) chosen = list.find(v => v.name === p.voice || `${v.name} · ${v.lang}` === p.voice);
    if (!chosen) chosen = list.find(v => v.lang?.toLowerCase().startsWith(lang) && /premium|enhanced|natural|siri|m[oó]nica/i.test(v.name || ""));
    if (!chosen) chosen = list.find(v => v.lang?.toLowerCase().startsWith(lang));
    return chosen || null;
  }

  function updatePlayUI() {
    $$("#homeFeatured [data-home45-action='play']").forEach(btn => {
      btn.textContent = speech.playing ? "Ⅱ" : "▶";
    });
    $$("#historyList .historyRow").forEach(row => {
      const icon = row.querySelector(".historyPlay");
      if (!icon) return;
      icon.textContent = speech.playing && speech.book && String(row.dataset.bookId) === String(speech.book.id) ? "Ⅱ" : "▶";
    });
  }

  function stopSpeech(show = true) {
    speech.token++;
    speech.playing = false;
    speech.utterance = null;
    clearTimeout(speech.retryTimer);
    try { speechSynthesis.cancel(); } catch (_) {}
    if (show) updatePlayUI();
  }

  function saveSpeechProgress() {
    if (!speech.book) return;
    speech.book.lastChapter = speech.chapterIndex;
    speech.book.lastSegment = speech.blockIndex;
    speech.book.lastPlayedAt = Date.now();
    putBook(speech.book);
  }

  function finishBlock(token) {
    if (token !== speech.token || !speech.playing) return;
    if (speech.blockIndex < speech.blocks.length - 1) {
      speech.blockIndex++;
      saveSpeechProgress();
      speakBlock(token, false, 0);
      return;
    }
    if (speech.chapterIndex < (speech.book?.chapters?.length || 1) - 1) {
      speech.chapterIndex++;
      speech.blockIndex = 0;
      speech.blocks = splitText(speech.book.chapters?.[speech.chapterIndex]?.text || "");
      saveSpeechProgress();
      speakBlock(token, false, 0);
      return;
    }
    speech.playing = false;
    saveSpeechProgress();
    updatePlayUI();
  }

  function speakBlock(token, forceDefault = false, retry = 0) {
    if (token !== speech.token || !speech.playing) return;
    const text = speech.blocks[speech.blockIndex];
    if (!text) return finishBlock(token);

    const p = prefs();
    const style = STYLE[p.style] || STYLE.warm;
    const u = new SpeechSynthesisUtterance(text);
    const voice = voiceFromPrefs(forceDefault);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = activeLanguage() === "es" ? "es-ES" : "en-US";
    }
    u.rate = Math.max(0.68, Math.min(1.25, style.rate * Number(p.speed || 0.95)));
    u.pitch = style.pitch;
    u.volume = 1;
    speech.utterance = u;
    let started = false;

    u.onstart = () => {
      if (token !== speech.token) return;
      started = true;
      updatePlayUI();
    };
    u.onend = () => {
      if (token !== speech.token || !speech.playing) return;
      speech.utterance = null;
      finishBlock(token);
    };
    u.onerror = () => {
      if (token !== speech.token || !speech.playing) return;
      if (retry < 1) return retrySystem(token);
      speech.playing = false;
      updatePlayUI();
      toast("La voz del iPhone no pudo iniciar. Prueba otra voz en Narración.", 4200);
    };

    try {
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    } catch (_) {
      if (retry < 1) return retrySystem(token);
      speech.playing = false;
      updatePlayUI();
      toast("No pude iniciar la voz del iPhone.", 3800);
      return;
    }

    clearTimeout(speech.retryTimer);
    speech.retryTimer = setTimeout(() => {
      if (token !== speech.token || !speech.playing || started) return;
      if (retry < 1) retrySystem(token);
      else {
        speech.playing = false;
        updatePlayUI();
        toast("La voz del iPhone no respondió. Cambia de voz y vuelve a intentar.", 4300);
      }
    }, retry ? 1400 : 850);
  }

  function retrySystem(token) {
    if (token !== speech.token || !speech.playing) return;
    try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (_) {}
    setTimeout(() => speakBlock(token, true, 1), 110);
  }

  function prepareSpeech(book) {
    if (!book) return false;
    speech.book = book;
    speech.chapterIndex = Math.max(0, Math.min(Number(book.lastChapter || 0), Math.max(0, (book.chapters?.length || 1) - 1)));
    speech.blocks = splitText(book.chapters?.[speech.chapterIndex]?.text || "");
    speech.blockIndex = Math.max(0, Math.min(Number(book.lastSegment || 0), Math.max(0, speech.blocks.length - 1)));
    return speech.blocks.length > 0;
  }

  function startSpeechFromGesture(book) {
    if (speech.playing) return stopSpeech();
    if (!book || !prepareSpeech(book)) return toast("No encontré texto para narrar.");

    speech.playing = true;
    const token = ++speech.token;
    speech.book.lastPlayedAt = Date.now();
    putBook(speech.book);
    updatePlayUI();
    try { speechSynthesis.resume(); } catch (_) {}
    speakBlock(token, false, 0);
  }

  function currentHomeBook() {
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) {
      const found = booksCache.find(b => String(b.id) === String(id));
      if (found) return found;
    }
    return [...booksCache].sort((a,b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0))[0] || null;
  }

  function normalizeVoiceSelect() {
    const select = $("#homeVoice45");
    if (!select || prefs().engine !== "system") return;
    const list = speechSynthesis.getVoices();
    if (!list.length) return;
    const saved = prefs().voice;
    let stableSaved = saved;
    if (saved && !String(saved).includes("|") && !Number.isNaN(Number(saved))) {
      const old = list[Number(saved)];
      if (old) stableSaved = `${old.name}|${old.lang}`;
    }
    [...select.options].forEach(option => {
      const idx = Number(option.value);
      if (!Number.isNaN(idx) && list[idx]) option.value = `${list[idx].name}|${list[idx].lang}`;
    });
    if (stableSaved && [...select.options].some(o => o.value === stableSaved)) select.value = stableSaved;
    if (stableSaved !== saved) savePrefs({ voice: stableSaved });
  }

  function historyPercent(book) {
    const chapters = Math.max(1, book?.chapters?.length || 1);
    const ci = Math.max(0, Math.min(Number(book?.lastChapter || 0), chapters - 1));
    const blocks = splitText(book?.chapters?.[ci]?.text || "");
    const bi = Math.max(0, Math.min(Number(book?.lastSegment || 0), Math.max(0, blocks.length - 1)));
    const inside = blocks.length > 1 ? bi / blocks.length : 0;
    return Math.max(0, Math.min(100, Math.round(((ci + inside) / chapters) * 100)));
  }

  async function patchHistory() {
    if (historyPatching) return;
    const wrap = $("#historyList");
    if (!wrap) return;
    historyPatching = true;
    try {
      const all = await readBooks();
      const byTitle = new Map(all.map(b => [String(b.title || "").trim(), b]));
      $$("#historyList .historyRow").forEach(row => {
        const title = row.querySelector("h4")?.textContent?.trim() || "";
        const book = byTitle.get(title);
        if (!book) return;
        row.dataset.bookId = String(book.id);
        const pct = historyPercent(book);
        const ci = Math.max(0, Math.min(Number(book.lastChapter || 0), Math.max(0, (book.chapters?.length || 1) - 1)));
        const chapterTitle = book.chapters?.[ci]?.title || `Capítulo ${ci + 1}`;
        const meta = row.querySelector(".historyMeta p");
        const expected = `${chapterTitle} · ${pct}% del libro`;
        if (meta && meta.textContent !== expected) meta.textContent = expected;
        const bar = row.querySelector(".historyProgress i");
        if (bar) bar.style.width = `${pct}%`;
      });
      updatePlayUI();
    } finally {
      historyPatching = false;
    }
  }

  function installStyle() {
    if ($("#historySpeechV49Style")) return;
    const style = document.createElement("style");
    style.id = "historySpeechV49Style";
    style.textContent = `
      html,body{overflow-x:hidden!important;max-width:100vw!important}
      .shell{overflow-x:hidden!important}
      #historyView{width:100%!important;max-width:760px!important;min-width:0!important;margin:0 auto!important;overflow-x:hidden!important;overscroll-behavior-x:none!important;touch-action:pan-y!important}
      #historyView .mainHeader,#historyView .historyHead,#historyView>p,#historyList{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
      #historyList{display:grid!important;grid-template-columns:minmax(0,1fr)!important;justify-items:stretch!important;gap:10px!important;padding:0!important;overflow:hidden!important}
      #historyList .historyRow{width:100%!important;max-width:100%!important;min-width:0!important;display:grid!important;grid-template-columns:50px minmax(0,1fr) 38px!important;align-items:center!important;gap:10px!important;overflow:hidden!important;padding:10px!important;margin:0!important;transform:none!important;box-sizing:border-box!important}
      #historyList .historyCover{width:50px!important;height:66px!important;min-width:50px!important;border-radius:10px!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important;background-color:#fff!important}
      #historyList .historyMeta{min-width:0!important;max-width:100%!important;overflow:hidden!important;text-align:left!important}
      #historyList .historyMeta h4,#historyList .historyMeta p,#historyList .historyAuthor{display:block!important;max-width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #historyList .historyMeta h4{margin:0 0 3px!important}
      #historyList .historyMeta p{margin:2px 0 5px!important}
      #historyList .historyProgress{width:100%!important;max-width:100%!important;overflow:hidden!important}
      #historyList .historyPlay{width:34px!important;height:34px!important;border-radius:50%!important;display:grid!important;place-items:center!important;flex:none!important;background:#eef3ff!important;color:#2f6df6!important;font-weight:900!important;line-height:1!important}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyle();
    readBooks().then(() => patchHistory());
    normalizeVoiceSelect();

    const history = $("#historyList");
    if (history) {
      new MutationObserver(() => setTimeout(patchHistory, 20)).observe(history, { childList: true });
    }

    window.addEventListener("pointerdown", (event) => {
      const play = event.target?.closest?.("#homeFeatured [data-home45-action='play']");
      if (play && prefs().engine === "system") {
        try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (_) {}
        event.stopImmediatePropagation();
        return;
      }
      if (event.target?.closest?.("#homeFeatured [data-home45-action='voice']")) {
        setTimeout(normalizeVoiceSelect, 30);
      }
    }, true);

    window.addEventListener("click", (event) => {
      const homePlay = event.target?.closest?.("#homeFeatured [data-home45-action='play']");
      if (homePlay && prefs().engine === "system") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const book = currentHomeBook();
        if (!book) {
          readBooks().then(() => toast("Preparé el libro. Toca Play otra vez."));
          return;
        }
        startSpeechFromGesture(book);
        return;
      }

      const historyPlay = event.target?.closest?.("#historyList .historyPlay");
      if (historyPlay) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const row = historyPlay.closest(".historyRow");
        const book = booksCache.find(b => String(b.id) === String(row?.dataset.bookId));
        if (!book) return;
        if (prefs().engine === "system") {
          try { speechSynthesis.cancel(); speechSynthesis.resume(); } catch (_) {}
          startSpeechFromGesture(book);
        } else {
          toast("La reproducción IA se inicia desde Inicio.");
        }
      }
    }, true);

    document.addEventListener("change", (event) => {
      if (event.target?.matches?.("#homeVoice45,#homeLanguage45,#homeEngine45")) {
        setTimeout(() => {
          normalizeVoiceSelect();
          if (speech.playing) stopSpeech();
        }, 0);
      }
    }, true);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      readBooks().then(() => patchHistory());
      if (speech.playing) {
        try { speechSynthesis.resume(); } catch (_) {}
      }
    });

    speechSynthesis.addEventListener?.("voiceschanged", () => setTimeout(normalizeVoiceSelect, 0));
    setTimeout(() => readBooks().then(() => patchHistory()), 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.__narradorSpeech49 = { stop: stopSpeech, playBook: startSpeechFromGesture, patchHistory };
})();