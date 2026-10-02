// Narrador v42 — Spotify-style Home playback.
// Home playback, voice and speed controls stay on Home; Library remains the editing/detail area.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

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
    token: 0,
    audio: null,
    audioUrl: null,
    aiNext: null,
  };

  let decoratedHost = null;
  let homeObserver = null;
  let voices = [];

  function toast(message, ms = 2600) {
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

  function prefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch (_) {}
    return {
      engine: saved?.engine || "system",
      language: saved?.language || "auto",
      voice: saved?.voice || "",
      style: saved?.style || "warm",
      speed: String(saved?.speed || "0.95"),
    };
  }

  function savePrefs(next) {
    const merged = { ...prefs(), ...next };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(merged)); } catch (_) {}
    mirrorPrefs(merged);
    updateQuickLabels(merged);
    return merged;
  }

  function mirrorPrefs(p) {
    const engine = $("#engineSelect"), language = $("#languageSelect"), style = $("#styleSelect"), speed = $("#speedRange");
    if (engine && [...engine.options].some(o => o.value === p.engine)) engine.value = p.engine;
    if (language && [...language.options].some(o => o.value === p.language)) language.value = p.language;
    if (style && [...style.options].some(o => o.value === p.style)) style.value = p.style;
    if (speed) { speed.value = p.speed; speed.dispatchEvent(new Event("input", { bubbles: true })); }
    if (engine) engine.dispatchEvent(new Event("change", { bubbles: true }));
    if (language) language.dispatchEvent(new Event("change", { bubbles: true }));
    queueMicrotask(() => {
      const voice = $("#voiceSelect");
      if (voice && [...voice.options].some(o => o.value === String(p.voice))) voice.value = String(p.voice);
    });
    const se=$("#settingsEngine"), sl=$("#settingsLanguage"), ss=$("#settingsStyle"), sp=$("#settingsSpeed");
    if(se&&[...se.options].some(o=>o.value===p.engine))se.value=p.engine;
    if(sl&&[...sl.options].some(o=>o.value===p.language))sl.value=p.language;
    if(ss&&[...ss.options].some(o=>o.value===p.style))ss.value=p.style;
    if(sp&&[...sp.options].some(o=>o.value===p.speed))sp.value=p.speed;
  }

  function detectLanguage(text = "") {
    const s = text.slice(0, 5000).toLowerCase();
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
    const push = () => { const t = buffer.trim(); if (t) out.push(t); buffer = ""; };
    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const s = sentence.trim(); if (!s) continue;
        if (buffer && (buffer + " " + s).length > 420) push();
        buffer += (buffer ? " " : "") + s;
        if (buffer.length > 360) push();
      }
    }
    push();
    return out.length ? out : [String(text).trim()].filter(Boolean);
  }

  async function ensureBook() {
    const host = $("#homeFeatured");
    const id = host?.dataset.bookId;
    if (!id) return null;
    if (player.book && String(player.book.id) === String(id)) return player.book;
    const book = (await allBooks()).find(b => String(b.id) === String(id));
    if (!book) return null;
    player.book = book;
    player.chapterIndex = Math.max(0, Math.min(Number(host.dataset.chapter || book.lastChapter || 0), (book.chapters?.length || 1) - 1));
    player.blockIndex = Math.max(0, Number(book.lastSegment || 0));
    player.blocks = blockText(book.chapters?.[player.chapterIndex]?.text || "");
    player.blockIndex = Math.min(player.blockIndex, Math.max(0, player.blocks.length - 1));
    updateHomePlayer();
    setMediaSession();
    return book;
  }

  async function switchChapter(delta) {
    const book = await ensureBook();
    if (!book) return;
    const next = Math.max(0, Math.min((book.chapters?.length || 1) - 1, player.chapterIndex + delta));
    if (next === player.chapterIndex) return;
    const wasPlaying = player.playing;
    stopPlayback(false);
    player.chapterIndex = next;
    player.blockIndex = 0;
    player.blocks = blockText(book.chapters?.[next]?.text || "");
    book.lastChapter = next; book.lastSegment = 0; book.lastPlayedAt = Date.now();
    putBook(book).catch(() => {});
    const host=$("#homeFeatured"); if(host)host.dataset.chapter=String(next);
    updateHomePlayer(); setMediaSession();
    if (wasPlaying) startPlayback();
  }

  function clearAudio() {
    if (player.audio) { try { player.audio.pause(); player.audio.src = ""; } catch (_) {} player.audio = null; }
    if (player.audioUrl) { try { URL.revokeObjectURL(player.audioUrl); } catch (_) {} player.audioUrl = null; }
  }

  function stopPlayback(update = true) {
    player.token++;
    player.playing = false;
    player.loading = false;
    player.aiNext = null;
    try { speechSynthesis.cancel(); } catch (_) {}
    clearAudio();
    if (update) updateHomePlayer();
  }

  async function saveProgress() {
    if (!player.book) return;
    player.book.lastChapter = player.chapterIndex;
    player.book.lastSegment = player.blockIndex;
    player.book.lastPlayedAt = Date.now();
    try { await putBook(player.book); } catch (_) {}
  }

  function voiceForSystem() {
    voices = speechSynthesis.getVoices();
    const p = prefs(), lang = activeLanguage();
    let chosen = null;
    const numeric = Number(p.voice);
    if (Number.isInteger(numeric) && numeric >= 0 && voices[numeric]) chosen = voices[numeric];
    if (!chosen && p.voice) chosen = voices.find(v => `${v.name}|${v.lang}` === p.voice || v.name === p.voice);
    if (!chosen) chosen = voices.find(v => v.lang?.toLowerCase().startsWith(lang) && /premium|enhanced|natural|siri/i.test(v.name || ""));
    if (!chosen) chosen = voices.find(v => v.lang?.toLowerCase().startsWith(lang));
    return chosen || voices[0] || null;
  }

  function updateQuickLabels(p = prefs()) {
    const speed = $("#homeFeatured [data-home42-action='speed'] span span");
    if (speed) speed.textContent = `${Number(p.speed).toFixed(2)}×`;
    const voice = $("#homeFeatured [data-home42-action='voice'] span span");
    if (voice) {
      if (p.engine === "kokoro") {
        const found = [...AI_VOICES.es, ...AI_VOICES.en].find(([id]) => id === p.voice);
        voice.textContent = found?.[1] || "IA · voz neuronal";
      } else {
        const v = voiceForSystem(); voice.textContent = v ? `iPhone · ${v.name}` : "iPhone";
      }
    }
  }

  function progressFraction() {
    const chapterCount = Math.max(1, player.book?.chapters?.length || 1);
    const blockCount = Math.max(1, player.blocks.length);
    return Math.min(1, Math.max(0, (player.chapterIndex + player.blockIndex / blockCount) / chapterCount));
  }

  function updateHomePlayer() {
    const host = $("#homeFeatured"); if (!host) return;
    const button = host.querySelector("[data-home42-action='play']");
    if (button) button.textContent = player.loading ? "…" : (player.playing ? "Ⅱ" : "▶");
    const chapter = player.book?.chapters?.[player.chapterIndex];
    const sub = host.querySelector(".v18PlayerAuthor");
    if (sub && player.book) sub.textContent = `${player.book.author || "Autor no especificado"} · ${chapter?.title || `Capítulo ${player.chapterIndex + 1}`}`;
    const bar = host.querySelector(".v18Progress i"); if (bar) bar.style.width = `${Math.round(progressFraction() * 100)}%`;
    updateQuickLabels();
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || !player.book) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: player.book.chapters?.[player.chapterIndex]?.title || player.book.title,
        artist: player.book.author || "Narrador",
        album: player.book.title,
        artwork: player.book.coverDataUrl ? [{ src: player.book.coverDataUrl, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => startPlayback());
      navigator.mediaSession.setActionHandler("pause", () => stopPlayback());
      navigator.mediaSession.setActionHandler("previoustrack", () => switchChapter(-1));
      navigator.mediaSession.setActionHandler("nexttrack", () => switchChapter(1));
    } catch (_) {}
  }

  function finishBlock(myToken) {
    if (myToken !== player.token || !player.playing) return;
    if (player.blockIndex < player.blocks.length - 1) {
      player.blockIndex++;
      saveProgress(); updateHomePlayer();
      playCurrentBlock(myToken);
      return;
    }
    if (player.chapterIndex < (player.book?.chapters?.length || 1) - 1) {
      player.chapterIndex++;
      player.blockIndex = 0;
      player.blocks = blockText(player.book.chapters[player.chapterIndex]?.text || "");
      const host=$("#homeFeatured"); if(host)host.dataset.chapter=String(player.chapterIndex);
      saveProgress(); updateHomePlayer(); setMediaSession();
      playCurrentBlock(myToken);
      return;
    }
    player.playing = false; player.loading = false; saveProgress(); updateHomePlayer();
  }

  function playSystem(myToken) {
    const text = player.blocks[player.blockIndex];
    if (!text || myToken !== player.token || !player.playing) return;
    const p = prefs(), style = STYLE[p.style] || STYLE.warm;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.max(0.65, Math.min(1.25, style.rate * Number(p.speed || 0.95)));
    u.pitch = style.pitch;
    const v = voiceForSystem(); if (v) u.voice = v;
    u.onstart = () => { if (myToken !== player.token) return; player.loading = false; updateHomePlayer(); };
    u.onend = () => finishBlock(myToken);
    u.onerror = () => { if (myToken !== player.token) return; player.playing = false; player.loading = false; updateHomePlayer(); toast("La voz del iPhone se detuvo."); };
    speechSynthesis.speak(u);
  }

  async function generateAI(index, myToken) {
    if (myToken !== player.token) return null;
    const tts = window.__narradorWarmTTS || await window.__narradorWarmAI?.();
    if (!tts || myToken !== player.token) return null;
    const p = prefs(), lang = activeLanguage(), style = STYLE[p.style] || STYLE.warm;
    let voice = p.voice || (lang === "es" ? "em_alex" : "am_michael");
    if (lang === "es" && !/^e[fm]_/.test(voice)) voice = "em_alex";
    if (lang === "en" && /^e[fm]_/.test(voice)) voice = "am_michael";
    const speed = Math.max(0.75, Math.min(1.2, style.aiSpeed * Number(p.speed || 0.95)));
    const raw = await tts.generate(player.blocks[index], { voice, speed });
    return raw?.toBlob?.() || null;
  }

  async function playAI(myToken) {
    const index = player.blockIndex;
    player.loading = true; updateHomePlayer();
    try {
      let blob = player.aiNext?.index === index ? await player.aiNext.promise : await generateAI(index, myToken);
      player.aiNext = null;
      if (!blob || myToken !== player.token || !player.playing) return;
      clearAudio();
      player.audioUrl = URL.createObjectURL(blob);
      player.audio = new Audio(player.audioUrl);
      player.audio.onended = () => { clearAudio(); finishBlock(myToken); };
      player.audio.onerror = () => { if (myToken !== player.token) return; player.playing=false; player.loading=false; clearAudio(); updateHomePlayer(); toast("La reproducción de IA se detuvo."); };
      window.__narradorUnlockAudio?.();
      await player.audio.play();
      player.loading = false; updateHomePlayer();
      const next = index + 1;
      if (next < player.blocks.length) player.aiNext = { index: next, promise: generateAI(next, myToken).catch(() => null) };
    } catch (error) {
      if (myToken !== player.token) return;
      console.error("Narrador Home IA:", error);
      player.playing=false; player.loading=false; clearAudio(); updateHomePlayer();
      toast("No pude iniciar la voz IA. Puedes elegir iPhone desde Elegir voz.", 4500);
    }
  }

  function playCurrentBlock(myToken) {
    if (prefs().engine === "kokoro") playAI(myToken); else playSystem(myToken);
  }

  async function startPlayback() {
    window.__narradorUnlockAudio?.();
    const book = await ensureBook(); if (!book) return;
    if (player.playing) { stopPlayback(); return; }
    stopPlayback(false);
    player.playing = true; player.loading = prefs().engine === "kokoro";
    const myToken = ++player.token;
    book.lastPlayedAt = Date.now(); putBook(book).catch(() => {});
    updateHomePlayer(); setMediaSession();
    playCurrentBlock(myToken);
  }

  function ensureSheets() {
    if ($("#homeControlSheet42")) return;
    const sheet = document.createElement("div");
    sheet.id = "homeControlSheet42";
    sheet.className = "homeSheet42";
    sheet.innerHTML = `<div class="homeSheetBackdrop42" data-home42-close></div><div class="homeSheetPanel42"><div class="homeSheetHandle42"></div><div class="homeSheetHead42"><h3 id="homeSheetTitle42">Ajustes</h3><button type="button" data-home42-close>Listo</button></div><div id="homeVoicePane42" class="homeSheetBody42 hidden"><label>Motor de voz<select id="homeEngine42"><option value="system">iPhone · instantáneo</option><option value="kokoro">IA · más natural</option></select></label><label>Idioma<select id="homeLanguage42"><option value="auto">Automático</option><option value="es">Español</option><option value="en">English</option></select></label><label>Voz<select id="homeVoice42"></select></label><label>Estilo<select id="homeStyle42"><option value="warm">Cálida</option><option value="cinematic">Cinematográfica</option><option value="expressive">Expresiva</option><option value="calm">Calmada</option></select></label></div><div id="homeSpeedPane42" class="homeSheetBody42 hidden"><div class="homeSpeedBig42" id="homeSpeedValue42">0.95×</div><input id="homeSpeed42" type="range" min="0.80" max="1.15" step="0.05" value="0.95"><div class="homeSpeedMarks42"><span>Más lento</span><span>Normal</span><span>Más rápido</span></div></div></div>`;
    document.body.appendChild(sheet);

    const style = document.createElement("style");
    style.id = "homePlayerStyle42";
    style.textContent = `
      .homeSheet42{position:fixed;inset:0;z-index:9999;display:none}.homeSheet42.open{display:block}.homeSheetBackdrop42{position:absolute;inset:0;background:rgba(15,23,42,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}.homeSheetPanel42{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:26px 26px 0 0;padding:10px 18px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -18px 45px rgba(15,23,42,.16);max-height:78vh;overflow:auto}.homeSheetHandle42{width:42px;height:5px;border-radius:999px;background:#d8dee9;margin:2px auto 12px}.homeSheetHead42{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.homeSheetHead42 h3{margin:0;font-size:22px;color:#111827}.homeSheetHead42 button{border:0;background:#edf3ff;color:#2768f5;border-radius:999px;padding:9px 14px;font-weight:800}.homeSheetBody42{display:grid;gap:14px}.homeSheetBody42.hidden{display:none}.homeSheetBody42 label{display:grid;gap:7px;color:#65718a;font-size:13px;font-weight:800}.homeSheetBody42 select{width:100%;min-height:50px;border:1px solid #dfe4ed;border-radius:15px;background:#f8faff;padding:0 14px;font-size:16px;font-weight:750;color:#111827}.homeSpeedBig42{text-align:center;font-size:32px;font-weight:900;color:#2768f5;margin:10px 0}.homeSpeed42 input,.homeSheetBody42 input[type=range]{width:100%}.homeSpeedMarks42{display:flex;justify-content:space-between;color:#8a94a8;font-size:12px;margin-top:2px}.v18Player [data-home42-action]{touch-action:manipulation;-webkit-tap-highlight-color:transparent}.v18Player [data-home42-action]:active{transform:scale(.96)}
    `;
    document.head.appendChild(style);

    sheet.addEventListener("click", (e) => { if (e.target.closest?.("[data-home42-close]")) closeSheet(); });
    $("#homeEngine42")?.addEventListener("change", () => { stopPlayback(); savePrefs({engine:$("#homeEngine42").value}); populateHomeVoice(); });
    $("#homeLanguage42")?.addEventListener("change", () => { stopPlayback(); savePrefs({language:$("#homeLanguage42").value}); populateHomeVoice(); });
    $("#homeVoice42")?.addEventListener("change", () => { stopPlayback(); savePrefs({voice:$("#homeVoice42").value}); });
    $("#homeStyle42")?.addEventListener("change", () => { stopPlayback(); savePrefs({style:$("#homeStyle42").value}); });
    $("#homeSpeed42")?.addEventListener("input", () => { const val=$("#homeSpeed42").value; $("#homeSpeedValue42").textContent=`${Number(val).toFixed(2)}×`; savePrefs({speed:val}); });
  }

  function populateHomeVoice() {
    const select = $("#homeVoice42"); if (!select) return;
    const p = prefs(), engine = $("#homeEngine42")?.value || p.engine;
    const langSetting = $("#homeLanguage42")?.value || p.language;
    const lang = langSetting === "auto" ? activeLanguage() : langSetting;
    select.innerHTML = "";
    if (engine === "kokoro") {
      (AI_VOICES[lang] || AI_VOICES.es).forEach(([id,label]) => { const o=document.createElement("option");o.value=id;o.textContent=label;select.appendChild(o); });
    } else {
      voices = speechSynthesis.getVoices();
      let list = voices.map((v,i)=>({v,i})).filter(x => x.v.lang?.toLowerCase().startsWith(lang));
      if (!list.length) list = voices.map((v,i)=>({v,i}));
      list.sort((a,b)=>a.v.name.localeCompare(b.v.name));
      list.forEach(({v,i}) => { const o=document.createElement("option");o.value=String(i);o.textContent=`${v.name} · ${v.lang}`;select.appendChild(o); });
    }
    if ([...select.options].some(o => o.value === String(p.voice))) select.value = String(p.voice);
  }

  function openSheet(kind) {
    ensureSheets();
    const p=prefs(), sheet=$("#homeControlSheet42"); if(!sheet)return;
    $("#homeVoicePane42")?.classList.toggle("hidden", kind!=="voice");
    $("#homeSpeedPane42")?.classList.toggle("hidden", kind!=="speed");
    $("#homeSheetTitle42").textContent = kind==="voice" ? "Narración" : "Velocidad";
    if(kind==="voice"){
      $("#homeEngine42").value=p.engine; $("#homeLanguage42").value=p.language; $("#homeStyle42").value=p.style; populateHomeVoice();
    } else {
      $("#homeSpeed42").value=p.speed; $("#homeSpeedValue42").textContent=`${Number(p.speed).toFixed(2)}×`;
    }
    sheet.classList.add("open");
  }

  function closeSheet(){ $("#homeControlSheet42")?.classList.remove("open"); }

  function decorateHome() {
    const host=$("#homeFeatured"); if(!host || host===decoratedHost && host.dataset.home42Ready==="1") return;
    const map={play:"play",prev:"prev",next:"next",speed:"speed",voice:"voice"};
    let found=false;
    Object.entries(map).forEach(([oldAction,newAction])=>{
      host.querySelectorAll(`[data-v19-home='${oldAction}']`).forEach(el=>{el.removeAttribute("data-v19-home");el.dataset.home42Action=newAction;found=true;});
    });
    if(found || host.querySelector("[data-home42-action]")){
      host.dataset.home42Ready="1"; decoratedHost=host; updateQuickLabels(); ensureBook().catch(()=>{});
    }
  }

  document.addEventListener("pointerdown", (event) => {
    const btn=event.target.closest?.("[data-home42-action]"); if(!btn)return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action=btn.dataset.home42Action;
    if(action==="play"){ window.__narradorUnlockAudio?.(); startPlayback(); }
    else if(action==="prev") switchChapter(-1);
    else if(action==="next") switchChapter(1);
    else if(action==="speed") openSheet("speed");
    else if(action==="voice") openSheet("voice");
  }, true);

  function init() {
    ensureSheets();
    decorateHome();
    const host=$("#homeFeatured");
    if(host && !homeObserver){
      homeObserver=new MutationObserver(()=>decorateHome());
      homeObserver.observe(host,{childList:true,subtree:true,attributes:true});
    }
    voices=speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.("voiceschanged",()=>{voices=speechSynthesis.getVoices();populateHomeVoice();updateQuickLabels();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
  window.addEventListener("pageshow",()=>setTimeout(()=>{decorateHome();updateHomePlayer();},0));
})();