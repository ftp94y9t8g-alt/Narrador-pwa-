// Narrador v61 — unified playback UX. Keeps the stable v49/v50 playback engines intact and proxies them.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  let books = [];
  let current = null;
  let refreshing = false;
  let tick = 0;
  let decorating = false;

  const supported = new Set(["es","en","fr","pt","it","de"]);
  const locale = (() => {
    const html = document.documentElement.dataset.narradorLocale;
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  })();

  const D = {
    read:{es:"Leer",en:"Read",fr:"Lire",pt:"Ler",it:"Leggi",de:"Lesen"},
    continue:{es:"Continuar escuchando",en:"Continue listening",fr:"Continuer l’écoute",pt:"Continuar ouvindo",it:"Continua ad ascoltare",de:"Weiterhören"},
    nowPlaying:{es:"Reproduciendo",en:"Now Playing",fr:"Lecture en cours",pt:"Reproduzindo",it:"In riproduzione",de:"Wiedergabe"},
    speed:{es:"Velocidad",en:"Speed",fr:"Vitesse",pt:"Velocidade",it:"Velocità",de:"Tempo"},
    chapters:{es:"Capítulos",en:"Chapters",fr:"Chapitres",pt:"Capítulos",it:"Capitoli",de:"Kapitel"},
    upNext:{es:"Siguiente",en:"Up Next",fr:"À suivre",pt:"A seguir",it:"Prossimi",de:"Als Nächstes"},
    sleep:{es:"Dormir",en:"Sleep",fr:"Minuterie",pt:"Dormir",it:"Timer",de:"Schlaf"},
    bookmark:{es:"Marcador",en:"Bookmark",fr:"Signet",pt:"Marcador",it:"Segnalibro",de:"Lesezeichen"},
    bookmarks:{es:"Marcadores",en:"Bookmarks",fr:"Signets",pt:"Marcadores",it:"Segnalibri",de:"Lesezeichen"},
    narration:{es:"Narración",en:"Narration",fr:"Narration",pt:"Narração",it:"Narrazione",de:"Erzählung"},
    narrationPrefs:{es:"Voz, idioma y velocidad",en:"Voice, language and speed",fr:"Voix, langue et vitesse",pt:"Voz, idioma e velocidade",it:"Voce, lingua e velocità",de:"Stimme, Sprache und Tempo"},
    listen:{es:"Escuchar",en:"Listen",fr:"Écouter",pt:"Ouvir",it:"Ascolta",de:"Anhören"},
    close:{es:"Cerrar",en:"Close",fr:"Fermer",pt:"Fechar",it:"Chiudi",de:"Schließen"},
    textOptions:{es:"Apariencia del texto",en:"Text appearance",fr:"Apparence du texte",pt:"Aparência do texto",it:"Aspetto del testo",de:"Textdarstellung"},
    smaller:{es:"Texto más pequeño",en:"Smaller text",fr:"Texte plus petit",pt:"Texto menor",it:"Testo più piccolo",de:"Kleinerer Text"},
    larger:{es:"Texto más grande",en:"Larger text",fr:"Texte plus grand",pt:"Texto maior",it:"Testo più grande",de:"Größerer Text"},
    theme:{es:"Cambiar tema",en:"Change theme",fr:"Changer le thème",pt:"Mudar tema",it:"Cambia tema",de:"Thema wechseln"},
    readerMore:{es:"Más opciones",en:"More options",fr:"Plus d’options",pt:"Mais opções",it:"Altre opzioni",de:"Weitere Optionen"},
    saveBookmark:{es:"Guardar marcador",en:"Save bookmark",fr:"Enregistrer un signet",pt:"Salvar marcador",it:"Salva segnalibro",de:"Lesezeichen speichern"},
    authorUnknown:{es:"Autor no especificado",en:"Author not specified",fr:"Auteur non spécifié",pt:"Autor não especificado",it:"Autore non specificato",de:"Autor nicht angegeben"},
    back:{es:"Volver",en:"Back",fr:"Retour",pt:"Voltar",it:"Indietro",de:"Zurück"},
    sample:{es:"Escuchar muestra",en:"Play sample",fr:"Écouter un extrait",pt:"Ouvir amostra",it:"Ascolta esempio",de:"Hörprobe"},
    sleepTimer:{es:"Temporizador",en:"Sleep timer",fr:"Minuterie",pt:"Temporizador",it:"Timer di spegnimento",de:"Schlaftimer"},
    cancel:{es:"Cancelar",en:"Cancel",fr:"Annuler",pt:"Cancelar",it:"Annulla",de:"Abbrechen"},
    endChapter:{es:"Al terminar este capítulo",en:"At end of this chapter",fr:"À la fin de ce chapitre",pt:"Ao terminar este capítulo",it:"Alla fine di questo capitolo",de:"Am Ende dieses Kapitels"},
    currentChapter:{es:"Capítulo actual",en:"Current chapter",fr:"Chapitre actuel",pt:"Capítulo atual",it:"Capitolo attuale",de:"Aktuelles Kapitel"},
    goChapter:{es:"Ir a este capítulo",en:"Go to this chapter",fr:"Aller à ce chapitre",pt:"Ir para este capítulo",it:"Vai a questo capitolo",de:"Zu diesem Kapitel"},
    readingForYou:{es:"Narrador está leyendo para ti",en:"Narrador is reading for you",fr:"Narrador lit pour vous",pt:"Narrador está lendo para você",it:"Narrador sta leggendo per te",de:"Narrador liest für dich"}
  };
  const t = (key) => D[key]?.[locale] || D[key]?.en || key;

  function esc(s="") { return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
  function unknownAuthor(value) {
    const s = String(value || "").trim();
    return !s || /^(?:autor no especificado|author not specified|unknown)$/i.test(s) ? t("authorUnknown") : s;
  }
  function initials(title="Narrador") { return String(title).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("") || "NV"; }

  function svg(name, cls="n61Svg") {
    const common = `class="${cls}" viewBox="0 0 24 24" aria-hidden="true"`;
    const p = {
      play:`<svg ${common}><path fill="currentColor" stroke="none" d="M8 5.2v13.6c0 .9 1 1.4 1.8.9l10-6.8a1.1 1.1 0 0 0 0-1.8l-10-6.8C9 3.8 8 4.3 8 5.2Z"/></svg>`,
      pause:`<svg ${common}><path fill="currentColor" stroke="none" d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>`,
      home:`<svg ${common}><path d="M3.5 10.5 12 3.7l8.5 6.8v9.2a.8.8 0 0 1-.8.8h-5.2v-6h-5v6H4.3a.8.8 0 0 1-.8-.8z"/></svg>`,
      library:`<svg ${common}><path d="M4 4.5h4v15H4zM10 4.5h4v15h-4zM16 4.5h4v15h-4z"/></svg>`,
      history:`<svg ${common}><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8L3.8 8.6"/><path d="M3.8 4.8v3.8h3.8M12 7.6V12l3 1.8"/></svg>`,
      settings:`<svg ${common}><circle cx="12" cy="12" r="3"/><path d="M19 13.7a7.6 7.6 0 0 0 0-3.4l2-1.5-2-3.4-2.5 1a8.2 8.2 0 0 0-3-1.7L13.2 2H9.3L9 4.7a8.2 8.2 0 0 0-3 1.7l-2.5-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3.4l-2 1.5 2 3.4 2.5-1a8.2 8.2 0 0 0 3 1.7l.3 2.7h3.9l.3-2.7a8.2 8.2 0 0 0 3-1.7l2.5 1 2-3.4z"/></svg>`,
      x:`<svg ${common}><path d="m7 7 10 10M17 7 7 17"/></svg>`,
      rewind:`<svg ${common}><path d="M4 8V4l-3 3 3 3V8a8 8 0 1 1-1 4"/><path d="M9 10h2v5M14 10h2v5"/></svg>`,
      forward:`<svg ${common}><path d="M20 8V4l3 3-3 3V8a8 8 0 1 0 1 4"/><path d="M8 10h2v5M13 10h2v5"/></svg>`,
      gauge:`<svg ${common}><path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 12 4-3M7 17h10"/></svg>`,
      list:`<svg ${common}><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/></svg>`,
      moon:`<svg ${common}><path d="M20 15.2A8 8 0 0 1 8.8 4a8 8 0 1 0 11.2 11.2Z"/></svg>`,
      star:`<svg ${common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
      headphones:`<svg ${common}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z"/></svg>`,
      book:`<svg ${common}><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 17h10M8 4v13"/></svg>`,
      grid:`<svg ${common}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>`,
      mic:`<svg ${common}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M9 21h6"/></svg>`,
      globe:`<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3z"/></svg>`,
      sparkle:`<svg ${common}><path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3zM18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z"/></svg>`,
      bell:`<svg ${common}><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 20h4"/></svg>`,
      database:`<svg ${common}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`,
      info:`<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>`
    };
    return p[name] || p.info;
  }

  function readBooks() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME); } catch (_) { resolve([]); return; }
      req.onerror = () => resolve([]);
      req.onblocked = () => resolve([]);
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} resolve([]); };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { try { db.close(); } catch (_) {} resolve([]); return; }
        const r = db.transaction(STORE,"readonly").objectStore(STORE).getAll();
        r.onerror = () => { try { db.close(); } catch (_) {} resolve([]); };
        r.onsuccess = () => { const rows = Array.isArray(r.result) ? r.result : []; try { db.close(); } catch (_) {} resolve(rows); };
      };
    });
  }

  function pickCurrent() {
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) {
      const b = books.find(x => String(x.id) === String(id));
      if (b) return b;
    }
    return [...books].sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0))[0] || null;
  }

  async function refreshBooks() {
    if (refreshing) return;
    refreshing = true;
    try { books = await readBooks(); current = pickCurrent(); }
    finally { refreshing = false; }
  }

  function setCover(el, book) {
    if (!el || !book) return;
    if (book.coverDataUrl) {
      el.style.backgroundImage = `url("${String(book.coverDataUrl).replace(/"/g,"%22")}")`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = initials(book.title);
    }
  }

  function progressState(book) {
    const total = Math.max(1, book?.chapters?.length || 1);
    const chapter = Math.max(0, Math.min(Number(book?.lastChapter || 0), total - 1));
    let pct = Math.round((chapter / Math.max(1,total - 1)) * 100);
    const host = $("#homeFeatured");
    if (String(host?.dataset.bookId || "") === String(book?.id || "")) {
      const raw = parseFloat(host.querySelector(".v18Progress i")?.style.width || "");
      if (Number.isFinite(raw)) pct = Math.max(0,Math.min(100,raw));
    }
    const times = $$("#homeFeatured .v18Times span").map(x=>x.textContent?.trim()).filter(Boolean);
    return {chapter,pct,left:times[0]||"",right:times[1]||""};
  }

  function isPlaying() {
    const b = $("#homeFeatured .homePlayerPlay");
    const text = b?.textContent?.trim() || "";
    return !!(speechSynthesis?.speaking && !speechSynthesis?.paused) || (!!text && text !== "▶" && text !== "▷");
  }

  function proxy(selector, {closeNow=false}={}) {
    const target = $(selector);
    if (closeNow) closeNowPlaying();
    if (target) {
      try { window.__narradorUnlockAudio?.(); } catch (_) {}
      target.click();
      return true;
    }
    try { window.__narradorRefreshHome47?.(); } catch (_) {}
    setTimeout(() => {
      const retry = $(selector);
      if (retry) { try { window.__narradorUnlockAudio?.(); } catch (_) {} retry.click(); }
    }, 120);
    return false;
  }

  function ensureMini() {
    if ($("#n61MiniPlayer")) return;
    const el = document.createElement("div");
    el.id = "n61MiniPlayer";
    el.innerHTML = `<button class="n61MiniTap" type="button" aria-label="${esc(t("nowPlaying"))}"></button><div class="n61MiniCover"></div><div class="n61MiniText"><div class="n61MiniTitle"></div><div class="n61MiniMeta"></div></div><button class="n61MiniPlay" type="button" aria-label="Play">${svg("play")}</button><div class="n61MiniProgress"><i></i></div>`;
    const nav = $(".bottomNav");
    nav?.parentNode?.insertBefore(el, nav);
    el.querySelector(".n61MiniTap").onclick = openNowPlaying;
    el.querySelector(".n61MiniPlay").onclick = (e) => { e.stopPropagation(); proxy("#homeFeatured .homePlayerPlay"); setTimeout(renderPlaybackUI,90); };
  }

  function ensureNowPlaying() {
    if ($("#n61NowPlaying")) return;
    const root = document.createElement("div");
    root.id = "n61NowPlaying";
    root.innerHTML = `<div class="n61NowBackdrop"></div><section class="n61NowPanel" role="dialog" aria-modal="true" aria-label="${esc(t("nowPlaying"))}"><div class="n61NowHandle"></div><div class="n61NowTop"><strong>${esc(t("nowPlaying"))}</strong><button class="n61NowClose" type="button" aria-label="${esc(t("close"))}">${svg("x")}</button></div><div class="n61NowCover"></div><h2 class="n61NowTitle"></h2><div class="n61NowAuthor"></div><div class="n61NowChapter"></div><div class="n61NowProgress"><i></i></div><div class="n61NowTimes"><span></span><span></span></div><div class="n61NowTransport"><button class="n61Skip n61Back15" type="button" aria-label="-15">${svg("rewind")}<span>15 s</span></button><button class="n61NowMainPlay" type="button" aria-label="Play">${svg("play")}</button><button class="n61Skip n61Forward15" type="button" aria-label="+15">${svg("forward")}<span>15 s</span></button></div><div class="n61NowActions"><button class="n61NowAction" data-n61-action="speed" type="button">${svg("gauge")}<span>${esc(t("speed"))}</span></button><button class="n61NowAction" data-n61-action="chapters" type="button">${svg("list")}<span>${esc(t("chapters"))}</span></button><button class="n61NowAction" data-n61-action="sleep" type="button">${svg("moon")}<span>${esc(t("sleep"))}</span></button><button class="n61NowAction" data-n61-action="bookmark" type="button">${svg("star")}<span>${esc(t("bookmark"))}</span></button></div></section>`;
    document.body.appendChild(root);
    root.querySelector(".n61NowBackdrop").onclick = closeNowPlaying;
    root.querySelector(".n61NowClose").onclick = closeNowPlaying;
    root.querySelector(".n61NowMainPlay").onclick = () => { proxy("#homeFeatured .homePlayerPlay"); setTimeout(renderPlaybackUI,90); };
    root.querySelector(".n61Back15").onclick = () => proxy('[data-home-skip55="-1"]');
    root.querySelector(".n61Forward15").onclick = () => proxy('[data-home-skip55="1"]');
    root.querySelector('[data-n61-action="speed"]').onclick = () => proxy('[data-v19-home="speed"]',{closeNow:true});
    root.querySelector('[data-n61-action="chapters"]').onclick = () => proxy('[data-home-chapters56]',{closeNow:true});
    root.querySelector('[data-n61-action="sleep"]').onclick = () => proxy('[data-home-sleep56]',{closeNow:true});
    root.querySelector('[data-n61-action="bookmark"]').onclick = () => proxy('[data-home-bookmark56]');
  }

  function openNowPlaying() { if (!current) return; ensureNowPlaying(); renderPlaybackUI(); $("#n61NowPlaying")?.classList.add("open"); }
  function closeNowPlaying() { $("#n61NowPlaying")?.classList.remove("open"); }

  function mainTabActive() {
    const active = $(".view.active")?.id || "";
    return ["homeView","libraryView","historyView","settingsView"].includes(active) || ["home","library","history","settings"].includes(document.body?.dataset.mainTab || "");
  }

  function renderPlaybackUI() {
    ensureMini();
    ensureNowPlaying();
    const book = current || pickCurrent();
    const show = !!book && mainTabActive();
    document.body.classList.toggle("n61HasMini", show);
    if (!book) return;
    const p = progressState(book);
    const chapterTitle = book.chapters?.[p.chapter]?.title || `${t("chapters")} ${p.chapter+1}`;
    const author = unknownAuthor(book.author);
    const playing = isPlaying();
    const mini = $("#n61MiniPlayer");
    if (mini) {
      setCover(mini.querySelector(".n61MiniCover"),book);
      mini.querySelector(".n61MiniTitle").textContent = book.title || "Narrador";
      mini.querySelector(".n61MiniMeta").textContent = chapterTitle;
      mini.querySelector(".n61MiniProgress i").style.width = `${p.pct}%`;
      mini.querySelector(".n61MiniPlay").innerHTML = svg(playing?"pause":"play");
    }
    const now = $("#n61NowPlaying");
    if (now) {
      setCover(now.querySelector(".n61NowCover"),book);
      now.querySelector(".n61NowTitle").textContent = book.title || "Narrador";
      now.querySelector(".n61NowAuthor").textContent = author;
      now.querySelector(".n61NowChapter").textContent = `${p.chapter+1}. ${chapterTitle}`;
      now.querySelector(".n61NowProgress i").style.width = `${p.pct}%`;
      const timeSpans = now.querySelectorAll(".n61NowTimes span");
      if (timeSpans[0]) timeSpans[0].textContent = p.left || `${Math.round(p.pct)}%`;
      if (timeSpans[1]) timeSpans[1].textContent = p.right || "100%";
      now.querySelector(".n61NowMainPlay").innerHTML = svg(playing?"pause":"play");
    }
    updateMediaSession(book,p,chapterTitle,author);
  }

  function decorateHome() {
    const host = $("#homeFeatured");
    if (!host) return;
    const open = host.querySelector(".v18Open");
    if (!open) return;
    if (!host.querySelector(".n61HeroActions")) {
      const wrap = document.createElement("div");
      wrap.className = "n61HeroActions";
      open.parentNode.insertBefore(wrap,open);
      wrap.appendChild(open);
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "n61HeroListen";
      listen.innerHTML = `${svg("play")}<span>${esc(t("continue"))}</span>`;
      listen.onclick = openNowPlaying;
      wrap.appendChild(listen);
    }
    open.innerHTML = `${svg("book")}<span>${esc(t("read"))}</span>`;
    open.setAttribute("aria-label",t("read"));
  }

  function ensureNarrationModal() {
    if ($("#n61NarrationModal")) return;
    const card = $("#bookView .settingsCard");
    if (!card) return;
    const root = document.createElement("div");
    root.id = "n61NarrationModal";
    root.innerHTML = `<div class="n61NarrationBackdrop"></div><div class="n61NarrationPanel"><div class="n61NarrationHead"><strong>${esc(t("narration"))}</strong><button class="n61NarrationClose" type="button" aria-label="${esc(t("close"))}">${svg("x")}</button></div></div>`;
    document.body.appendChild(root);
    root.querySelector(".n61NarrationPanel").appendChild(card);
    root.querySelector(".n61NarrationBackdrop").onclick = closeNarration;
    root.querySelector(".n61NarrationClose").onclick = closeNarration;
  }
  function openNarration() { ensureNarrationModal(); updateNarrationSummary(); $("#n61NarrationModal")?.classList.add("open"); }
  function closeNarration() { $("#n61NarrationModal")?.classList.remove("open"); }

  function updateNarrationSummary() {
    const row = $("#n61NarrationSummary");
    if (!row) return;
    const engine = $("#engineSelect")?.selectedOptions?.[0]?.textContent?.trim() || "iPhone";
    const voice = $("#voiceSelect")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const speed = $("#speedLabel")?.textContent?.trim() || "";
    const language = $("#languageSelect")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const parts = [engine,voice || language,speed].filter(Boolean).slice(0,3);
    row.querySelector(".n61SummaryText span").textContent = parts.join(" · ") || t("narrationPrefs");
  }

  function decorateBook() {
    const view = $("#bookView");
    const header = view?.querySelector(".bookHeader");
    if (!view || !header) return;
    ensureNarrationModal();
    if (!$("#n61NarrationSummary")) {
      const summary = document.createElement("button");
      summary.id = "n61NarrationSummary";
      summary.type = "button";
      summary.innerHTML = `<span class="n61SummaryIcon">${svg("headphones")}</span><span class="n61SummaryText"><strong>${esc(t("narration"))}</strong><span>${esc(t("narrationPrefs"))}</span></span><span class="n61SummaryChevron">›</span>`;
      summary.onclick = openNarration;
      header.insertAdjacentElement("afterend",summary);
    }
    const read = $("#readBookBtn");
    if (read && !read.closest(".n61BookActions")) {
      const actions = document.createElement("div");
      actions.className = "n61BookActions";
      read.parentNode.insertBefore(actions,read);
      actions.appendChild(read);
      const listen = document.createElement("button");
      listen.id = "n61BookListen";
      listen.className = "n61BookListen";
      listen.type = "button";
      listen.innerHTML = `${svg("play")}<span>${esc(t("listen"))}</span>`;
      listen.onclick = () => {
        const title = $("#bookTitle")?.textContent?.trim();
        const book = books.find(b=>String(b.title||"").trim()===title);
        const idx = Math.max(0,Math.min(Number(book?.lastChapter||0), Math.max(0,$$("#chapters .chapterRow").length-1)));
        const row = $$("#chapters .chapterRow")[idx] || $("#chapters .chapterRow");
        row?.click();
      };
      actions.appendChild(listen);
    }
    if (read) read.innerHTML = `${svg("book")}<span>${esc(t("read"))}</span>`;
    updateNarrationSummary();
  }

  function ensureReaderSheet() {
    if ($("#n61ReaderSheet")) return;
    const root = document.createElement("div");
    root.id = "n61ReaderSheet";
    root.innerHTML = `<div class="n61ReaderBackdrop"></div><div class="n61ReaderPanel"><div class="n61ReaderHandle"></div><div class="n61ReaderHead"><h3>${esc(t("textOptions"))}</h3><button class="n61ReaderClose" type="button">×</button></div><div class="n61ReaderOptions"><button type="button" data-reader61="smaller">A− · ${esc(t("smaller"))}</button><button type="button" data-reader61="larger">A+ · ${esc(t("larger"))}</button><button class="wide" type="button" data-reader61="theme">◐ · ${esc(t("theme"))}</button><button class="wide" type="button" data-reader61="bookmark">☆ · ${esc(t("saveBookmark"))}</button></div></div>`;
    document.body.appendChild(root);
    const close = () => root.classList.remove("open");
    root.querySelector(".n61ReaderBackdrop").onclick = close;
    root.querySelector(".n61ReaderClose").onclick = close;
    root.querySelector('[data-reader61="smaller"]').onclick = () => $("#readerFontDown")?.click();
    root.querySelector('[data-reader61="larger"]').onclick = () => $("#readerFontUp")?.click();
    root.querySelector('[data-reader61="theme"]').onclick = () => $("#readerTheme")?.click();
    root.querySelector('[data-reader61="bookmark"]').onclick = () => { $("#readerBookmark56")?.click(); close(); };
  }

  function decorateReader() {
    const toolbar = $("#readerView .readerToolbar");
    if (!toolbar) return;
    ensureReaderSheet();
    if (!$("#n61ReaderAa")) {
      const aa = document.createElement("button");
      aa.id = "n61ReaderAa"; aa.type = "button"; aa.className = "n61ReaderUtility"; aa.textContent = "Aa"; aa.setAttribute("aria-label",t("textOptions"));
      aa.onclick = () => $("#n61ReaderSheet")?.classList.add("open");
      toolbar.insertBefore(aa,$("#readerListen"));
    }
    if (!$("#n61ReaderMore")) {
      const more = document.createElement("button");
      more.id = "n61ReaderMore"; more.type = "button"; more.className = "n61ReaderUtility more"; more.textContent = "…"; more.setAttribute("aria-label",t("readerMore"));
      more.onclick = () => $("#n61ReaderSheet")?.classList.add("open");
      toolbar.insertBefore(more,$("#readerListen"));
    }
    const back = $("#readerBack"); if (back) back.textContent = `‹ ${t("back")}`;
    const listen = $("#readerListen"); if (listen && !/Escuchando|Listening|Lecture/i.test(listen.textContent||"")) listen.textContent = `▶ ${t("listen")}`;
  }

  function decorateChapterSheet() {
    const root = $("#dailySheet56.open");
    if (!root) return;
    const title = $("#daily56Title")?.textContent?.trim() || "";
    const chapterWords = ["Capítulos","Chapters","Chapitres","Capitoli","Kapitel"];
    if (!chapterWords.some(x=>title.toLowerCase().includes(x.toLowerCase()))) return;
    const body = $("#daily56Body");
    if (!body || $(".n61ChapterTabs",root)) return;
    const tabs = document.createElement("div");
    tabs.className = "n61ChapterTabs";
    tabs.innerHTML = `<button class="active" type="button" data-tab61="all">${esc(t("chapters"))}</button><button type="button" data-tab61="next">${esc(t("upNext"))}</button>`;
    body.parentNode.insertBefore(tabs,body);
    const apply = mode => {
      $$(".n61ChapterTabs button",root).forEach(b=>b.classList.toggle("active",b.dataset.tab61===mode));
      const items = $$("[data-chapter56]",body);
      const active = items.findIndex(b=>b.classList.contains("active"));
      items.forEach((b,i)=>{ const row=b.closest(".daily56Item")||b; row.style.display = mode==="next" && i<=Math.max(-1,active) ? "none" : ""; });
    };
    tabs.onclick = e => { const b=e.target.closest("[data-tab61]"); if (b) apply(b.dataset.tab61); };
  }

  function translateExisting() {
    const open = $("#homeFeatured .v18Open"); if (open) open.innerHTML = `${svg("book")}<span>${esc(t("read"))}</span>`;
    const read = $("#readBookBtn"); if (read) read.innerHTML = `${svg("book")}<span>${esc(t("read"))}</span>`;
    const sample = $("#previewBtn"); if (sample) sample.textContent = `▶ ${t("sample")}`;
    const rb = $("#readerBack"); if (rb) rb.textContent = `‹ ${t("back")}`;
    const guide = $("#homeFeatured .v18Guide"); if (guide) guide.textContent = t("readingForYou");
    const mark = $("[data-home-bookmark56]"); if (mark) mark.textContent = `☆ ${t("bookmark")}`;
    const sleep = $("[data-home-sleep56]"); if (sleep && !/\d+\s*min/i.test(sleep.textContent||"")) sleep.textContent = `☾ ${t("sleep")}`;
    const dailyTitle = $("#daily56Title");
    if (dailyTitle) {
      const raw = dailyTitle.textContent?.trim() || "";
      if (/cap[ií]tulos|chapters|chapitres|capitoli|kapitel/i.test(raw)) dailyTitle.textContent = t("chapters");
      else if (/temporizador|sleep timer|minuterie|schlaftimer/i.test(raw)) dailyTitle.textContent = t("sleepTimer");
      else if (/marcadores|bookmarks|signets|segnalibri|lesezeichen/i.test(raw)) dailyTitle.textContent = t("bookmarks");
    }
    const cancel = $('[data-sleep56="0"]'); if (cancel) cancel.textContent = t("cancel");
    const end = $("[data-sleepchapter56]"); if (end) end.textContent = `☾ ${t("endChapter")}`;
    $$("[data-chapter56] .grow56 span").forEach(el=>{
      if (/cap[ií]tulo actual|current chapter|chapitre actuel|capitolo attuale|aktuelles kapitel/i.test(el.textContent||"")) el.textContent=t("currentChapter");
      else if (/ir a este cap[ií]tulo|go to this chapter|aller à ce chapitre|vai a questo capitolo|zu diesem kapitel/i.test(el.textContent||"")) el.textContent=t("goChapter");
    });
  }

  function unifyIcons() {
    const map = {home:"home",library:"library",history:"history",settings:"settings"};
    $$(".bottomNav .navItem").forEach(btn=>{ const icon=btn.querySelector(".navIcon"); const name=map[btn.dataset.tab]; if(icon&&name&&icon.dataset.n61!=="1"){ icon.innerHTML=svg(name); icon.dataset.n61="1"; }});
    const settingIcons = ["mic","globe","sparkle","gauge","bell","database","info"];
    $$("#settingsView .settingIcon").forEach((el,i)=>{ if(el.dataset.n61==="1")return; el.innerHTML=svg(settingIcons[i]||"info"); el.dataset.n61="1"; });
    const g=$("#gridViewBtn"), l=$("#listViewBtn"); if(g&&g.dataset.n61!=="1"){g.innerHTML=svg("grid");g.dataset.n61="1";} if(l&&l.dataset.n61!=="1"){l.innerHTML=svg("list");l.dataset.n61="1";}
  }

  function updateMediaSession(book,p,chapterTitle,author) {
    if (!("mediaSession" in navigator) || !book) return;
    try {
      if (window.MediaMetadata) {
        const data = {title:book.title||"Narrador",artist:author,album:chapterTitle};
        if (book.coverDataUrl) data.artwork=[{src:book.coverDataUrl,sizes:"512x512",type:"image/jpeg"}];
        navigator.mediaSession.metadata = new MediaMetadata(data);
      }
      if (navigator.mediaSession.setPositionState) navigator.mediaSession.setPositionState({duration:100,playbackRate:1,position:Math.max(.01,Math.min(99.99,Number(p.pct||0)))});
    } catch (_) {}
  }

  function installMediaHandlers() {
    if (!("mediaSession" in navigator) || navigator.mediaSession.__n61) return;
    const handlers = {
      play:()=>proxy("#homeFeatured .homePlayerPlay"),
      pause:()=>proxy("#homeFeatured .homePlayerPlay"),
      seekbackward:()=>proxy('[data-home-skip55="-1"]'),
      seekforward:()=>proxy('[data-home-skip55="1"]'),
      previoustrack:()=>proxy('[data-v19-home="prev"]'),
      nexttrack:()=>proxy('[data-v19-home="next"]')
    };
    Object.entries(handlers).forEach(([k,fn])=>{ try{navigator.mediaSession.setActionHandler(k,fn);}catch(_){}});
    try { navigator.mediaSession.__n61=true; } catch (_) {}
  }

  function decorateAll() {
    if (decorating) return;
    decorating = true;
    try {
      decorateHome();
      decorateBook();
      decorateReader();
      decorateChapterSheet();
      translateExisting();
      unifyIcons();
      renderPlaybackUI();
    } finally { decorating = false; }
  }

  async function refreshAndDecorate() { await refreshBooks(); decorateAll(); }

  function install() {
    ensureMini(); ensureNowPlaying(); ensureReaderSheet(); ensureNarrationModal(); installMediaHandlers();
    refreshAndDecorate();
    const host = $("#homeFeatured");
    if (host) new MutationObserver(()=>setTimeout(decorateAll,0)).observe(host,{childList:true});
    new MutationObserver(()=>setTimeout(decorateAll,0)).observe(document.body,{childList:true,subtree:true});
    document.addEventListener("change",e=>{ if(e.target?.matches?.("#engineSelect,#voiceSelect,#languageSelect,#speedRange")) setTimeout(updateNarrationSummary,0); });
    document.addEventListener("input",e=>{ if(e.target?.matches?.("#speedRange")) setTimeout(updateNarrationSummary,0); });
    window.addEventListener("pageshow",()=>setTimeout(refreshAndDecorate,80));
    window.addEventListener("focus",()=>setTimeout(refreshAndDecorate,100));
    window.addEventListener("narrador:auth-ready",()=>setTimeout(refreshAndDecorate,120));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(refreshAndDecorate,80);});
    document.addEventListener("click",()=>setTimeout(()=>{current=pickCurrent();decorateAll();},90),true);
    clearInterval(tick);
    tick=setInterval(()=>{ if(document.hidden)return; current=pickCurrent(); renderPlaybackUI(); translateExisting(); decorateChapterSheet(); },1100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
  window.__narradorUX61 = {openNowPlaying,closeNowPlaying,refresh:refreshAndDecorate};
})();
