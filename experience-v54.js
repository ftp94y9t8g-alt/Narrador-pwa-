// Narrador v54 — AI generation center, storage management and richer player controls.
(() => {
  const BOOK_DB = "narrador-db-v1";
  const AUDIO_DB = "narrador-audio-v1";
  const BOOK_STORE = "books";
  const JOB_STORE = "jobs";
  const CHUNK_STORE = "chunks";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let centerRefresh = 0;
  let sleepTimeout = 0;
  let sleepTicker = 0;
  let sleepEndsAt = 0;
  let installing = false;

  function toast(message, ms = 3300) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), ms);
  }

  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || "null") || {}; }
    catch (_) { return {}; }
  }

  function formatBytes(bytes = 0) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(value < 10 * 1024 ** 2 ? 1 : 0)} MB`;
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  }

  function openBooksDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BOOK_DB);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        try { req.transaction?.abort(); } catch (_) {}
        reject(new Error("Biblioteca no disponible"));
      };
    });
  }

  function openAudioDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(AUDIO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(JOB_STORE)) db.createObjectStore(JOB_STORE, { keyPath: "bookId" });
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          const store = db.createObjectStore(CHUNK_STORE, { keyPath: "key" });
          store.createIndex("bookId", "bookId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readBooks() {
    try {
      const db = await openBooksDB();
      const rows = await new Promise(resolve => {
        if (!db.objectStoreNames.contains(BOOK_STORE)) return resolve([]);
        const req = db.transaction(BOOK_STORE, "readonly").objectStore(BOOK_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      try { db.close(); } catch (_) {}
      return rows;
    } catch (_) { return []; }
  }

  async function putBook(book) {
    try {
      const db = await openBooksDB();
      await new Promise((resolve, reject) => {
        const req = db.transaction(BOOK_STORE, "readwrite").objectStore(BOOK_STORE).put(book);
        req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
      });
      try { db.close(); } catch (_) {}
    } catch (_) {}
  }

  async function readJobs() {
    try {
      const db = await openAudioDB();
      const rows = await new Promise(resolve => {
        const req = db.transaction(JOB_STORE, "readonly").objectStore(JOB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      return rows;
    } catch (_) { return []; }
  }

  async function getJob(bookId) {
    try {
      const db = await openAudioDB();
      return await new Promise(resolve => {
        const req = db.transaction(JOB_STORE, "readonly").objectStore(JOB_STORE).get(String(bookId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  async function putJob(job) {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(JOB_STORE, "readwrite").objectStore(JOB_STORE).put(job);
      req.onsuccess = () => resolve(job); req.onerror = () => reject(req.error);
    });
  }

  async function readChunks() {
    try {
      const db = await openAudioDB();
      return await new Promise(resolve => {
        const req = db.transaction(CHUNK_STORE, "readonly").objectStore(CHUNK_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) { return []; }
  }

  async function deleteAudioForBook(bookId) {
    const id = String(bookId);
    const api = window.__narradorAudiobook50;
    try { api?.stop?.(); } catch (_) {}
    const db = await openAudioDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([JOB_STORE, CHUNK_STORE], "readwrite");
      tx.objectStore(JOB_STORE).delete(id);
      const chunks = tx.objectStore(CHUNK_STORE);
      if (chunks.indexNames.contains("bookId")) {
        const req = chunks.index("bookId").openCursor(IDBKeyRange.only(id));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      } else {
        const req = chunks.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          if (String(cursor.value?.bookId) === id) cursor.delete();
          cursor.continue();
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("No se pudo borrar el audio"));
    });
  }

  async function clearAllAI() {
    try { window.__narradorAudiobook50?.stop?.(); } catch (_) {}
    const db = await openAudioDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([JOB_STORE, CHUNK_STORE], "readwrite");
      tx.objectStore(JOB_STORE).clear();
      tx.objectStore(CHUNK_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function percent(job) {
    return job?.totalBlocks ? Math.max(0, Math.min(100, Math.round(((job.doneBlocks || 0) / job.totalBlocks) * 100))) : 0;
  }

  function jobState(job) {
    if (!job) return { label: "Sin preparar", cls: "idle" };
    if (job.state === "ready") return { label: "Listo offline", cls: "ready" };
    if (job.state === "generating") return { label: `Preparando · ${percent(job)}%`, cls: "working" };
    if (job.state === "error") return { label: "Requiere atención", cls: "error" };
    if (job.state === "paused") return { label: `En pausa · ${percent(job)}%`, cls: "paused" };
    if (job.state === "stale") return { label: "Necesita regenerarse", cls: "paused" };
    return { label: job.state || "Pendiente", cls: "idle" };
  }

  function currentChapter(job) {
    if (!job?.chapterBlockCounts?.length) return "";
    const done = Math.max(0, Math.min(job.doneBlocks || 0, job.totalBlocks || 0));
    let cursor = 0;
    for (let i = 0; i < job.chapterBlockCounts.length; i++) {
      cursor += job.chapterBlockCounts[i] || 0;
      if (done < cursor) return `Capítulo ${i + 1} de ${job.chapterBlockCounts.length}`;
    }
    return `${job.chapterBlockCounts.length} capítulos completos`;
  }

  function installStyle() {
    if ($("#experience54Style")) return;
    const style = document.createElement("style");
    style.id = "experience54Style";
    style.textContent = `
      .v54ActionRow{cursor:pointer!important;touch-action:manipulation}.v54ActionRow:active{transform:scale(.992)}
      #v54CenterSheet,#v54StorageSheet,#v54SleepSheet{position:fixed;inset:0;z-index:2147483250;display:none}#v54CenterSheet.open,#v54StorageSheet.open,#v54SleepSheet.open{display:block}
      .v54Backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
      .v54Panel{position:absolute;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:620px;max-height:calc(100dvh - 52px);margin:auto;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--line,#e4e8f0);border-radius:28px;padding:20px;box-shadow:0 28px 80px rgba(15,23,42,.28)}
      .v54Head{display:flex;align-items:center;justify-content:space-between;gap:14px;position:sticky;top:-20px;z-index:2;margin:-20px -20px 14px;padding:20px 20px 11px;background:color-mix(in srgb,var(--surface,#fff) 94%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
      .v54Head h3{margin:0;font-size:25px;letter-spacing:-.035em}.v54Close{border:0;border-radius:50%;width:38px;height:38px;background:var(--surface2,#f2f4f8);color:var(--muted,#6b7280);font-size:20px}
      .v54Sub{margin:-4px 0 16px;color:var(--muted,#6b7280);font-size:13px;line-height:1.45}.v54List{display:grid;gap:10px}.v54Empty{padding:28px 18px;text-align:center;border:1px dashed var(--line,#dce1e9);border-radius:19px;color:var(--muted,#6b7280)}
      .v54Job{border:1px solid var(--line,#e4e8f0);border-radius:19px;padding:14px;background:var(--surface2,#f8faff)}.v54JobTop{display:flex;gap:12px;align-items:flex-start}.v54JobIcon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:var(--accentSoft,#eaf0ff);color:var(--accent,#2f6df6);font-weight:950;flex:none}.v54JobInfo{min-width:0;flex:1}.v54JobInfo strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}.v54JobInfo span{display:block;color:var(--muted,#6b7280);font-size:11px;margin-top:3px}.v54Status{font-size:10px;font-weight:900;padding:6px 8px;border-radius:999px;white-space:nowrap;background:#edf1f6;color:#687386}.v54Status.ready{background:#e7f7ef;color:#277451}.v54Status.working{background:#eaf0ff;color:#3569df}.v54Status.error{background:#fff0f0;color:#bd4242}.v54Status.paused{background:#fff6df;color:#8c691d}
      .v54JobBar{height:6px;border-radius:999px;background:var(--line,#e6e9f0);overflow:hidden;margin:12px 0 10px}.v54JobBar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent,#2f6df6),var(--accent2,#7558ff));border-radius:inherit}.v54JobActions{display:flex;gap:8px}.v54JobActions button{border:0;border-radius:11px;min-height:38px;padding:0 12px;font-size:12px;font-weight:850;background:var(--accent,#2f6df6);color:#fff;touch-action:manipulation}.v54JobActions .secondary{background:var(--surface,#fff);border:1px solid var(--line,#dfe4ed);color:var(--text,#111827)}.v54JobActions .danger{margin-left:auto;background:transparent;color:#d14343;border:1px solid color-mix(in srgb,#d14343 28%,transparent)}.v54JobActions button:disabled{opacity:.45}
      .v54StorageHero{padding:18px;border:1px solid var(--line,#e4e8f0);border-radius:20px;background:var(--surface2,#f8faff);margin-bottom:13px}.v54StorageNum{font-size:31px;font-weight:950;letter-spacing:-.04em}.v54StorageTrack{height:9px;border-radius:999px;background:var(--line,#e5e9f0);overflow:hidden;margin:12px 0 7px}.v54StorageTrack i{display:block;height:100%;background:linear-gradient(90deg,var(--accent,#2f6df6),var(--accent2,#7558ff));border-radius:inherit}.v54StorageMeta{display:flex;justify-content:space-between;color:var(--muted,#6b7280);font-size:11px;font-weight:750}.v54StorageRows{display:grid;gap:8px;margin:13px 0}.v54StorageRow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 13px;border:1px solid var(--line,#e4e8f0);border-radius:15px}.v54StorageRow span{color:var(--muted,#6b7280);font-size:12px}.v54StorageRow strong{font-size:13px}.v54Danger,.v54Secondary{width:100%;min-height:48px;border-radius:14px;font-size:14px;font-weight:900}.v54Danger{border:1px solid rgba(209,67,67,.28);background:rgba(209,67,67,.08);color:#d14343}.v54Secondary{border:1px solid var(--line,#dfe4ed);background:var(--surface2,#f8faff);color:var(--text,#111827);margin-bottom:9px}
      .v54PlayerTools{display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:8px;margin:2px auto 15px;max-width:390px}.v54PlayerTools button{border:1px solid var(--line,#dfe4ed);background:var(--surface2,#f7f8fb);color:var(--text,#111827);border-radius:13px;min-height:42px;font-size:12px;font-weight:850;touch-action:manipulation}.v54PlayerTools button:active{transform:scale(.97)}
      .v54SeekWrap{margin:12px 0 2px}.v54SeekWrap input{width:100%;accent-color:var(--accent,#2f6df6)}.v54SeekHint{font-size:10px;color:var(--muted,#6b7280);text-align:center;margin-top:2px;min-height:14px}.v54SleepChoices{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v54SleepChoices button{border:1px solid var(--line,#dfe4ed);background:var(--surface2,#f8faff);color:var(--text,#111827);border-radius:14px;min-height:49px;font-weight:850}.v54SleepChoices button:last-child{grid-column:1/-1}
      body.v54SheetOpen{overflow:hidden}body.v54SheetOpen .bottomNav{visibility:hidden!important;pointer-events:none!important}
      html[data-narrador-theme="dark"] .v54Status{background:#222c3a;color:#aeb9c9}html[data-narrador-theme="dark"] .v54Status.ready{background:#123426;color:#72d7a2}html[data-narrador-theme="dark"] .v54Status.working{background:#172a50;color:#85a8ff}html[data-narrador-theme="dark"] .v54Status.error{background:#3a1e24;color:#ff9a9a}html[data-narrador-theme="dark"] .v54Status.paused{background:#3a311a;color:#e7c875}
      @media(max-width:480px){.v54Panel{left:8px;right:8px;padding:17px}.v54Head{margin:-17px -17px 12px;padding:17px 17px 10px}.v54JobTop{gap:9px}.v54Status{font-size:9px}.v54JobActions button{padding:0 9px}}
    `;
    document.head.appendChild(style);
  }

  function ensureSheets() {
    if (!$("#v54CenterSheet")) {
      const center = document.createElement("div");
      center.id = "v54CenterSheet";
      center.innerHTML = `<div class="v54Backdrop" data-v54-close></div><div class="v54Panel" role="dialog" aria-modal="true"><div class="v54Head"><h3>Centro de audiolibros IA</h3><button class="v54Close" type="button" data-v54-close>×</button></div><p class="v54Sub">Revisa qué libros están preparando audio, cuáles están listos y cuánto espacio ocupa cada uno.</p><div id="v54JobList" class="v54List"></div></div>`;
      document.body.appendChild(center);
      center.addEventListener("click", handleCenterClick);
    }

    if (!$("#v54StorageSheet")) {
      const sheet = document.createElement("div");
      sheet.id = "v54StorageSheet";
      sheet.innerHTML = `<div class="v54Backdrop" data-v54-close></div><div class="v54Panel" role="dialog" aria-modal="true"><div class="v54Head"><h3>Almacenamiento</h3><button class="v54Close" type="button" data-v54-close>×</button></div><p class="v54Sub">Narrador guarda tus libros y el audio IA directamente en este dispositivo.</p><div id="v54StorageBody"></div></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", handleStorageClick);
    }

    if (!$("#v54SleepSheet")) {
      const sheet = document.createElement("div");
      sheet.id = "v54SleepSheet";
      sheet.innerHTML = `<div class="v54Backdrop" data-v54-close></div><div class="v54Panel" role="dialog" aria-modal="true"><div class="v54Head"><h3>Temporizador de sueño</h3><button class="v54Close" type="button" data-v54-close>×</button></div><p class="v54Sub">Narrador detendrá la reproducción automáticamente.</p><div class="v54SleepChoices"><button data-v54-sleep="10">10 min</button><button data-v54-sleep="20">20 min</button><button data-v54-sleep="30">30 min</button><button data-v54-sleep="45">45 min</button><button data-v54-sleep="60">60 min</button><button data-v54-sleep="0">Cancelar temporizador</button></div></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", handleSleepClick);
    }
  }

  function openSheet(id) {
    ensureSheets();
    document.body.classList.add("v54SheetOpen");
    $(id)?.classList.add("open");
  }

  function closeSheets() {
    $$("#v54CenterSheet,#v54StorageSheet,#v54SleepSheet").forEach(el => el.classList.remove("open"));
    document.body.classList.remove("v54SheetOpen");
    clearInterval(centerRefresh); centerRefresh = 0;
  }

  function installSettings() {
    const view = $("#settingsView");
    if (!view || $("#v54CenterRow")) return;
    const note = view.querySelector(".settingsNote");
    const label = document.createElement("div");
    label.className = "settingGroupLabel v54Group";
    label.textContent = "Audiolibros IA";
    const stack = document.createElement("div");
    stack.className = "settingsStack v54Stack";
    stack.innerHTML = `
      <button id="v54CenterRow" class="settingRow v54ActionRow" type="button"><div class="settingIcon">✦</div><div class="settingText"><strong>Centro de generación</strong><span id="v54CenterState">Revisando audiolibros…</span></div><div class="settingAction">›</div></button>
      <button id="v54StorageRow" class="settingRow v54ActionRow" type="button"><div class="settingIcon">▣</div><div class="settingText"><strong>Gestionar almacenamiento</strong><span id="v54StorageState">Calculando espacio…</span></div><div class="settingAction">›</div></button>`;
    if (note) {
      view.insertBefore(label, note);
      view.insertBefore(stack, note);
      note.textContent = "El audio IA se guarda offline en este dispositivo. Puedes revisar generaciones, reproducir libros listos y liberar espacio desde aquí.";
    } else view.append(label, stack);

    $("#v54CenterRow")?.addEventListener("click", openCenter);
    $("#v54StorageRow")?.addEventListener("click", openStorage);

    const oldStorage = $("#storageLabel")?.closest?.(".settingRow");
    if (oldStorage && !oldStorage.dataset.v54Bound) {
      oldStorage.dataset.v54Bound = "1";
      oldStorage.classList.add("v54ActionRow");
      oldStorage.setAttribute("role", "button");
      oldStorage.setAttribute("tabindex", "0");
      oldStorage.addEventListener("click", openStorage);
    }
    refreshSettingsSummary();
  }

  async function refreshSettingsSummary() {
    const [jobs, chunks] = await Promise.all([readJobs(), readChunks()]);
    const working = jobs.filter(j => j.state === "generating").length;
    const ready = jobs.filter(j => j.state === "ready").length;
    const failed = jobs.filter(j => j.state === "error" || j.state === "paused" || j.state === "stale").length;
    const state = $("#v54CenterState");
    if (state) state.textContent = working ? `${working} preparando · ${ready} listos` : failed ? `${ready} listos · ${failed} pendientes` : ready ? `${ready} audiolibro${ready === 1 ? "" : "s"} listo${ready === 1 ? "" : "s"}` : "Aún no hay audiolibros IA";
    const audioBytes = chunks.reduce((sum, row) => sum + Number(row?.blob?.size || 0), 0);
    const storage = $("#v54StorageState");
    if (storage) storage.textContent = audioBytes ? `${formatBytes(audioBytes)} en audio IA` : "Sin audio IA guardado";
  }

  async function openCenter() {
    openSheet("#v54CenterSheet");
    await renderCenter();
    clearInterval(centerRefresh);
    centerRefresh = setInterval(() => {
      if ($("#v54CenterSheet")?.classList.contains("open")) renderCenter();
    }, 2500);
  }

  async function renderCenter() {
    const list = $("#v54JobList");
    if (!list) return;
    const [books, jobs, chunks] = await Promise.all([readBooks(), readJobs(), readChunks()]);
    const bookMap = new Map(books.map(b => [String(b.id), b]));
    const sizeMap = new Map();
    chunks.forEach(row => sizeMap.set(String(row.bookId), (sizeMap.get(String(row.bookId)) || 0) + Number(row?.blob?.size || 0)));
    const ordered = [...jobs].sort((a,b) => (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0));
    if (!ordered.length) {
      list.innerHTML = `<div class="v54Empty"><strong>No hay audiolibros IA todavía.</strong><br><span>Elige IA dentro de un libro y toca “Crear audiolibro”.</span></div>`;
      await refreshSettingsSummary();
      return;
    }
    list.innerHTML = ordered.map(job => {
      const id = String(job.bookId);
      const book = bookMap.get(id);
      const state = jobState(job);
      const pct = percent(job);
      const size = sizeMap.get(id) || 0;
      const primary = job.state === "ready" ? "Reproducir" : job.state === "generating" ? "Generando…" : "Continuar";
      return `<article class="v54Job" data-v54-book="${id}"><div class="v54JobTop"><div class="v54JobIcon">✦</div><div class="v54JobInfo"><strong>${escapeHtml(book?.title || job.title || "Audiolibro")}</strong><span>${escapeHtml(currentChapter(job) || "Audiolibro IA")} · ${formatBytes(size)}</span></div><span class="v54Status ${state.cls}">${state.label}</span></div><div class="v54JobBar"><i style="width:${pct}%"></i></div><div class="v54JobActions"><button type="button" data-v54-action="primary" ${job.state === "generating" ? "disabled" : ""}>${primary}</button><button type="button" class="secondary" data-v54-action="open">Detalles</button><button type="button" class="danger" data-v54-action="delete">Borrar audio</button></div></article>`;
    }).join("");
    await refreshSettingsSummary();
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  }

  async function handleCenterClick(event) {
    if (event.target.closest?.("[data-v54-close]")) return closeSheets();
    const button = event.target.closest?.("[data-v54-action]");
    if (!button) return;
    const card = button.closest("[data-v54-book]");
    const id = card?.dataset.v54Book;
    if (!id) return;
    const books = await readBooks();
    const book = books.find(b => String(b.id) === String(id));
    const job = await getJob(id);
    const api = window.__narradorAudiobook50;
    if (!book) return toast("No pude localizar el libro.");
    const action = button.dataset.v54Action;
    if (action === "open") {
      closeSheets();
      return api?.open?.(book);
    }
    if (action === "primary") {
      closeSheets();
      if (job?.state === "ready") return api?.play?.(book);
      return api?.start?.(book, false);
    }
    if (action === "delete") {
      if (!confirm(`¿Borrar el audio IA guardado de “${book.title || "este libro"}”? El PDF permanecerá en tu biblioteca.`)) return;
      await deleteAudioForBook(id);
      toast("Audio IA eliminado. El libro sigue en tu biblioteca.");
      await renderCenter();
    }
  }

  async function storageStats() {
    const [books, chunks, jobs, estimate] = await Promise.all([
      readBooks(), readChunks(), readJobs(), navigator.storage?.estimate?.().catch?.(() => null) || Promise.resolve(null)
    ]);
    const aiBytes = chunks.reduce((sum, row) => sum + Number(row?.blob?.size || 0), 0);
    let bookBytes = 0;
    try { bookBytes = new Blob([JSON.stringify(books)]).size; } catch (_) {}
    const usage = Number(estimate?.usage || 0);
    const quota = Number(estimate?.quota || 0);
    return { books, chunks, jobs, aiBytes, bookBytes, usage, quota, other: Math.max(0, usage - aiBytes - bookBytes) };
  }

  async function openStorage() {
    openSheet("#v54StorageSheet");
    await renderStorage();
  }

  async function renderStorage() {
    const body = $("#v54StorageBody");
    if (!body) return;
    body.innerHTML = `<div class="v54Empty">Calculando almacenamiento…</div>`;
    const s = await storageStats();
    const pct = s.quota ? Math.max(0, Math.min(100, Math.round((s.usage / s.quota) * 100))) : 0;
    const persisted = await navigator.storage?.persisted?.().catch?.(() => false) || false;
    body.innerHTML = `<div class="v54StorageHero"><div class="v54StorageNum">${formatBytes(s.usage)}</div><div class="v54StorageTrack"><i style="width:${pct}%"></i></div><div class="v54StorageMeta"><span>Usado por Narrador y su caché</span><span>${s.quota ? `${formatBytes(s.quota)} disponibles` : "Cuota no disponible"}</span></div></div><div class="v54StorageRows"><div class="v54StorageRow"><span>Audio IA guardado</span><strong>${formatBytes(s.aiBytes)}</strong></div><div class="v54StorageRow"><span>Biblioteca y texto (aprox.)</span><strong>${formatBytes(s.bookBytes)}</strong></div><div class="v54StorageRow"><span>App, modelo IA y caché</span><strong>${formatBytes(s.other)}</strong></div><div class="v54StorageRow"><span>Audiolibros IA</span><strong>${s.jobs.filter(j => j.state === "ready").length} listos</strong></div></div><button id="v54PersistBtn" class="v54Secondary" type="button">${persisted ? "✓ Almacenamiento offline protegido" : "Proteger almacenamiento offline"}</button><button id="v54ClearAIBtn" class="v54Danger" type="button" ${s.aiBytes || s.jobs.length ? "" : "disabled"}>Borrar todos los audios IA</button><p class="v54Sub" style="margin:12px 2px 0">Borrar audio IA libera espacio sin eliminar tus PDFs, portadas ni progreso de lectura.</p>`;
    await refreshSettingsSummary();
  }

  async function handleStorageClick(event) {
    if (event.target.closest?.("[data-v54-close]")) return closeSheets();
    if (event.target.closest?.("#v54PersistBtn")) {
      const granted = await navigator.storage?.persist?.().catch?.(() => false);
      toast(granted ? "iPhone intentará conservar los datos offline de Narrador." : "Safari administra automáticamente el almacenamiento de esta app.");
      return renderStorage();
    }
    if (event.target.closest?.("#v54ClearAIBtn")) {
      if (!confirm("¿Borrar todos los audiolibros IA guardados en este perfil? Tus libros seguirán en la biblioteca.")) return;
      await clearAllAI();
      toast("Audios IA eliminados. Tus libros permanecen intactos.");
      await renderStorage();
    }
  }

  function installPlayerTools() {
    const player = $("#playerView .player");
    const transport = player?.querySelector(".transport");
    if (!player || !transport || $("#v54PlayerTools")) return;

    const seek = document.createElement("div");
    seek.className = "v54SeekWrap";
    seek.innerHTML = `<input id="v54BookSeek" type="range" min="0" max="100" step="1" value="0" aria-label="Posición del audiolibro"><div id="v54SeekHint" class="v54SeekHint">La búsqueda precisa está disponible con audiolibros IA preparados.</div>`;
    const progress = player.querySelector(".playerProgress");
    progress?.insertAdjacentElement("afterend", seek);

    const tools = document.createElement("div");
    tools.id = "v54PlayerTools";
    tools.className = "v54PlayerTools";
    tools.innerHTML = `<button type="button" data-v54-skip="-1">↶ 15 s</button><button id="v54SleepBtn" type="button">☾ Temporizador</button><button type="button" data-v54-skip="1">15 s ↷</button>`;
    transport.insertAdjacentElement("afterend", tools);
    tools.addEventListener("click", event => {
      const skip = event.target.closest?.("[data-v54-skip]");
      if (skip) skipPart(Number(skip.dataset.v54Skip));
      if (event.target.closest?.("#v54SleepBtn")) openSheet("#v54SleepSheet");
    });
    $("#v54BookSeek")?.addEventListener("change", event => seekAI(Number(event.target.value)));
    setInterval(syncPlayerTools, 900);
    syncPlayerTools();
  }

  async function currentPlayerBook() {
    const title = $("#playerBook")?.textContent?.trim();
    if (!title) return null;
    const books = await readBooks();
    return books.find(b => String(b.title || "").trim() === title) || null;
  }

  async function skipPart(delta) {
    const book = await currentPlayerBook();
    if (!book) return;
    if (prefs().engine !== "kokoro") {
      const legacy = delta < 0 ? $("#prevBtn") : $("#nextBtn");
      legacy?.click?.();
      return;
    }
    const job = await getJob(book.id);
    if (!job || job.state !== "ready" || !job.chapterBlockCounts?.length) {
      toast("Prepara primero el audiolibro IA para usar saltos rápidos.");
      return;
    }
    let chapter = Math.max(0, Math.min(Number(job.playChapter || 0), job.chapterBlockCounts.length - 1));
    let block = Math.max(0, Number(job.playBlock || 0));
    if (delta > 0) {
      if (block + 1 < (job.chapterBlockCounts[chapter] || 1)) block++;
      else if (chapter + 1 < job.chapterBlockCounts.length) { chapter++; block = 0; }
    } else {
      if (block > 0) block--;
      else if (chapter > 0) { chapter--; block = Math.max(0, (job.chapterBlockCounts[chapter] || 1) - 1); }
    }
    job.playChapter = chapter; job.playBlock = block; job.lastPlayedAt = Date.now();
    book.lastChapter = chapter; book.lastPlayedAt = Date.now();
    await Promise.allSettled([putJob(job), putBook(book)]);
    try { window.__narradorAudiobook50?.stop?.(false); } catch (_) {}
    window.__narradorUnlockAudio?.();
    await window.__narradorAudiobook50?.play?.(book);
    syncPlayerTools();
  }

  function absoluteBlock(job) {
    let value = 0;
    for (let i = 0; i < Math.max(0, Number(job?.playChapter || 0)); i++) value += job.chapterBlockCounts?.[i] || 0;
    return value + Math.max(0, Number(job?.playBlock || 0));
  }

  async function seekAI(targetPct) {
    const book = await currentPlayerBook();
    if (!book || prefs().engine !== "kokoro") return syncPlayerTools();
    const job = await getJob(book.id);
    if (!job || job.state !== "ready" || !job.totalBlocks || !job.chapterBlockCounts?.length) return syncPlayerTools();
    const target = Math.max(0, Math.min(job.totalBlocks - 1, Math.round((Math.max(0, Math.min(100, targetPct)) / 100) * (job.totalBlocks - 1))));
    let cursor = 0, chapter = 0, block = 0;
    for (let i = 0; i < job.chapterBlockCounts.length; i++) {
      const count = job.chapterBlockCounts[i] || 0;
      if (target < cursor + count) { chapter = i; block = Math.max(0, target - cursor); break; }
      cursor += count;
    }
    job.playChapter = chapter; job.playBlock = block; job.lastPlayedAt = Date.now();
    book.lastChapter = chapter; book.lastPlayedAt = Date.now();
    await Promise.allSettled([putJob(job), putBook(book)]);
    try { window.__narradorAudiobook50?.stop?.(false); } catch (_) {}
    window.__narradorUnlockAudio?.();
    await window.__narradorAudiobook50?.play?.(book);
    toast(`Saltaste al ${Math.round(targetPct)}% del audiolibro.`);
  }

  async function syncPlayerTools() {
    const slider = $("#v54BookSeek");
    const hint = $("#v54SeekHint");
    if (!slider || !hint) return;
    const book = await currentPlayerBook();
    if (!book || prefs().engine !== "kokoro") {
      slider.disabled = true;
      const pct = Number(String($("#speechPercent")?.textContent || "0").replace("%", "")) || 0;
      slider.value = String(pct);
      hint.textContent = "Con voz de iPhone, los botones de salto avanzan por fragmentos.";
      return;
    }
    const job = await getJob(book.id);
    if (!job || job.state !== "ready" || !job.totalBlocks) {
      slider.disabled = true;
      slider.value = "0";
      hint.textContent = "Prepara el audiolibro IA para activar la búsqueda precisa.";
      return;
    }
    slider.disabled = false;
    const pct = Math.round((absoluteBlock(job) / Math.max(1, job.totalBlocks - 1)) * 100);
    if (document.activeElement !== slider) slider.value = String(Math.max(0, Math.min(100, pct)));
    hint.textContent = `Audiolibro IA · ${Math.max(0, Math.min(100, pct))}%`;
  }

  function stopAllPlayback() {
    try { window.__narradorAudiobook50?.stop?.(); } catch (_) {}
    try { window.__narradorSpeech49?.stop?.(); } catch (_) {}
    try { speechSynthesis.cancel(); } catch (_) {}
    const play = $("#playBtn");
    if (play) play.textContent = "▶";
  }

  function setSleepTimer(minutes) {
    clearTimeout(sleepTimeout); clearInterval(sleepTicker);
    sleepTimeout = 0; sleepTicker = 0; sleepEndsAt = 0;
    if (!minutes) {
      updateSleepButton();
      toast("Temporizador cancelado.");
      return;
    }
    sleepEndsAt = Date.now() + minutes * 60 * 1000;
    sleepTimeout = setTimeout(() => {
      stopAllPlayback();
      sleepEndsAt = 0;
      clearInterval(sleepTicker);
      updateSleepButton();
      toast("Temporizador terminado. Reproducción detenida.", 4200);
    }, minutes * 60 * 1000);
    sleepTicker = setInterval(updateSleepButton, 30000);
    updateSleepButton();
    toast(`Temporizador activado por ${minutes} minutos.`);
  }

  function updateSleepButton() {
    const button = $("#v54SleepBtn");
    if (!button) return;
    if (!sleepEndsAt) { button.textContent = "☾ Temporizador"; return; }
    const mins = Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000));
    button.textContent = `☾ ${mins} min`;
  }

  function handleSleepClick(event) {
    if (event.target.closest?.("[data-v54-close]")) return closeSheets();
    const button = event.target.closest?.("[data-v54-sleep]");
    if (!button) return;
    const minutes = Number(button.dataset.v54Sleep || 0);
    setSleepTimer(minutes);
    closeSheets();
  }

  function installMediaHandlers() {
    if (!("mediaSession" in navigator) || navigator.mediaSession.__v54Installed) return;
    try {
      navigator.mediaSession.setActionHandler("seekbackward", () => skipPart(-1));
      navigator.mediaSession.setActionHandler("seekforward", () => skipPart(1));
      navigator.mediaSession.__v54Installed = true;
    } catch (_) {}
  }

  async function install() {
    if (installing) return;
    installing = true;
    try {
      installStyle();
      ensureSheets();
      installSettings();
      installPlayerTools();
      installMediaHandlers();
      await refreshSettingsSummary();
    } finally { installing = false; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.addEventListener("pageshow", () => setTimeout(install, 80));
  window.addEventListener("narrador:boot-ready", () => setTimeout(install, 80));
  window.addEventListener("narrador:auth-ready", () => setTimeout(install, 100));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(() => { refreshSettingsSummary(); syncPlayerTools(); }, 300); });

  window.__narradorExperience54 = { openCenter, openStorage, refresh: refreshSettingsSummary, stop: stopAllPlayback };
})();