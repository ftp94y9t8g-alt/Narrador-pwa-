// Narrador v50 — full-book local AI audiobook generation, resumable offline storage and playback.
// iPhone remains instant. IA now prepares the complete book first and only plays saved audio once ready.
(() => {
  const BOOK_DB = "narrador-db-v1";
  const BOOK_STORE = "books";
  const AUDIO_DB = "narrador-audio-v1";
  const AUDIO_DB_VERSION = 1;
  const JOB_STORE = "jobs";
  const CHUNK_STORE = "chunks";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const BLOCK_TARGET = 360;
  const STYLE_SPEED = { warm: 0.96, cinematic: 0.92, expressive: 1.00, calm: 0.88 };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let bookCache = [];
  let audioDBPromise = null;
  let generationToken = 0;
  let activeBookId = null;
  let activeJob = null;
  let pauseGeneration = false;
  let refreshTimer = 0;

  const aiPlayer = {
    playing: false,
    book: null,
    job: null,
    chapter: 0,
    block: 0,
    audio: null,
    url: null,
    token: 0,
  };

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function toast(message, ms = 3600) {
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

  function detectLanguage(text = "") {
    const s = String(text).slice(0, 6000).toLowerCase();
    const es = (s.match(/\b(el|la|los|las|que|de|del|una|un|por|para|con|como|pero|había|estaba|era|su|sus|cuando|porque)\b/g) || []).length;
    const en = (s.match(/\b(the|and|of|to|in|was|that|with|for|his|her|had|but|as|when|because)\b/g) || []).length;
    return es >= en ? "es" : "en";
  }

  function aiConfig(book) {
    const p = prefs();
    const sample = book?.chapters?.slice?.(0, 2).map(c => c.text || "").join(" ") || "";
    const language = p.language === "es" || p.language === "en" ? p.language : detectLanguage(sample);
    let voice = String(p.voice || "");
    if (language === "es" && !/^e[fm]_/.test(voice)) voice = "em_alex";
    if (language === "en" && !/^[ab][fm]_/.test(voice)) voice = "am_michael";
    const style = STYLE_SPEED[p.style] ? p.style : "warm";
    const speed = Math.max(0.75, Math.min(1.20, STYLE_SPEED[style] * Number(p.speed || 0.95)));
    const sourceKey = `${book?.chapters?.length || 0}:${book?.charCount || 0}:${String(book?.title || "").slice(0, 60)}`;
    const key = `${language}|${voice}|${style}|${speed.toFixed(3)}|${sourceKey}`;
    return { key, language, voice, style, speed };
  }

  function splitText(text = "") {
    const paragraphs = String(text || "").split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const out = [];
    let buffer = "";
    const push = () => {
      const t = buffer.trim();
      if (t) out.push(t);
      buffer = "";
    };
    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
      for (const raw of sentences) {
        const sentence = raw.trim();
        if (!sentence) continue;
        if (buffer && `${buffer} ${sentence}`.length > BLOCK_TARGET) push();
        if (sentence.length > BLOCK_TARGET * 1.25 && !buffer) {
          let rest = sentence;
          while (rest.length > BLOCK_TARGET) {
            let cut = Math.max(rest.lastIndexOf(";", BLOCK_TARGET), rest.lastIndexOf(",", BLOCK_TARGET), rest.lastIndexOf(" ", BLOCK_TARGET));
            if (cut < BLOCK_TARGET * 0.58) cut = BLOCK_TARGET;
            out.push(rest.slice(0, cut + 1).trim());
            rest = rest.slice(cut + 1).trim();
          }
          buffer = rest;
        } else {
          buffer += (buffer ? " " : "") + sentence;
        }
      }
      if (buffer.length > BLOCK_TARGET * 0.72) push();
    }
    push();
    return out.length ? out : [String(text || "").trim()].filter(Boolean);
  }

  function planBook(book) {
    const chapterBlocks = (book?.chapters || []).map(chapter => splitText(chapter?.text || ""));
    const chapterBlockCounts = chapterBlocks.map(blocks => blocks.length);
    const plan = [];
    chapterBlocks.forEach((blocks, chapterIndex) => blocks.forEach((text, blockIndex) => plan.push({ chapterIndex, blockIndex, text })));
    return { plan, chapterBlockCounts };
  }

  function openBookDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BOOK_DB);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} reject(new Error("Biblioteca no disponible")); };
    });
  }

  async function readBooks() {
    try {
      const db = await openBookDB();
      const rows = await new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(BOOK_STORE)) { resolve([]); return; }
        const req = db.transaction(BOOK_STORE, "readonly").objectStore(BOOK_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
      bookCache = rows;
      return rows;
    } catch (_) { return bookCache; }
  }

  async function putBook(book) {
    try {
      const db = await openBookDB();
      await new Promise((resolve, reject) => {
        const req = db.transaction(BOOK_STORE, "readwrite").objectStore(BOOK_STORE).put(book);
        req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
    } catch (_) {}
  }

  function openAudioDB() {
    if (audioDBPromise) return audioDBPromise;
    audioDBPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(AUDIO_DB, AUDIO_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(JOB_STORE)) db.createObjectStore(JOB_STORE, { keyPath: "bookId" });
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const store = db.createObjectStore(CHUNK_STORE, { keyPath: "key" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { audioDBPromise = null; reject(req.error); };
    });
    return audioDBPromise;
  }

  async function getJob(bookId) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(JOB_STORE, "readonly").objectStore(JOB_STORE).get(String(bookId));
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }

  async function putJob(job) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(JOB_STORE, "readwrite").objectStore(JOB_STORE).put(job);
      req.onsuccess = () => resolve(job); req.onerror = () => reject(req.error);
    });
  }

  function chunkKey(bookId, configKey, chapter, block) {
    return `${bookId}::${configKey}::${chapter}::${block}`;
  }

  async function putChunk(record) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(CHUNK_STORE, "readwrite").objectStore(CHUNK_STORE).put(record);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  }

  async function getChunk(job, chapter, block) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const key = chunkKey(job.bookId, job.configKey, chapter, block);
      const req = db.transaction(CHUNK_STORE, "readonly").objectStore(CHUNK_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }

  async function clearBookChunks(bookId) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNK_STORE, "readwrite");
      const store = tx.objectStore(CHUNK_STORE);
      const index = store.index("bookId");
      const req = index.openCursor(IDBKeyRange.only(String(bookId)));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function waitForTTS() {
    for (let i = 0; i < 30; i++) {
      if (window.__narradorWarmTTS) return window.__narradorWarmTTS;
      if (typeof window.__narradorWarmAI === "function") return window.__narradorWarmAI();
      await wait(100);
    }
    throw new Error("El motor de IA todavía no está disponible.");
  }

  function jobPercent(job) {
    if (!job?.totalBlocks) return 0;
    return Math.max(0, Math.min(100, Math.round((job.doneBlocks / job.totalBlocks) * 100)));
  }

  function stateLabel(job) {
    if (!job) return "Aún no has creado este audiolibro.";
    if (job.state === "ready") return "Tu audiolibro está listo para escuchar offline.";
    if (job.state === "generating") return `Preparando audio · ${jobPercent(job)}%`;
    if (job.state === "paused") return `Generación pausada · ${jobPercent(job)}%`;
    if (job.state === "error") return "La generación se detuvo. Puedes continuar desde donde quedó.";
    return "Listo para preparar.";
  }

  function ensureUI() {
    if ($("#aiAudiobookSheet50")) return;
    const style = document.createElement("style");
    style.id = "aiAudiobookStyle50";
    style.textContent = `
      #aiAudiobookSheet50{position:fixed;inset:0;z-index:2147483200;display:none}#aiAudiobookSheet50.open{display:block}
      .ai50Backdrop{position:absolute;inset:0;background:rgba(15,23,42,.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
      .ai50Panel{position:absolute;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:560px;margin:auto;background:#fff;border:1px solid #e4e8f0;border-radius:27px;padding:22px;box-shadow:0 26px 70px rgba(15,23,42,.26)}
      .ai50Top{display:flex;align-items:center;justify-content:space-between;gap:16px}.ai50Spark{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,#eaf0ff,#f1ecff);color:#536dff;font-size:23px;font-weight:900}.ai50Close{width:38px;height:38px;border:0;border-radius:50%;background:#f1f3f7;color:#6b7280;font-size:18px}
      .ai50Eyebrow{margin-top:18px;font-size:11px;font-weight:900;letter-spacing:.14em;color:#8c96a8;text-transform:uppercase}.ai50Title{font-size:26px;line-height:1.08;margin:6px 0 8px;letter-spacing:-.035em}.ai50Text{font-size:14px;color:#687386;line-height:1.5;margin:0}
      .ai50Progress{height:9px;background:#e9edf5;border-radius:999px;overflow:hidden;margin:20px 0 8px}.ai50Progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3976ff,#7659ff);border-radius:inherit;transition:width .2s ease}.ai50Meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;font-weight:800;color:#7d8798}.ai50Meta span:last-child{text-align:right}
      .ai50Hint{margin:14px 0 0;padding:12px 13px;background:#f7f9fd;border:1px solid #e9edf4;border-radius:14px;font-size:12px;color:#667085;line-height:1.45}.ai50Actions{display:grid;grid-template-columns:1fr;gap:9px;margin-top:18px}.ai50Primary,.ai50Secondary{min-height:50px;border:0;border-radius:15px;font-weight:900;font-size:15px}.ai50Primary{background:linear-gradient(145deg,#3575ff,#6457ff);color:#fff;box-shadow:0 10px 24px rgba(61,100,255,.24)}.ai50Secondary{background:#eef2f8;color:#4f5d73}.ai50Primary:disabled{opacity:.45;box-shadow:none}
      #aiJobPill50{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 88px);transform:translateX(-50%);z-index:90;width:min(520px,calc(100% - 30px));display:none;align-items:center;gap:11px;padding:11px 13px;background:rgba(17,24,39,.94);color:#fff;border-radius:17px;box-shadow:0 16px 38px rgba(17,24,39,.25);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}#aiJobPill50.show{display:flex}.ai50PillIcon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:rgba(255,255,255,.13);font-size:16px}.ai50PillText{min-width:0;flex:1}.ai50PillText strong,.ai50PillText span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai50PillText strong{font-size:12px}.ai50PillText span{font-size:11px;opacity:.72;margin-top:2px}.ai50PillPct{font-size:12px;font-weight:900}
      #aiBuildCard50{display:none;margin-top:12px;padding:13px;border:1px solid #dde6ff;background:linear-gradient(135deg,#f7f9ff,#f3f0ff);border-radius:16px}#aiBuildCard50.show{display:block}.ai50BuildRow{display:flex;align-items:center;gap:12px}.ai50BuildInfo{flex:1;min-width:0}.ai50BuildInfo strong,.ai50BuildInfo span{display:block}.ai50BuildInfo strong{font-size:13px;color:#334155}.ai50BuildInfo span{font-size:12px;color:#718096;margin-top:3px}.ai50BuildBtn{border:0;border-radius:12px;padding:10px 12px;background:#3d72ff;color:#fff;font-size:12px;font-weight:900;white-space:nowrap}
      body.aiSheetOpen50{overflow:hidden}body.aiSheetOpen50 .bottomNav{visibility:hidden!important;pointer-events:none!important}
    `;
    document.head.appendChild(style);

    const sheet = document.createElement("div");
    sheet.id = "aiAudiobookSheet50";
    sheet.innerHTML = `<div class="ai50Backdrop" data-ai50-close></div><div class="ai50Panel" role="dialog" aria-modal="true"><div class="ai50Top"><div class="ai50Spark">✦</div><button class="ai50Close" type="button" data-ai50-close>×</button></div><div class="ai50Eyebrow">AUDIOBOOK IA</div><h3 id="ai50Title" class="ai50Title">Crear audiolibro con IA</h3><p id="ai50Text" class="ai50Text"></p><div class="ai50Progress"><i id="ai50Bar"></i></div><div class="ai50Meta"><span id="ai50Percent">0%</span><span id="ai50Chapter">Listo para comenzar</span></div><div id="ai50Hint" class="ai50Hint">Narrador guardará cada parte en este iPhone. Si iOS suspende la app, continuará desde el último fragmento guardado cuando vuelvas.</div><div class="ai50Actions"><button id="ai50Primary" class="ai50Primary" type="button">Crear audiolibro</button><button id="ai50Secondary" class="ai50Secondary" type="button" data-ai50-close>Seguir usando Narrador</button></div></div>`;
    document.body.appendChild(sheet);

    const pill = document.createElement("button");
    pill.type = "button";
    pill.id = "aiJobPill50";
    pill.innerHTML = `<span class="ai50PillIcon">✦</span><span class="ai50PillText"><strong>Preparando audiolibro</strong><span id="ai50PillBook">Narrador</span></span><span id="ai50PillPct" class="ai50PillPct">0%</span>`;
    document.body.appendChild(pill);

    sheet.addEventListener("click", event => { if (event.target.closest?.("[data-ai50-close]")) closeSheet(); });
    pill.addEventListener("click", () => { if (activeBookId) openSheetForId(activeBookId); });
    $("#ai50Primary")?.addEventListener("click", handlePrimaryAction);
  }

  function closeSheet() {
    $("#aiAudiobookSheet50")?.classList.remove("open");
    document.body.classList.remove("aiSheetOpen50");
  }

  async function bookById(id) {
    const cached = bookCache.find(b => String(b.id) === String(id));
    if (cached) return cached;
    const all = await readBooks();
    return all.find(b => String(b.id) === String(id)) || null;
  }

  async function detailBook() {
    const title = $("#bookTitle")?.textContent?.trim();
    if (!title) return null;
    const all = await readBooks();
    return all.find(b => String(b.title || "").trim() === title) || null;
  }

  async function playerBook() {
    const title = $("#playerBook")?.textContent?.trim();
    if (!title) return null;
    const all = await readBooks();
    return all.find(b => String(b.title || "").trim() === title) || null;
  }

  async function homeBook() {
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) return bookById(id);
    const all = await readBooks();
    return [...all].sort((a,b) => (b.lastPlayedAt || b.createdAt || 0) - (a.lastPlayedAt || a.createdAt || 0))[0] || null;
  }

  function currentChapterFromJob(job) {
    if (!job?.chapterBlockCounts?.length || !job.totalBlocks) return "";
    const done = Math.min(job.doneBlocks || 0, job.totalBlocks);
    let cursor = 0;
    for (let i = 0; i < job.chapterBlockCounts.length; i++) {
      cursor += job.chapterBlockCounts[i] || 0;
      if (done < cursor) return `Capítulo ${i + 1} de ${job.chapterBlockCounts.length}`;
    }
    return `${job.chapterBlockCounts.length} capítulos completos`;
  }

  function renderJob(job, book) {
    ensureUI();
    activeJob = job;
    if (book) activeBookId = String(book.id);
    const pct = jobPercent(job);
    const title = $("#ai50Title"), text = $("#ai50Text"), bar = $("#ai50Bar"), percent = $("#ai50Percent"), chapter = $("#ai50Chapter"), primary = $("#ai50Primary"), hint = $("#ai50Hint");
    if (bar) bar.style.width = `${pct}%`;
    if (percent) percent.textContent = `${pct}%`;
    if (chapter) chapter.textContent = job ? currentChapterFromJob(job) : "Listo para comenzar";

    if (!job) {
      if (title) title.textContent = "Crear audiolibro con IA";
      if (text) text.textContent = `${book?.title || "Este libro"} se generará completo antes de comenzar la reproducción.`;
      if (primary) { primary.textContent = "✦ Crear audiolibro"; primary.disabled = false; primary.dataset.action = "start"; }
      if (hint) hint.textContent = "La voz del iPhone seguirá disponible al instante. La opción IA prepara y guarda el libro completo en este dispositivo.";
    } else if (job.state === "ready") {
      if (title) title.textContent = "Tu audiolibro está listo";
      if (text) text.textContent = `${book?.title || job.title || "Tu libro"} ya está guardado y listo para reproducirse sin esperar generación.`;
      if (primary) { primary.textContent = "▶ Reproducir audiolibro"; primary.disabled = false; primary.dataset.action = "play"; }
      if (hint) hint.textContent = "El audio se guardó offline en este iPhone. Si cambias voz, estilo o velocidad de IA, Narrador te pedirá regenerarlo.";
    } else if (job.state === "generating") {
      if (title) title.textContent = "Preparando tu audiolibro";
      if (text) text.textContent = `${book?.title || job.title || "Tu libro"} se está generando capítulo por capítulo.`;
      if (primary) { primary.textContent = "Generando…"; primary.disabled = true; primary.dataset.action = "none"; }
      if (hint) hint.textContent = "Puedes cerrar esta ventana y seguir usando Narrador. Cada fragmento terminado queda guardado; si iOS suspende la app, continuará al volver.";
    } else {
      if (title) title.textContent = "Continuar audiolibro";
      if (text) text.textContent = job.error ? `La generación se pausó: ${String(job.error).slice(0, 130)}` : "La generación quedó pausada y puede continuar desde el último fragmento guardado.";
      if (primary) { primary.textContent = "↻ Continuar generación"; primary.disabled = false; primary.dataset.action = "resume"; }
      if (hint) hint.textContent = "No se perdió el progreso. Narrador continuará exactamente desde el último fragmento guardado.";
    }

    const pill = $("#aiJobPill50");
    if (pill) {
      pill.classList.toggle("show", job?.state === "generating");
      $("#ai50PillBook").textContent = book?.title || job?.title || "Audiolibro";
      $("#ai50PillPct").textContent = `${pct}%`;
    }
    updateDetailCard(job, book);
  }

  async function openSheetForBook(book) {
    if (!book) return toast("No pude localizar este libro.");
    const config = aiConfig(book);
    let job = await getJob(book.id).catch(() => null);
    if (job && job.configKey !== config.key && job.state === "ready") {
      job = { ...job, state: "stale", error: "Cambiaste la voz, estilo o velocidad de IA." };
    }
    activeBookId = String(book.id);
    renderJob(job, book);
    document.body.classList.add("aiSheetOpen50");
    $("#aiAudiobookSheet50")?.classList.add("open");
  }

  async function openSheetForId(id) { return openSheetForBook(await bookById(id)); }

  async function handlePrimaryAction() {
    const book = await bookById(activeBookId);
    if (!book) return;
    const action = $("#ai50Primary")?.dataset.action;
    if (action === "play") {
      closeSheet();
      return startReadyPlayback(book);
    }
    if (action === "start") return startGeneration(book, true);
    if (action === "resume") return startGeneration(book, false);
  }

  async function startGeneration(book, fresh = false) {
    if (!book?.chapters?.length) return toast("No encontré capítulos para generar.");
    stopAIPlayback(false);
    try { await navigator.storage?.persist?.(); } catch (_) {}

    const config = aiConfig(book);
    const { plan, chapterBlockCounts } = planBook(book);
    if (!plan.length) return toast("No encontré texto para generar.");

    let job = await getJob(book.id).catch(() => null);
    const mustReset = fresh || !job || job.configKey !== config.key || job.totalBlocks !== plan.length || job.state === "stale";
    if (mustReset) {
      generationToken++;
      await clearBookChunks(book.id).catch(() => {});
      job = {
        bookId: String(book.id), title: book.title || "Libro", configKey: config.key,
        voice: config.voice, language: config.language, style: config.style, speed: config.speed,
        state: "generating", totalBlocks: plan.length, doneBlocks: 0, nextIndex: 0,
        chapterBlockCounts, startedAt: Date.now(), updatedAt: Date.now(), completedAt: null,
        playChapter: Math.max(0, Math.min(Number(book.lastChapter || 0), chapterBlockCounts.length - 1)), playBlock: 0, error: ""
      };
      await putJob(job);
    } else {
      if (job.state === "ready") { renderJob(job, book); return; }
      job.state = "generating";
      job.error = "";
      job.updatedAt = Date.now();
      await putJob(job);
    }

    activeBookId = String(book.id);
    activeJob = job;
    pauseGeneration = false;
    renderJob(job, book);
    runGeneration(book, job, plan, config).catch(() => {});
  }

  async function runGeneration(book, job, plan, config) {
    const myToken = ++generationToken;
    try {
      const tts = await waitForTTS();
      if (myToken !== generationToken) return;
      try { await tts.prepareLanguage?.(config.language); } catch (_) {}

      for (let i = Math.max(0, job.nextIndex || 0); i < plan.length; i++) {
        if (myToken !== generationToken) return;
        if (pauseGeneration || document.hidden) {
          job.state = "generating";
          job.updatedAt = Date.now();
          await putJob(job);
          renderJob(job, book);
          return;
        }

        const part = plan[i];
        const raw = await tts.generate(part.text, { voice: config.voice, speed: config.speed });
        if (myToken !== generationToken) return;
        const blob = raw.toBlob();
        await putChunk({
          key: chunkKey(book.id, config.key, part.chapterIndex, part.blockIndex),
          bookId: String(book.id), configKey: config.key, chapterIndex: part.chapterIndex,
          blockIndex: part.blockIndex, blob, createdAt: Date.now()
        });

        job.doneBlocks = i + 1;
        job.nextIndex = i + 1;
        job.updatedAt = Date.now();
        job.state = "generating";
        await putJob(job);
        activeJob = job;
        renderJob(job, book);
        if ((i + 1) % 3 === 0) await wait(0);
      }

      job.state = "ready";
      job.doneBlocks = plan.length;
      job.nextIndex = plan.length;
      job.updatedAt = Date.now();
      job.completedAt = Date.now();
      job.error = "";
      await putJob(job);
      activeJob = job;
      renderJob(job, book);
      toast(`Tu audiolibro “${book.title || "Libro"}” está listo.`, 5200);
      await notifyReady(book);
    } catch (error) {
      if (myToken !== generationToken) return;
      console.error("Narrador v50 audiobook generation:", error);
      job.state = "error";
      job.error = /quota/i.test(String(error?.name || error?.message || error)) ? "No hay suficiente espacio disponible para continuar guardando el audio." : String(error?.message || error || "Error de generación").slice(0, 180);
      job.updatedAt = Date.now();
      await putJob(job).catch(() => {});
      activeJob = job;
      renderJob(job, book);
      toast("La generación se pausó. Tu progreso quedó guardado.", 4800);
    }
  }

  async function notifyReady(book) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker?.ready;
      await reg?.showNotification?.("Tu audiolibro está listo ✦", {
        body: book?.title || "Narrador terminó de preparar tu libro.",
        icon: "./icon.svg", badge: "./icon.svg", tag: `narrador-ready-${book?.id || "book"}`,
        data: { url: "./" }
      });
    } catch (_) {}
  }

  function clearPlayerAudio() {
    if (aiPlayer.audio) {
      try { aiPlayer.audio.onended = null; aiPlayer.audio.onerror = null; aiPlayer.audio.pause(); aiPlayer.audio.src = ""; } catch (_) {}
      aiPlayer.audio = null;
    }
    if (aiPlayer.url) { try { URL.revokeObjectURL(aiPlayer.url); } catch (_) {} aiPlayer.url = null; }
  }

  function stopAIPlayback(update = true) {
    aiPlayer.token++;
    aiPlayer.playing = false;
    clearPlayerAudio();
    if (update) updateAIPlayUI();
  }

  function updateAIPlayUI() {
    const activeId = aiPlayer.playing && aiPlayer.book ? String(aiPlayer.book.id) : "";
    $$("#homeFeatured [data-home45-action='play']").forEach(btn => {
      if (prefs().engine === "kokoro") btn.textContent = activeId && String($("#homeFeatured")?.dataset.bookId) === activeId ? "Ⅱ" : "▶";
    });
    $$("#historyList .historyRow").forEach(row => {
      const icon = row.querySelector(".historyPlay");
      if (icon && prefs().engine === "kokoro") icon.textContent = activeId && String(row.dataset.bookId) === activeId ? "Ⅱ" : "▶";
    });
    const play = $("#playBtn");
    if (play && prefs().engine === "kokoro") play.textContent = aiPlayer.playing ? "Ⅱ" : "▶";
  }

  async function startReadyPlayback(book) {
    if (!book) return;
    if (aiPlayer.playing && aiPlayer.book && String(aiPlayer.book.id) === String(book.id)) { stopAIPlayback(); return; }
    const config = aiConfig(book);
    const job = await getJob(book.id).catch(() => null);
    if (!job || job.state !== "ready" || job.configKey !== config.key) return openSheetForBook(book);

    try { window.__narradorSpeech49?.stop?.(false); } catch (_) {}
    try { speechSynthesis.cancel(); } catch (_) {}
    window.__narradorUnlockAudio?.();
    stopAIPlayback(false);

    aiPlayer.book = book;
    aiPlayer.job = job;
    aiPlayer.chapter = Math.max(0, Math.min(Number(job.playChapter ?? book.lastChapter ?? 0), Math.max(0, job.chapterBlockCounts.length - 1)));
    aiPlayer.block = Math.max(0, Math.min(Number(job.playBlock || 0), Math.max(0, (job.chapterBlockCounts[aiPlayer.chapter] || 1) - 1)));
    aiPlayer.playing = true;
    const token = ++aiPlayer.token;
    updateAIPlayUI();
    playGeneratedChunk(token);
  }

  async function playGeneratedChunk(token) {
    if (token !== aiPlayer.token || !aiPlayer.playing || !aiPlayer.job) return;
    const record = await getChunk(aiPlayer.job, aiPlayer.chapter, aiPlayer.block).catch(() => null);
    if (token !== aiPlayer.token || !aiPlayer.playing) return;
    if (!record?.blob) {
      stopAIPlayback();
      toast("Falta una parte del audio. Abre IA para repararlo.");
      return;
    }

    clearPlayerAudio();
    aiPlayer.url = URL.createObjectURL(record.blob);
    aiPlayer.audio = new Audio(aiPlayer.url);
    aiPlayer.audio.onended = async () => {
      if (token !== aiPlayer.token || !aiPlayer.playing) return;
      clearPlayerAudio();
      const count = aiPlayer.job.chapterBlockCounts[aiPlayer.chapter] || 0;
      if (aiPlayer.block + 1 < count) aiPlayer.block++;
      else if (aiPlayer.chapter + 1 < aiPlayer.job.chapterBlockCounts.length) { aiPlayer.chapter++; aiPlayer.block = 0; }
      else {
        aiPlayer.playing = false;
        aiPlayer.job.playChapter = 0;
        aiPlayer.job.playBlock = 0;
        await putJob(aiPlayer.job).catch(() => {});
        updateAIPlayUI();
        toast("Audiolibro terminado.");
        return;
      }
      await saveAIPlaybackProgress();
      updateAIPlayUI();
      playGeneratedChunk(token);
    };
    aiPlayer.audio.onerror = () => {
      if (token !== aiPlayer.token) return;
      stopAIPlayback();
      toast("La reproducción del audiolibro se detuvo.");
    };

    try {
      await aiPlayer.audio.play();
      updateAIPlayUI();
      updatePlayerProgress();
    } catch (error) {
      if (token !== aiPlayer.token) return;
      console.warn("Narrador v50 saved audio playback:", error);
      stopAIPlayback();
      toast("Toca Play otra vez para continuar.");
    }
  }

  async function saveAIPlaybackProgress() {
    if (!aiPlayer.job || !aiPlayer.book) return;
    aiPlayer.job.playChapter = aiPlayer.chapter;
    aiPlayer.job.playBlock = aiPlayer.block;
    aiPlayer.job.lastPlayedAt = Date.now();
    aiPlayer.book.lastChapter = aiPlayer.chapter;
    aiPlayer.book.lastSegment = 0;
    aiPlayer.book.lastPlayedAt = Date.now();
    await Promise.allSettled([putJob(aiPlayer.job), putBook(aiPlayer.book)]);
  }

  function updatePlayerProgress() {
    if (!aiPlayer.job?.totalBlocks) return;
    let before = 0;
    for (let i = 0; i < aiPlayer.chapter; i++) before += aiPlayer.job.chapterBlockCounts[i] || 0;
    const pct = Math.max(0, Math.min(100, Math.round(((before + aiPlayer.block) / aiPlayer.job.totalBlocks) * 100)));
    if ($("#speechProgress")) $("#speechProgress").style.width = `${pct}%`;
    if ($("#speechPercent")) $("#speechPercent").textContent = `${pct}%`;
    if ($("#speechSegment")) $("#speechSegment").textContent = `${pct}%`;
  }

  function ensureDetailCard() {
    const note = $("#aiNote");
    if (!note || $("#aiBuildCard50")) return;
    const card = document.createElement("div");
    card.id = "aiBuildCard50";
    card.innerHTML = `<div class="ai50BuildRow"><div class="ai50BuildInfo"><strong id="ai50BuildTitle">Audiolibro IA</strong><span id="ai50BuildStatus">Prepáralo completo antes de escuchar.</span></div><button id="ai50BuildBtn" class="ai50BuildBtn" type="button">Preparar</button></div>`;
    note.insertAdjacentElement("afterend", card);
    $("#ai50BuildBtn")?.addEventListener("click", async () => openSheetForBook(await detailBook()));
  }

  async function updateDetailCard(job = undefined, book = undefined) {
    ensureDetailCard();
    const card = $("#aiBuildCard50");
    if (!card) return;
    const engine = $("#engineSelect")?.value || prefs().engine;
    card.classList.toggle("show", engine === "kokoro");
    if (engine !== "kokoro") return;
    book = book || await detailBook();
    if (!book) return;
    if (job === undefined) job = await getJob(book.id).catch(() => null);
    const config = aiConfig(book);
    const stale = job && job.configKey !== config.key;
    const status = stale ? "Cambiaste los ajustes · toca para regenerar." : stateLabel(job);
    if ($("#ai50BuildStatus")) $("#ai50BuildStatus").textContent = status;
    if ($("#ai50BuildBtn")) $("#ai50BuildBtn").textContent = job?.state === "ready" && !stale ? "Reproducir" : job?.state === "generating" ? `${jobPercent(job)}%` : job ? "Continuar" : "Preparar";
  }

  function decorateLabels() {
    const bookAI = $("#engineSelect option[value='kokoro']");
    if (bookAI) bookAI.textContent = "IA · preparar audiolibro";
    const homeAI = $("#homeEngine45 option[value='kokoro']");
    if (homeAI) homeAI.textContent = "IA · audiolibro completo";
    const settingsAI = $("#settingsEngine option[value='kokoro']");
    if (settingsAI) settingsAI.textContent = "IA · audiolibro completo";
    const note = $("#aiNote");
    if (note && $("#engineSelect")?.value === "kokoro") {
      note.classList.remove("hidden");
      const strong = note.querySelector("strong"), span = note.querySelector("span");
      if (strong) strong.textContent = "Audiolibro con IA";
      if (span) span.textContent = "La IA genera y guarda el libro completo antes de reproducirlo. Después podrás escucharlo sin esperas de generación.";
    }
    updateDetailCard();
  }

  async function resolveHistoryBook(row) {
    if (row?.dataset.bookId) return bookById(row.dataset.bookId);
    const title = row?.querySelector("h4")?.textContent?.trim();
    if (!title) return null;
    const all = await readBooks();
    return all.find(b => String(b.title || "").trim() === title) || null;
  }

  async function handleAIPlay(source, row = null) {
    let book = null;
    if (source === "home") book = await homeBook();
    else if (source === "history") book = await resolveHistoryBook(row);
    else if (source === "player") book = await playerBook();
    if (!book) return toast("No pude localizar este libro.");
    const job = await getJob(book.id).catch(() => null);
    const config = aiConfig(book);
    if (job?.state === "ready" && job.configKey === config.key) return startReadyPlayback(book);
    openSheetForBook(book);
  }

  async function resumeActiveJobs() {
    if (document.hidden) return;
    const db = await openAudioDB().catch(() => null);
    if (!db) return;
    const jobs = await new Promise(resolve => {
      const req = db.transaction(JOB_STORE, "readonly").objectStore(JOB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]);
    });
    const pending = jobs.find(job => job.state === "generating");
    if (!pending) return;
    const book = await bookById(pending.bookId);
    if (!book) return;
    const config = aiConfig(book);
    if (pending.configKey !== config.key) {
      pending.state = "stale";
      pending.error = "Los ajustes de IA cambiaron antes de terminar.";
      await putJob(pending).catch(() => {});
      return;
    }
    const { plan } = planBook(book);
    activeBookId = String(book.id);
    activeJob = pending;
    pauseGeneration = false;
    renderJob(pending, book);
    runGeneration(book, pending, plan, config).catch(() => {});
  }

  function installEventInterceptors() {
    // Window capture runs before the legacy document listeners. Only IA is intercepted;
    // the stable iPhone/system path from v49 remains untouched.
    window.addEventListener("pointerdown", event => {
      if (prefs().engine !== "kokoro") return;
      const home = event.target?.closest?.("#homeFeatured [data-home45-action='play']");
      const history = event.target?.closest?.("#historyList .historyPlay");
      const player = event.target?.closest?.("#playBtn");
      if (!home && !history && !player) return;
      window.__narradorUnlockAudio?.();
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    window.addEventListener("click", event => {
      if (prefs().engine !== "kokoro") return;
      const home = event.target?.closest?.("#homeFeatured [data-home45-action='play']");
      const history = event.target?.closest?.("#historyList .historyPlay");
      const player = event.target?.closest?.("#playBtn");
      if (!home && !history && !player) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (home) handleAIPlay("home");
      else if (history) handleAIPlay("history", history.closest(".historyRow"));
      else handleAIPlay("player");
    }, true);

    document.addEventListener("change", event => {
      if (event.target?.matches?.("#engineSelect,#homeEngine45,#settingsEngine,#languageSelect,#homeLanguage45,#voiceSelect,#homeVoice45,#styleSelect,#homeStyle45")) {
        setTimeout(() => { decorateLabels(); if (aiPlayer.playing) stopAIPlayback(); }, 30);
      }
    }, true);
    document.addEventListener("input", event => {
      if (event.target?.matches?.("#speedRange,#homeSpeed45")) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { updateDetailCard(); if (aiPlayer.playing) stopAIPlayback(); }, 160);
      }
    }, true);

    document.addEventListener("pointerdown", event => {
      if (event.target?.closest?.("#homeFeatured [data-home45-action='voice']")) setTimeout(decorateLabels, 40);
    }, true);
  }

  function install() {
    ensureUI();
    installEventInterceptors();
    readBooks().then(() => { decorateLabels(); resumeActiveJobs(); });

    const bodyObserver = new MutationObserver(mutations => {
      let relevant = false;
      for (const m of mutations) {
        if ([...m.addedNodes].some(node => node.nodeType === 1 && (node.matches?.("#homeControlSheet45,.settingsCard,.historyRow") || node.querySelector?.("#homeControlSheet45,.settingsCard,.historyRow")))) { relevant = true; break; }
      }
      if (relevant) setTimeout(decorateLabels, 30);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseGeneration = true;
      } else {
        pauseGeneration = false;
        readBooks().then(() => resumeActiveJobs());
      }
    });
    window.addEventListener("pageshow", () => setTimeout(() => readBooks().then(() => resumeActiveJobs()), 500));
    window.addEventListener("narrador:boot-ready", () => setTimeout(() => readBooks().then(() => resumeActiveJobs()), 250));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.__narradorAudiobook50 = {
    open: openSheetForBook,
    start: startGeneration,
    play: startReadyPlayback,
    stop: stopAIPlayback,
    getJob,
    resume: resumeActiveJobs,
  };
})();