// Narrador v44 — stable Home playback controller for iPhone.
// Keeps Play / Previous / Next on Home, while leaving the v42 bottom sheets
// for Voice and Speed in place. It also repairs Home controls after every re-render.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);

  const STYLE = {
    warm: { rate: 0.95, pitch: 1.00, aiSpeed: 0.96 },
    cinematic: { rate: 0.90, pitch: 0.97, aiSpeed: 0.92 },
    expressive: { rate: 1.00, pitch: 1.03, aiSpeed: 1.00 },
    calm: { rate: 0.86, pitch: 0.99, aiSpeed: 0.88 },
  };

  const state = {
    book: null,
    chapterIndex: 0,
    segments: [],
    segmentIndex: 0,
    playing: false,
    loading: false,
    token: 0,
    speechAttempt: 0,
    utterance: null,
    audio: null,
    audioUrl: null,
    aiNext: null,
  };

  let observer = null;

  function toast(message, ms = 2800) {
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

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function allBooks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
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

  function detectLanguage(text = "") {
    const s = String(text).slice(0, 5000).toLowerCase();
    const es = (s.match(/\b(el|la|los|las|que|de|del|una|un|por|para|con|como|pero|había|estaba|era|su|sus)\b/g) || []).length;
    const en = (s.match(/\b(the|and|of|to|in|was|that|with|for|his|her|had|but|as|you)\b/g) || []).length;
    return es >= en ? "es" : "en";
  }

  function activeLanguage() {
    const p = prefs();
    if (p.language === "es" || p.language === "en") return p.language;
    return detectLanguage(state.book?.chapters?.[state.chapterIndex]?.text || "");
  }

  // Shorter passages make iOS system speech start more reliably and keep
  // transitions responsive without changing the book's stored chapter structure.
  function segmentText(text = "") {
    const paragraphs = String(text).split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const out = [];
    let buffer = "";
    const push = () => {
      const clean = buffer.trim();
      if (clean) out.push(clean);
      buffer = "";
    };
    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;
        if (buffer && (buffer + " " + s).length > 300) push();
        if (s.length > 430 && !buffer) {
          let rest = s;
          while (rest.length > 330) {
            let cut = Math.max(rest.lastIndexOf(",", 300), rest.lastIndexOf(";", 300), rest.lastIndexOf(" ", 300));
            if (cut < 190) cut = 300;
            out.push(rest.slice(0, cut + 1).trim());
            rest = rest.slice(cut + 1).trim();
          }
          buffer = rest;
        } else {
          buffer += (buffer ? " " : "") + s;
        }
      }
      if (buffer.length > 235) push();
    }
    push();
    return out.length ? out : [String(text).trim()].filter(Boolean);
  }

  async function ensureBook(force = false) {
    const host = $("#homeFeatured");
    const id = host?.dataset.bookId;
    if (!id) return null;
    if (!force && state.book && String(state.book.id) === String(id)) return state.book;
    const book = (await allBooks()).find(b => String(b.id) === String(id));
    if (!book) return null;
    state.book = book;
    state.chapterIndex = Math.max(0, Math.min(Number(host.dataset.chapter ?? book.lastChapter ?? 0), Math.max(0, (book.chapters?.length || 1) - 1)));
    state.segments = segmentText(book.chapters?.[state.chapterIndex]?.text || "");
    state.segmentIndex = Math.max(0, Math.min(Number(book.lastSegment || 0), Math.max(0, state.segments.length - 1)));
    updateUI();
    updateMediaSession();
    return book;
  }

  function clearAudio() {
    if (state.audio) {
      try { state.audio.onended = null; state.audio.onerror = null; state.audio.pause(); state.audio.src = ""; } catch (_) {}
      state.audio = null;
    }
    if (state.audioUrl) {
      try { URL.revokeObjectURL(state.audioUrl); } catch (_) {}
      state.audioUrl = null;
    }
  }

  function stopPlayback(update = true) {
    state.token++;
    state.speechAttempt++;
    state.playing = false;
    state.loading = false;
    state.aiNext = null;
    state.utterance = null;
    try { speechSynthesis.cancel(); } catch (_) {}
    clearAudio();
    if (update) updateUI();
  }

  async function saveProgress() {
    if (!state.book) return;
    state.book.lastChapter = state.chapterIndex;
    state.book.lastSegment = state.segmentIndex;
    state.book.lastPlayedAt = Date.now();
    try { await putBook(state.book); } catch (_) {}
  }

  function systemVoice(forceDefault = false) {
    if (forceDefault) return null;
    const list = speechSynthesis.getVoices();
    const p = prefs();
    const lang = activeLanguage();
    const numeric = Number(p.voice);
    let selected = null;
    if (Number.isInteger(numeric) && numeric >= 0 && list[numeric]) selected = list[numeric];
    if (!selected && p.voice) selected = list.find(v => `${v.name}|${v.lang}` === p.voice || v.name === p.voice);
    if (!selected) selected = list.find(v => v.lang?.toLowerCase().startsWith(lang) && /premium|enhanced|natural|siri|m[oó]nica/i.test(v.name || ""));
    if (!selected) selected = list.find(v => v.lang?.toLowerCase().startsWith(lang));
    return selected || null;
  }

  function updateUI() {
    const host = $("#homeFeatured");
    if (!host) return;
    const play = host.querySelector("[data-home44-action='play']");
    if (play) play.textContent = state.loading ? "…" : (state.playing ? "Ⅱ" : "▶");
    if (!state.book) return;
    const chapter = state.book.chapters?.[state.chapterIndex];
    const sub = host.querySelector(".v18PlayerAuthor");
    if (sub) sub.textContent = `${state.book.author || "Autor no especificado"} · ${chapter?.title || `Capítulo ${state.chapterIndex + 1}`}`;
    const totalChapters = Math.max(1, state.book.chapters?.length || 1);
    const totalSegments = Math.max(1, state.segments.length);
    const fraction = Math.min(1, Math.max(0, (state.chapterIndex + state.segmentIndex / totalSegments) / totalChapters));
    const bar = host.querySelector(".v18Progress i");
    if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  }

  function updateMediaSession() {
    if (!("mediaSession" in navigator) || !state.book) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.book.chapters?.[state.chapterIndex]?.title || state.book.title,
        artist: state.book.author || "Narrador",
        album: state.book.title,
        artwork: state.book.coverDataUrl ? [{ src: state.book.coverDataUrl, type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => startPlayback());
      navigator.mediaSession.setActionHandler("pause", () => stopPlayback());
      navigator.mediaSession.setActionHandler("previoustrack", () => switchChapter(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => switchChapter(1));
    } catch (_) {}
  }

  function finishSegment(token) {
    if (token !== state.token || !state.playing) return;
    if (state.segmentIndex < state.segments.length - 1) {
      state.segmentIndex++;
      saveProgress();
      updateUI();
      playCurrent(token);
      return;
    }
    if (state.chapterIndex < (state.book?.chapters?.length || 1) - 1) {
      state.chapterIndex++;
      state.segmentIndex = 0;
      state.segments = segmentText(state.book.chapters[state.chapterIndex]?.text || "");
      const host = $("#homeFeatured");
      if (host) host.dataset.chapter = String(state.chapterIndex);
      saveProgress();
      updateUI();
      updateMediaSession();
      playCurrent(token);
      return;
    }
    state.playing = false;
    state.loading = false;
    saveProgress();
    updateUI();
  }

  function speakSystem(token, retry = 0, forceDefault = false) {
    if (token !== state.token || !state.playing) return;
    const text = state.segments[state.segmentIndex];
    if (!text) return finishSegment(token);

    state.loading = true;
    updateUI();
    const attempt = ++state.speechAttempt;
    let started = false;

    const begin = () => {
      if (token !== state.token || attempt !== state.speechAttempt || !state.playing) return;
      const p = prefs();
      const style = STYLE[p.style] || STYLE.warm;
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = systemVoice(forceDefault);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = activeLanguage() === "es" ? "es-ES" : "en-US";
      }
      utterance.rate = Math.max(0.65, Math.min(1.25, style.rate * Number(p.speed || 0.95)));
      utterance.pitch = style.pitch;
      state.utterance = utterance;

      utterance.onstart = () => {
        if (token !== state.token || attempt !== state.speechAttempt) return;
        started = true;
        state.loading = false;
        updateUI();
      };
      utterance.onend = () => {
        if (token !== state.token || attempt !== state.speechAttempt) return;
        state.utterance = null;
        finishSegment(token);
      };
      utterance.onerror = () => {
        if (token !== state.token || attempt !== state.speechAttempt) return;
        state.utterance = null;
        if (retry < 1) return retrySystemSpeech(token);
        state.playing = false;
        state.loading = false;
        updateUI();
        toast("La voz del iPhone no pudo iniciar. Prueba otra voz desde Elegir voz.", 4200);
      };

      try {
        speechSynthesis.resume();
        speechSynthesis.speak(utterance);
        speechSynthesis.resume();
      } catch (error) {
        console.warn("Narrador Home iPhone voice:", error);
        if (retry < 1) retrySystemSpeech(token);
      }

      // iOS can occasionally accept speak() without actually starting it after a cancel.
      // Retry once with the default language voice if onstart never arrives.
      setTimeout(() => {
        if (token !== state.token || attempt !== state.speechAttempt || !state.playing || started) return;
        try { speechSynthesis.resume(); } catch (_) {}
        setTimeout(() => {
          if (token !== state.token || attempt !== state.speechAttempt || !state.playing || started) return;
          if (retry < 1) retrySystemSpeech(token);
          else {
            state.playing = false;
            state.loading = false;
            updateUI();
            toast("La voz del iPhone no respondió. Vuelve a tocar Play o elige otra voz.", 4200);
          }
        }, 360);
      }, 700);
    };

    // A short delay after cancel() avoids a WebKit race where the next utterance is dropped.
    setTimeout(begin, 70);
  }

  function retrySystemSpeech(token) {
    if (token !== state.token || !state.playing) return;
    ++state.speechAttempt;
    state.utterance = null;
    try { speechSynthesis.cancel(); } catch (_) {}
    setTimeout(() => speakSystem(token, 1, true), 120);
  }

  async function generateAI(index, token) {
    if (token !== state.token || !state.playing) return null;
    const tts = window.__narradorWarmTTS || await window.__narradorWarmAI?.();
    if (!tts || token !== state.token || !state.playing) return null;
    const p = prefs();
    const lang = activeLanguage();
    const style = STYLE[p.style] || STYLE.warm;
    let voice = p.voice || (lang === "es" ? "em_alex" : "am_michael");
    if (lang === "es" && !/^e[fm]_/.test(voice)) voice = "em_alex";
    if (lang === "en" && /^e[fm]_/.test(voice)) voice = "am_michael";
    const speed = Math.max(0.75, Math.min(1.2, style.aiSpeed * Number(p.speed || 0.95)));
    const raw = await tts.generate(state.segments[index], { voice, speed });
    return raw?.toBlob?.() || null;
  }

  async function playAI(token) {
    if (token !== state.token || !state.playing) return;
    const index = state.segmentIndex;
    state.loading = true;
    updateUI();
    try {
      const blob = state.aiNext?.index === index ? await state.aiNext.promise : await generateAI(index, token);
      state.aiNext = null;
      if (!blob || token !== state.token || !state.playing) return;
      clearAudio();
      state.audioUrl = URL.createObjectURL(blob);
      state.audio = new Audio(state.audioUrl);
      state.audio.onended = () => { clearAudio(); finishSegment(token); };
      state.audio.onerror = () => {
        if (token !== state.token) return;
        state.playing = false; state.loading = false; clearAudio(); updateUI();
        toast("La reproducción de IA se detuvo.");
      };
      window.__narradorUnlockAudio?.();
      await state.audio.play();
      state.loading = false;
      updateUI();
      const next = index + 1;
      if (next < state.segments.length) state.aiNext = { index: next, promise: generateAI(next, token).catch(() => null) };
    } catch (error) {
      if (token !== state.token) return;
      console.error("Narrador Home IA:", error);
      state.playing = false; state.loading = false; clearAudio(); updateUI();
      toast("No pude iniciar la voz IA. Puedes elegir iPhone desde Elegir voz.", 4400);
    }
  }

  function playCurrent(token) {
    if (prefs().engine === "kokoro") playAI(token);
    else speakSystem(token);
  }

  async function startPlayback() {
    window.__narradorUnlockAudio?.();
    const book = await ensureBook();
    if (!book) return toast("No pude localizar el libro actual.");
    if (state.playing) return stopPlayback();

    // Cancel legacy speech first, then let the v44 system speaker start after
    // its WebKit-safe delay. This prevents the silent first Play seen in the PWA.
    stopPlayback(false);
    state.playing = true;
    state.loading = true;
    const token = ++state.token;
    book.lastPlayedAt = Date.now();
    putBook(book).catch(() => {});
    updateUI();
    updateMediaSession();
    playCurrent(token);
  }

  async function switchChapter(delta) {
    const book = await ensureBook();
    if (!book) return;
    const next = Math.max(0, Math.min((book.chapters?.length || 1) - 1, state.chapterIndex + delta));
    if (next === state.chapterIndex) return;
    const resume = state.playing;
    stopPlayback(false);
    state.chapterIndex = next;
    state.segmentIndex = 0;
    state.segments = segmentText(book.chapters?.[next]?.text || "");
    book.lastChapter = next;
    book.lastSegment = 0;
    book.lastPlayedAt = Date.now();
    putBook(book).catch(() => {});
    const host = $("#homeFeatured");
    if (host) host.dataset.chapter = String(next);
    updateUI();
    updateMediaSession();
    if (resume) startPlayback();
  }

  function repairHomeControls() {
    const host = $("#homeFeatured");
    if (!host) return;

    // Every render from interaction-v19 recreates data-v19-home. Convert it again
    // every time instead of assuming the first decoration is permanent.
    ["play", "prev", "next"].forEach(action => {
      host.querySelectorAll(`[data-v19-home='${action}'],[data-home42-action='${action}']`).forEach(el => {
        el.removeAttribute("data-v19-home");
        el.removeAttribute("data-home42-action");
        el.setAttribute("data-home44-action", action);
      });
    });
    ["speed", "voice"].forEach(action => {
      host.querySelectorAll(`[data-v19-home='${action}']`).forEach(el => {
        el.removeAttribute("data-v19-home");
        el.setAttribute("data-home42-action", action);
      });
    });

    ensureBook().catch(() => {});
  }

  document.addEventListener("pointerdown", (event) => {
    const btn = event.target.closest?.("[data-home44-action]");
    if (!btn) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = btn.getAttribute("data-home44-action");
    if (action === "play") {
      window.__narradorUnlockAudio?.();
      startPlayback();
    } else if (action === "prev") {
      switchChapter(-1);
    } else if (action === "next") {
      switchChapter(1);
    }
  }, true);

  // When a Home voice/speed setting changes, stop this controller too so the
  // next Play starts cleanly with the newly selected preference.
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("#homeEngine42,#homeLanguage42,#homeVoice42,#homeStyle42")) stopPlayback();
  }, true);
  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("#homeSpeed42") && state.playing) stopPlayback();
  }, true);

  function init() {
    repairHomeControls();
    const host = $("#homeFeatured");
    if (host && !observer) {
      observer = new MutationObserver(() => repairHomeControls());
      // childList is enough to catch interaction-v19 innerHTML re-renders and
      // avoids the attribute-observer loop that caused the previous regression.
      observer.observe(host, { childList: true, subtree: true });
    }
    try { speechSynthesis.getVoices(); } catch (_) {}
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.playing && prefs().engine === "system") {
        try { speechSynthesis.resume(); } catch (_) {}
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.__narradorHome44 = { startPlayback, stopPlayback, switchChapter, repairHomeControls };
})();