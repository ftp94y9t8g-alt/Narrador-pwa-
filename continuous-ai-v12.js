// Narrador v12: buffered continuous local-AI playback for iPhone.
// The original player generated one short passage only after the previous one
// finished, which created long silent gaps. This layer prepares several passages
// ahead of playback, generates the next passage while the current one is speaking,
// and uses larger safe blocks to give the iPhone more time to stay ahead.

(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const BLOCK_TARGET = 420;
  const PREFETCH_DEPTH = 3;
  const MAX_BLOBS = 4;
  const STYLE_SPEED = { warm: 0.96, cinematic: 0.92, expressive: 1.0, calm: 0.88 };

  const $ = (s) => document.querySelector(s);
  let dbPromise = null;
  let context = null;
  let playing = false;
  let preparing = false;
  let session = 0;
  let currentAudio = null;
  let currentUrl = null;
  let generationChain = Promise.resolve();
  let prebufferTimer = null;
  let autoContinueTimer = null;
  const blobs = new Map();
  const pending = new Map();

  function toast(message, ms = 3500) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), ms);
  }

  function statusEl() {
    let el = $("#continuousStatus");
    if (el) return el;
    const meta = $(".progressMeta");
    if (!meta) return null;
    el = document.createElement("div");
    el.id = "continuousStatus";
    el.style.cssText = "font-size:13px;opacity:.68;margin-top:8px;min-height:18px;text-align:center;";
    meta.insertAdjacentElement("afterend", el);
    return el;
  }

  function setStatus(message = "") {
    const el = statusEl();
    if (el) el.textContent = message;
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function allBooks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function makeBlock(text) {
    return { text: String(text || "").trim() };
  }

  // Keep blocks below Kokoro's token ceiling. 420 source characters is longer
  // than the old ~330-char passages while remaining conservative after Spanish
  // phonemization.
  function blockText(text) {
    const paragraphs = String(text || "").split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    const result = [];
    let buffer = "";

    const push = () => {
      const clean = buffer.trim();
      if (clean) result.push(makeBlock(clean));
      buffer = "";
    };

    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const s = sentence.trim();
        if (!s) continue;
        if (buffer && (buffer + " " + s).length > BLOCK_TARGET) push();
        if (s.length > BLOCK_TARGET * 1.35 && !buffer) {
          // Very long sentence: split gently at commas/semicolons/spaces.
          let rest = s;
          while (rest.length > BLOCK_TARGET * 1.2) {
            let cut = Math.max(rest.lastIndexOf(";", BLOCK_TARGET), rest.lastIndexOf(",", BLOCK_TARGET), rest.lastIndexOf(" ", BLOCK_TARGET));
            if (cut < BLOCK_TARGET * 0.65) cut = BLOCK_TARGET;
            result.push(makeBlock(rest.slice(0, cut + 1)));
            rest = rest.slice(cut + 1).trim();
          }
          buffer = rest;
        } else {
          buffer += (buffer ? " " : "") + s;
        }
      }
      if (buffer && buffer.length > BLOCK_TARGET * 0.78) push();
    }
    push();
    return result;
  }

  function activeAI() {
    return $("#engineSelect")?.value === "kokoro";
  }

  function settings() {
    const style = $("#styleSelect")?.value || "warm";
    const uiSpeed = Number($("#speedRange")?.value || 0.95);
    const speed = Math.max(0.75, Math.min(1.2, (STYLE_SPEED[style] || 0.96) * uiSpeed));
    const language = $("#languageSelect")?.value || "auto";
    let voice = $("#voiceSelect")?.value || (language === "en" ? "am_michael" : "em_alex");
    return { voice, speed };
  }

  async function buildContext() {
    const bookTitle = $("#playerBook")?.textContent?.trim();
    const chapterIndex = Number($("#playerChapterSelect")?.value ?? 0);
    if (!bookTitle || !Number.isFinite(chapterIndex)) return null;

    const books = await allBooks();
    const book = books.find(b => b.title === bookTitle);
    if (!book?.chapters?.[chapterIndex]) return null;

    const chapter = book.chapters[chapterIndex];
    const blocksForChapter = blockText(chapter.text);
    if (!blocksForChapter.length) return null;

    // If the legacy player is already displaying a passage, map it into the
    // larger v12 blocks so an update does not unnecessarily jump backward.
    const shown = $("#currentText")?.textContent?.trim() || "";
    let index = 0;
    if (shown && shown !== "Pulsa reproducir." && shown !== "No hay texto.") {
      const anchor = shown.slice(0, 70);
      const found = blocksForChapter.findIndex(b => b.text.includes(anchor) || anchor.includes(b.text.slice(0, 45)));
      if (found >= 0) index = found;
    }

    return {
      book,
      chapter,
      chapterIndex,
      blocks: blocksForChapter,
      index,
      key: `${book.id || book.title}|${chapterIndex}`,
    };
  }

  function cacheKey(ctx, index) {
    const { voice, speed } = settings();
    return `${ctx.key}|${index}|${voice}|${speed.toFixed(3)}`;
  }

  function rememberBlob(key, blob) {
    if (blobs.has(key)) blobs.delete(key);
    blobs.set(key, blob);
    while (blobs.size > MAX_BLOBS) {
      blobs.delete(blobs.keys().next().value);
    }
  }

  async function getTTS() {
    if (window.__narradorWarmTTS) return window.__narradorWarmTTS;
    if (typeof window.__narradorWarmAI !== "function") throw new Error("El motor de voz todavía no está disponible.");
    return window.__narradorWarmAI();
  }

  function queueGeneration(task) {
    const job = generationChain.catch(() => {}).then(task);
    generationChain = job.catch(() => {});
    return job;
  }

  function ensureBlob(ctx, index) {
    if (!ctx || index < 0 || index >= ctx.blocks.length) return Promise.resolve(null);
    const key = cacheKey(ctx, index);
    if (blobs.has(key)) return Promise.resolve(blobs.get(key));
    if (pending.has(key)) return pending.get(key);

    const job = queueGeneration(async () => {
      const tts = await getTTS();
      const { voice, speed } = settings();
      const raw = await tts.generate(ctx.blocks[index].text, { voice, speed });
      const blob = raw.toBlob();
      rememberBlob(key, blob);
      return blob;
    }).finally(() => pending.delete(key));

    pending.set(key, job);
    return job;
  }

  async function prefetchWindow(ctx, start, depth = PREFETCH_DEPTH, validSession = session) {
    for (let i = start; i < Math.min(ctx.blocks.length, start + depth); i++) {
      if (validSession !== session || context?.key !== ctx.key || !activeAI()) return;
      try {
        await ensureBlob(ctx, i);
      } catch (error) {
        console.warn("Narrador: no se pudo preparar un bloque anticipado", error);
        return;
      }
    }
  }

  function clearCurrentAudio() {
    if (currentAudio) {
      try { currentAudio.onended = null; currentAudio.onerror = null; currentAudio.pause(); } catch (_) {}
      try { currentAudio.src = ""; } catch (_) {}
      currentAudio = null;
    }
    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch (_) {}
      currentUrl = null;
    }
  }

  function updateUI(ctx, index, preparingNow = false) {
    const total = Math.max(1, ctx.blocks.length);
    const pct = Math.min(100, Math.round((index / Math.max(1, total - 1)) * 100));
    const bar = $("#speechProgress");
    if (bar) bar.style.width = `${pct}%`;
    if ($("#speechPercent")) $("#speechPercent").textContent = `${pct}%`;
    if ($("#speechSegment")) $("#speechSegment").textContent = `${pct}%`;
    if ($("#currentText")) $("#currentText").textContent = ctx.blocks[index]?.text || "";
    const play = $("#playBtn");
    if (play) play.textContent = preparingNow ? "…" : (playing ? "Ⅱ" : "▶");
  }

  async function playBlock(ctx, index, mySession = session) {
    if (mySession !== session || !activeAI()) return;
    if (index < 0 || index >= ctx.blocks.length) return;

    context = ctx;
    context.index = index;
    preparing = true;
    updateUI(ctx, index, true);
    setStatus(index === 0 ? "Preparando narración continua…" : "Preparando la siguiente parte…");

    let blob;
    try {
      blob = await ensureBlob(ctx, index);
    } catch (error) {
      if (mySession !== session) return;
      console.error("Narrador: falló la generación continua", error);
      preparing = false;
      playing = false;
      updateUI(ctx, index, false);
      setStatus("No se pudo preparar esta parte.");
      toast("No pude preparar la siguiente parte de la narración.", 5000);
      return;
    }

    if (mySession !== session || !playing || !blob) return;
    preparing = false;
    clearCurrentAudio();
    currentUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentUrl);
    updateUI(ctx, index, false);
    setStatus("Leyendo · preparando lo siguiente en segundo plano");

    currentAudio.onended = async () => {
      if (mySession !== session || !playing) return;
      clearCurrentAudio();
      const next = index + 1;
      if (next < ctx.blocks.length) {
        context.index = next;
        // No artificial pause here: if the next block was prepared while the
        // current one played, it starts almost immediately.
        playBlock(ctx, next, mySession);
        return;
      }

      // Continue automatically into the next chapter when possible.
      const nextChapter = $("#nextChapterBtn");
      if (nextChapter && !nextChapter.disabled) {
        setStatus("Pasando al siguiente capítulo…");
        playing = false;
        if ($("#playBtn")) $("#playBtn").textContent = "…";
        nextChapter.click();
        clearTimeout(autoContinueTimer);
        autoContinueTimer = setTimeout(() => {
          if (!activeAI()) return;
          startContinuous(true);
        }, 450);
      } else {
        playing = false;
        updateUI(ctx, index, false);
        setStatus("Capítulo terminado");
      }
    };

    currentAudio.onerror = (error) => {
      if (mySession !== session) return;
      console.error("Narrador: error de reproducción continua", error);
      playing = false;
      clearCurrentAudio();
      updateUI(ctx, index, false);
      setStatus("La reproducción se detuvo.");
      toast("La reproducción de la voz IA se detuvo.");
    };

    try {
      window.__narradorUnlockAudio?.();
      await currentAudio.play();
      // Start building the next passages immediately while this one is audible.
      prefetchWindow(ctx, index + 1, PREFETCH_DEPTH, mySession);
    } catch (error) {
      if (mySession !== session) return;
      console.error("Narrador: no pudo iniciar el audio continuo", error);
      playing = false;
      clearCurrentAudio();
      updateUI(ctx, index, false);
      setStatus("Toca reproducir otra vez.");
    }
  }

  async function startContinuous(fromChapterStart = false) {
    if (!activeAI()) return;
    window.__narradorUnlockAudio?.();
    const mySession = ++session;
    playing = true;
    preparing = true;

    try {
      const ctx = await buildContext();
      if (!ctx || mySession !== session) throw new Error("No pude localizar el capítulo actual.");
      context = ctx;
      const startIndex = fromChapterStart ? 0 : ctx.index;
      context.index = startIndex;
      updateUI(ctx, startIndex, true);
      await playBlock(ctx, startIndex, mySession);
    } catch (error) {
      if (mySession !== session) return;
      console.error("Narrador: no pudo iniciar el modo continuo", error);
      playing = false;
      preparing = false;
      if ($("#playBtn")) $("#playBtn").textContent = "▶";
      setStatus("No se pudo iniciar la narración continua.");
      toast("No pude iniciar la narración continua.", 5000);
    }
  }

  function stopContinuous(message = "En pausa") {
    session++;
    playing = false;
    preparing = false;
    clearCurrentAudio();
    clearTimeout(autoContinueTimer);
    if ($("#playBtn")) $("#playBtn").textContent = "▶";
    setStatus(message);
  }

  async function skip(delta) {
    if (!activeAI()) return;
    const ctx = context || await buildContext();
    if (!ctx) return;
    const next = Math.max(0, Math.min(ctx.blocks.length - 1, (ctx.index || 0) + delta));
    stopContinuous("");
    context = ctx;
    context.index = next;
    playing = true;
    const mySession = ++session;
    playBlock(ctx, next, mySession);
  }

  async function prepareChapterInBackground() {
    if (!activeAI() || !$("#playerView")?.classList.contains("active")) return;
    const marker = ++session;
    try {
      const ctx = await buildContext();
      if (!ctx || marker !== session || !activeAI()) return;
      context = ctx;
      setStatus("Preparando las primeras partes en segundo plano…");
      await getTTS();
      if (marker !== session || context?.key !== ctx.key) return;
      prefetchWindow(ctx, ctx.index, PREFETCH_DEPTH, marker).then(() => {
        if (marker === session && !playing && context?.key === ctx.key) setStatus("Primeras partes preparadas · toca Play");
      });
    } catch (error) {
      console.warn("Narrador: preparación anticipada omitida", error);
      if (marker === session && !playing) setStatus("La IA se preparará al tocar Play");
    }
  }

  function schedulePrebuffer(delay = 450) {
    clearTimeout(prebufferTimer);
    prebufferTimer = setTimeout(() => {
      if (!playing) prepareChapterInBackground();
    }, delay);
  }

  // Take control of the AI player's transport. System voices still use app.js.
  document.addEventListener("click", (event) => {
    const play = event.target?.closest?.("#playBtn");
    if (!play || !activeAI()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__narradorUnlockAudio?.();
    if (playing || preparing) stopContinuous();
    else startContinuous(false);
  }, { capture: true });

  document.addEventListener("click", (event) => {
    const prev = event.target?.closest?.("#prevBtn");
    const next = event.target?.closest?.("#nextBtn");
    if ((!prev && !next) || !activeAI()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    skip(prev ? -1 : 1);
  }, { capture: true });

  // Chapter navigation remains handled by app.js; we only stop our audio and
  // begin preparing the newly selected chapter after its UI has updated.
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#prevChapterBtn, #nextChapterBtn")) {
      if (playing || preparing) stopContinuous("");
      schedulePrebuffer(500);
      return;
    }
    if (event.target?.closest?.(".chapterRow, .continueInner")) {
      schedulePrebuffer(650);
      return;
    }
    if (event.target?.closest?.("[data-go]")) {
      if (playing || preparing) stopContinuous("");
    }
  }, { capture: true });

  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("#playerChapterSelect")) {
      if (playing || preparing) stopContinuous("");
      schedulePrebuffer(450);
    }
    if (event.target?.matches?.("#engineSelect") && !activeAI()) stopContinuous("");
  }, { capture: true });

  document.addEventListener("visibilitychange", () => {
    // Do not stop audio merely because the screen dims, but if Safari has
    // discarded the page, the session naturally resets on reload.
    if (!document.hidden && activeAI() && $("#playerView")?.classList.contains("active") && !playing) {
      schedulePrebuffer(700);
    }
  });

  // If the player was already open when v12 finishes loading, start preparing it.
  window.addEventListener("DOMContentLoaded", () => schedulePrebuffer(900));
})();
