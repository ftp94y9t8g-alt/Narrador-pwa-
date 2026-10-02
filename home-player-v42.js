// Narrador v45 — reliable Spotify-style Home playback for iPhone.
// The Home player is fully self-contained: playback, voice and speed never navigate to Library.
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
  const AI_VOICES = {
    es: [["ef_dora","Dora · Español · femenina"],["em_alex","Alex · Español · masculina"],["em_santa","Santa · Español · masculina"]],
    en: [["af_heart","Heart · English US · femenina"],["af_bella","Bella · English US · femenina"],["am_michael","Michael · English US · masculina"],["bm_george","George · English UK · masculina"]],
  };

  const player = {
    book: null,
    chapterIndex: 0,
    blocks: [],
    blockIndex: 0,
    playing: false,
    loading: false,
    ready: false,
    token: 0,
    utterance: null,
    audio: null,
    audioUrl: null,
    aiNext: null,
  };

  let observer = null;
  let voices = [];
  let priming = null;

  function toast(message, ms = 3000) {
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
    const p = { ...prefs(), ...next };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (_) {}
    updateLabels(p);
    return p;
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
    return detectLanguage(player.book?.chapters?.[player.chapterIndex]?.text || "");
  }

  function blockText(text = "") {
    const paragraphs = String(text).split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const out = [];
    let buffer = "";
    const push = () => {
      const t = buffer.trim();
      if (t) out.push(t);
      buffer = "";
    };
    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;
        if (buffer && (buffer + " " + s).length > 300) push();
        if (s.length > 420 && !buffer) {
          let rest = s;
          while (rest.length > 320) {
            let cut = Math.max(rest.lastIndexOf(",", 290), rest.lastIndexOf(";", 290), rest.lastIndexOf(" ", 290));
            if (cut < 180) cut = 290;
            out.push(rest.slice(0, cut + 1).trim());
            rest = rest.slice(cut + 1).trim();
          }
          buffer = rest;
        } else {
          buffer += (buffer ? " " : "") + s;
        }
      }
      if (buffer.length > 230) push();
    }
    push();
    return out.length ? out : [String(text).trim()].filter(Boolean);
  }

  function hostBookId() {
    return $("#homeFeatured")?.dataset.bookId || "";
  }

  async function primeBook(force = false) {
    const id = hostBookId();
    if (!id) {
      player.ready = false;
      return null;
    }
    if (!force && player.ready && player.book && String(player.book.id) === String(id)) return player.book;
    if (!force && priming) return priming;

    player.ready = false;
    updateUI();
    priming = (async () => {
      const book = (await allBooks()).find(b => String(b.id) === String(id));
      if (!book) return null;
      const host = $("#homeFeatured");
      player.book = book;
      player.chapterIndex = Math.max(0, Math.min(Number(host?.dataset.chapter ?? book.lastChapter ?? 0), Math.max(0, (book.chapters?.length || 1) - 1)));
      player.blocks = blockText(book.chapters?.[player.chapterIndex]?.text || "");
      player.blockIndex = Math.max(0, Math.min(Number(book.lastSegment || 0), Math.max(0, player.blocks.length - 1)));
      player.ready = true;
      updateUI();
      setMediaSession();
      return book;
    })().catch((error) => {
      console.warn("Narrador Home preload:", error);
      player.ready = false;
      return null;
    }).finally(() => { priming = null; });
    return priming;
  }

  async function saveProgress() {
    if (!player.book) return;
    player.book.lastChapter = player.chapterIndex;
    player.book.lastSegment = player.blockIndex;
    player.book.lastPlayedAt = Date.now();
    try { await putBook(player.book); } catch (_) {}
  }

  function currentSystemVoice() {
    voices = speechSynthesis.getVoices();
    const p = prefs();
    const lang = activeLanguage();
    const numeric = Number(p.voice);
    let chosen = null;
    if (Number.isInteger(numeric) && numeric >= 0 && voices[numeric]) chosen = voices[numeric];
    if (!chosen && p.voice) chosen = voices.find(v => `${v.name}|${v.lang}` === p.voice || v.name === p.voice);
    if (!chosen) chosen = voices.find(v => v.lang?.toLowerCase().startsWith(lang) && /premium|enhanced|natural|siri|m[oó]nica/i.test(v.name || ""));
    if (!chosen) chosen = voices.find(v => v.lang?.toLowerCase().startsWith(lang));
    return chosen || voices[0] || null;
  }

  function updateLabels(p = prefs()) {
    const host = $("#homeFeatured");
    if (!host) return;
    const speed = host.querySelector("[data-home45-action='speed'] span span");
    if (speed) speed.textContent = `${Number(p.speed).toFixed(2)}×`;
    const voice = host.querySelector("[data-home45-action='voice'] span span");
    if (voice) {
      if (p.engine === "kokoro") {
        const found = [...AI_VOICES.es, ...AI_VOICES.en].find(([id]) => id === p.voice);
        voice.textContent = found?.[1] || "IA · voz neuronal";
      } else {
        const v = currentSystemVoice();
        voice.textContent = v ? `iPhone · ${v.name}` : "iPhone · instantáneo";
      }
    }
  }

  function updateUI() {
    const host = $("#homeFeatured");
    if (!host) return;
    const play = host.querySelector("[data-home45-action='play']");
    if (play) play.textContent = player.loading ? "…" : (player.playing ? "Ⅱ" : "▶");
    if (player.book) {
      const chapter = player.book.chapters?.[player.chapterIndex];
      const sub = host.querySelector(".v18PlayerAuthor");
      if (sub) sub.textContent = `${player.book.author || "Autor no especificado"} · ${chapter?.title || `Capítulo ${player.chapterIndex + 1}`}`;
      const chapters = Math.max(1, player.book.chapters?.length || 1);
      const blocks = Math.max(1, player.blocks.length);
      const fraction = Math.min(1, Math.max(0, (player.chapterIndex + player.blockIndex / blocks) / chapters));
      const bar = host.querySelector(".v18Progress i");
      if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
    }
    updateLabels();
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || !player.book) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: player.book.chapters?.[player.chapterIndex]?.title || player.book.title,
        artist: player.book.author || "Narrador",
        album: player.book.title,
        artwork: player.book.coverDataUrl ? [{ src: player.book.coverDataUrl, type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => startPlayback(false));
      navigator.mediaSession.setActionHandler("pause", () => stopPlayback());
      navigator.mediaSession.setActionHandler("previoustrack", () => switchChapter(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => switchChapter(1));
    } catch (_) {}
  }

  function clearAI() {
    if (player.audio) {
      try { player.audio.onended = null; player.audio.onerror = null; player.audio.pause(); player.audio.src = ""; } catch (_) {}
      player.audio = null;
    }
    if (player.audioUrl) {
      try { URL.revokeObjectURL(player.audioUrl); } catch (_) {}
      player.audioUrl = null;
    }
  }

  function stopPlayback(update = true) {
    player.token++;
    player.playing = false;
    player.loading = false;
    player.aiNext = null;
    player.utterance = null;
    try { speechSynthesis.cancel(); } catch (_) {}
    clearAI();
    if (update) updateUI();
  }

  function finishBlock(token) {
    if (token !== player.token || !player.playing) return;
    if (player.blockIndex < player.blocks.length - 1) {
      player.blockIndex++;
      saveProgress();
      updateUI();
      playCurrent(token, false);
      return;
    }
    if (player.chapterIndex < (player.book?.chapters?.length || 1) - 1) {
      player.chapterIndex++;
      player.blockIndex = 0;
      player.blocks = blockText(player.book.chapters[player.chapterIndex]?.text || "");
      const host = $("#homeFeatured");
      if (host) host.dataset.chapter = String(player.chapterIndex);
      saveProgress();
      updateUI();
      setMediaSession();
      playCurrent(token, false);
      return;
    }
    player.playing = false;
    player.loading = false;
    saveProgress();
    updateUI();
  }

  function speakSystem(token) {
    if (token !== player.token || !player.playing) return;
    const text = player.blocks[player.blockIndex];
    if (!text) return finishBlock(token);

    const p = prefs();
    const style = STYLE[p.style] || STYLE.warm;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = currentSystemVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = activeLanguage() === "es" ? "es-ES" : "en-US";
    }
    utterance.rate = Math.max(0.65, Math.min(1.25, style.rate * Number(p.speed || 0.95)));
    utterance.pitch = style.pitch;
    player.utterance = utterance;
    player.loading = false;

    utterance.onstart = () => {
      if (token !== player.token) return;
      player.loading = false;
      updateUI();
    };
    utterance.onend = () => {
      if (token !== player.token || !player.playing) return;
      player.utterance = null;
      finishBlock(token);
    };
    utterance.onerror = (event) => {
      if (token !== player.token) return;
      console.warn("Narrador Home system voice:", event?.error || event);
      player.playing = false;
      player.loading = false;
      player.utterance = null;
      updateUI();
      toast("La voz del iPhone se detuvo. Prueba otra voz si vuelve a pasar.", 4200);
    };

    try {
      // IMPORTANT: on iPhone this call must happen directly inside the user's tap.
      speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Narrador Home speak:", error);
      player.playing = false;
      player.loading = false;
      updateUI();
      toast("No pude iniciar la voz del iPhone.", 3800);
    }
  }

  async function generateAI(index, token) {
    if (token !== player.token || !player.playing) return null;
    const tts = window.__narradorWarmTTS || await window.__narradorWarmAI?.();
    if (!tts || token !== player.token || !player.playing) return null;
    const p = prefs();
    const lang = activeLanguage();
    const style = STYLE[p.style] || STYLE.warm;
    let voice = p.voice || (lang === "es" ? "em_alex" : "am_michael");
    if (lang === "es" && !/^e[fm]_/.test(voice)) voice = "em_alex";
    if (lang === "en" && /^e[fm]_/.test(voice)) voice = "am_michael";
    const speed = Math.max(0.75, Math.min(1.2, style.aiSpeed * Number(p.speed || 0.95)));
    const raw = await tts.generate(player.blocks[index], { voice, speed });
    return raw?.toBlob?.() || null;
  }

  async function playAI(token) {
    if (token !== player.token || !player.playing) return;
    const index = player.blockIndex;
    player.loading = true;
    updateUI();
    try {
      const blob = player.aiNext?.index === index ? await player.aiNext.promise : await generateAI(index, token);
      player.aiNext = null;
      if (!blob || token !== player.token || !player.playing) return;
      clearAI();
      player.audioUrl = URL.createObjectURL(blob);
      player.audio = new Audio(player.audioUrl);
      player.audio.onended = () => { clearAI(); finishBlock(token); };
      player.audio.onerror = () => {
        if (token !== player.token) return;
        player.playing = false;
        player.loading = false;
        clearAI();
        updateUI();
        toast("La reproducción de IA se detuvo.");
      };
      window.__narradorUnlockAudio?.();
      await player.audio.play();
      player.loading = false;
      updateUI();
      const next = index + 1;
      if (next < player.blocks.length) player.aiNext = { index: next, promise: generateAI(next, token).catch(() => null) };
    } catch (error) {
      if (token !== player.token) return;
      console.error("Narrador Home IA:", error);
      player.playing = false;
      player.loading = false;
      clearAI();
      updateUI();
      toast("No pude iniciar la voz IA. Puedes elegir iPhone desde Elegir voz.", 4500);
    }
  }

  function playCurrent(token, fromGesture) {
    if (prefs().engine === "kokoro") {
      if (fromGesture) window.__narradorUnlockAudio?.();
      playAI(token);
    } else {
      speakSystem(token);
    }
  }

  function startPlayback(fromGesture = true) {
    if (!player.ready || !player.book || !player.blocks.length) {
      primeBook(true).then(() => updateUI());
      toast("Preparando el libro… toca Play otra vez en un momento.", 2200);
      return;
    }
    if (player.playing) {
      stopPlayback();
      return;
    }

    // Do not await anything before native iPhone speech. This keeps the call
    // inside the same user gesture, which WebKit requires more reliably in a PWA.
    player.playing = true;
    player.loading = prefs().engine === "kokoro";
    const token = ++player.token;
    player.book.lastPlayedAt = Date.now();
    putBook(player.book).catch(() => {});
    updateUI();
    setMediaSession();
    playCurrent(token, fromGesture);
  }

  function switchChapter(delta) {
    if (!player.ready || !player.book) return;
    const next = Math.max(0, Math.min((player.book.chapters?.length || 1) - 1, player.chapterIndex + delta));
    if (next === player.chapterIndex) return;
    const resume = player.playing;
    stopPlayback(false);
    player.chapterIndex = next;
    player.blockIndex = 0;
    player.blocks = blockText(player.book.chapters?.[next]?.text || "");
    player.book.lastChapter = next;
    player.book.lastSegment = 0;
    player.book.lastPlayedAt = Date.now();
    putBook(player.book).catch(() => {});
    const host = $("#homeFeatured");
    if (host) host.dataset.chapter = String(next);
    updateUI();
    setMediaSession();
    if (resume) {
      // Chapter changes are user taps too, so system speech can start immediately.
      player.playing = true;
      const token = ++player.token;
      playCurrent(token, true);
    }
  }

  function ensureSheet() {
    if ($("#homeControlSheet45")) return;
    const sheet = document.createElement("div");
    sheet.id = "homeControlSheet45";
    sheet.className = "homeSheet45";
    sheet.innerHTML = `
      <div class="homeSheetBackdrop45" data-home45-close></div>
      <div class="homeSheetPanel45" role="dialog" aria-modal="true">
        <div class="homeSheetHandle45"></div>
        <div class="homeSheetHead45"><h3 id="homeSheetTitle45">Ajustes</h3><button type="button" data-home45-close>Listo</button></div>
        <div id="homeVoicePane45" class="homeSheetBody45 hidden">
          <label>Motor de voz<select id="homeEngine45"><option value="system">iPhone · instantáneo</option><option value="kokoro">IA · más natural</option></select></label>
          <label>Idioma<select id="homeLanguage45"><option value="auto">Automático</option><option value="es">Español</option><option value="en">English</option></select></label>
          <label>Voz<select id="homeVoice45"></select></label>
          <label>Estilo<select id="homeStyle45"><option value="warm">Cálida</option><option value="cinematic">Cinematográfica</option><option value="expressive">Expresiva</option><option value="calm">Calmada</option></select></label>
        </div>
        <div id="homeSpeedPane45" class="homeSheetBody45 hidden">
          <div class="homeSpeedBig45" id="homeSpeedValue45">0.95×</div>
          <input id="homeSpeed45" class="homeSpeedSlider45" type="range" min="0.80" max="1.15" step="0.05" value="0.95">
          <div class="homeSpeedMarks45"><span>0.80×</span><span>1.00×</span><span>1.15×</span></div>
          <p class="homeSpeedHint45">Desliza para ajustar la velocidad de narración.</p>
        </div>
      </div>`;
    document.body.appendChild(sheet);

    const style = document.createElement("style");
    style.id = "homePlayerStyle45";
    style.textContent = `
      .homeSheet45{position:fixed;inset:0;z-index:2147483000;display:none}.homeSheet45.open{display:block}.homeSheetBackdrop45{position:absolute;inset:0;background:rgba(15,23,42,.38);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
      .homeSheetPanel45{position:absolute;left:0;right:0;bottom:0;max-height:calc(100dvh - 72px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#fff;border-radius:28px 28px 0 0;padding:10px 22px calc(30px + env(safe-area-inset-bottom));box-shadow:0 -22px 55px rgba(15,23,42,.22)}
      .homeSheetHandle45{width:44px;height:5px;border-radius:999px;background:#d8dee9;margin:2px auto 12px}.homeSheetHead45{position:sticky;top:-10px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 -2px 18px;padding:10px 2px 8px;background:rgba(255,255,255,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.homeSheetHead45 h3{margin:0;font-size:25px;line-height:1.1;color:#111827}.homeSheetHead45 button{border:0;background:#edf3ff;color:#2768f5;border-radius:999px;padding:11px 16px;font-size:16px;font-weight:850}
      .homeSheetBody45{display:grid;gap:15px;padding-bottom:8px}.homeSheetBody45.hidden{display:none}.homeSheetBody45 label{display:grid;gap:8px;color:#65718a;font-size:14px;font-weight:850}.homeSheetBody45 select{width:100%;min-height:54px;border:1px solid #dfe4ed;border-radius:16px;background:#f8faff;padding:0 16px;font-size:17px;font-weight:750;color:#111827}
      .homeSpeedBig45{text-align:center;font-size:38px;font-weight:900;color:#2768f5;margin:8px 0 12px}.homeSpeedSlider45{display:block;width:100%;height:42px;accent-color:#2f73f6}.homeSpeedMarks45{display:flex;justify-content:space-between;color:#7b879b;font-size:13px;font-weight:700}.homeSpeedHint45{margin:10px 0 2px;text-align:center;color:#7b879b;font-size:14px}
      body.homeSheetOpen45{overflow:hidden}body.homeSheetOpen45 .bottomNav{visibility:hidden!important;pointer-events:none!important}.v18Player [data-home45-action]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}.v18Player [data-home45-action]:active{transform:scale(.96)}
    `;
    document.head.appendChild(style);

    sheet.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-home45-close]")) closeSheet();
    });

    $("#homeEngine45")?.addEventListener("change", () => {
      stopPlayback();
      savePrefs({ engine: $("#homeEngine45").value });
      populateVoiceSelect();
    });
    $("#homeLanguage45")?.addEventListener("change", () => {
      stopPlayback();
      savePrefs({ language: $("#homeLanguage45").value });
      populateVoiceSelect();
    });
    $("#homeVoice45")?.addEventListener("change", () => {
      stopPlayback();
      savePrefs({ voice: $("#homeVoice45").value });
    });
    $("#homeStyle45")?.addEventListener("change", () => {
      stopPlayback();
      savePrefs({ style: $("#homeStyle45").value });
    });
    $("#homeSpeed45")?.addEventListener("input", () => {
      const value = $("#homeSpeed45").value;
      $("#homeSpeedValue45").textContent = `${Number(value).toFixed(2)}×`;
      savePrefs({ speed: value });
    });
  }

  function populateVoiceSelect() {
    const select = $("#homeVoice45");
    if (!select) return;
    const p = prefs();
    const engine = $("#homeEngine45")?.value || p.engine;
    const langSetting = $("#homeLanguage45")?.value || p.language;
    const lang = langSetting === "auto" ? activeLanguage() : langSetting;
    select.innerHTML = "";

    if (engine === "kokoro") {
      (AI_VOICES[lang] || AI_VOICES.es).forEach(([id, label]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = label;
        select.appendChild(option);
      });
    } else {
      voices = speechSynthesis.getVoices();
      let list = voices.map((voice, index) => ({ voice, index })).filter(x => x.voice.lang?.toLowerCase().startsWith(lang));
      if (!list.length) list = voices.map((voice, index) => ({ voice, index }));
      list.sort((a, b) => a.voice.name.localeCompare(b.voice.name));
      list.forEach(({ voice, index }) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `${voice.name} · ${voice.lang}`;
        select.appendChild(option);
      });
      if (!select.options.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Voz predeterminada del iPhone";
        select.appendChild(option);
      }
    }

    if ([...select.options].some(o => o.value === String(p.voice))) select.value = String(p.voice);
  }

  function openSheet(kind) {
    ensureSheet();
    const sheet = $("#homeControlSheet45");
    const p = prefs();
    if (!sheet) return;
    $("#homeVoicePane45")?.classList.toggle("hidden", kind !== "voice");
    $("#homeSpeedPane45")?.classList.toggle("hidden", kind !== "speed");
    $("#homeSheetTitle45").textContent = kind === "voice" ? "Narración" : "Velocidad";

    if (kind === "voice") {
      $("#homeEngine45").value = p.engine;
      $("#homeLanguage45").value = p.language;
      $("#homeStyle45").value = p.style;
      populateVoiceSelect();
    } else {
      $("#homeSpeed45").value = p.speed;
      $("#homeSpeedValue45").textContent = `${Number(p.speed).toFixed(2)}×`;
    }

    document.body.classList.add("homeSheetOpen45");
    sheet.classList.add("open");
    sheet.querySelector(".homeSheetPanel45")?.scrollTo({ top: 0, behavior: "instant" });
  }

  function closeSheet() {
    $("#homeControlSheet45")?.classList.remove("open");
    document.body.classList.remove("homeSheetOpen45");
  }

  function decorateHome() {
    const host = $("#homeFeatured");
    if (!host) return;

    const actions = ["play", "prev", "next", "speed", "voice"];
    let changed = false;
    for (const action of actions) {
      host.querySelectorAll(`[data-v19-home='${action}'], [data-home42-action='${action}'], [data-home44-action='${action}']`).forEach(el => {
        el.removeAttribute("data-v19-home");
        el.removeAttribute("data-home42-action");
        el.removeAttribute("data-home44-action");
        el.dataset.home45Action = action;
        changed = true;
      });
    }

    if (changed || host.querySelector("[data-home45-action]")) {
      host.dataset.home45Ready = "1";
      updateUI();
      primeBook().catch(() => {});
    }
  }

  document.addEventListener("pointerdown", (event) => {
    const button = event.target.closest?.("[data-home45-action]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = button.dataset.home45Action;

    if (action === "play") {
      window.__narradorUnlockAudio?.();
      startPlayback(true);
    } else if (action === "prev") {
      switchChapter(-1);
    } else if (action === "next") {
      switchChapter(1);
    } else if (action === "voice") {
      openSheet("voice");
    } else if (action === "speed") {
      openSheet("speed");
    }
  }, true);

  function init() {
    ensureSheet();
    decorateHome();
    const host = $("#homeFeatured");
    if (host && !observer) {
      observer = new MutationObserver(() => decorateHome());
      observer.observe(host, { childList: true, subtree: true, attributes: true });
    }
    voices = speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.("voiceschanged", () => {
      voices = speechSynthesis.getVoices();
      populateVoiceSelect();
      updateLabels();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.addEventListener("pageshow", () => setTimeout(() => {
    decorateHome();
    primeBook(true).catch(() => {});
  }, 0));
})();