// Narrador v62 — richer Home composition without changing playback engines.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  let books = [];
  let refreshing = false;

  const supported = new Set(["es","en","fr","pt","it","de"]);
  const locale = (() => {
    const html = document.documentElement.dataset.narradorLocale;
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  })();
  const L = {
    continue:{es:"CONTINUAR ESCUCHANDO",en:"CONTINUE LISTENING",fr:"CONTINUER L’ÉCOUTE",pt:"CONTINUAR OUVINDO",it:"CONTINUA AD ASCOLTARE",de:"WEITERHÖREN"},
    library:{es:"Tu biblioteca",en:"Your library",fr:"Votre bibliothèque",pt:"Sua biblioteca",it:"La tua libreria",de:"Deine Bibliothek"},
    seeAll:{es:"Ver todo",en:"See all",fr:"Tout voir",pt:"Ver tudo",it:"Vedi tutto",de:"Alle ansehen"},
    chapter:{es:"Capítulo",en:"Chapter",fr:"Chapitre",pt:"Capítulo",it:"Capitolo",de:"Kapitel"},
    of:{es:"de",en:"of",fr:"sur",pt:"de",it:"di",de:"von"},
    unknown:{es:"Autor no especificado",en:"Author not specified",fr:"Auteur non spécifié",pt:"Autor não especificado",it:"Autore non specificato",de:"Autor nicht angegeben"}
  };
  const t = k => L[k]?.[locale] || L[k]?.en || k;

  function readBooks(){
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME); } catch (_) { resolve([]); return; }
      req.onerror = () => resolve([]);
      req.onblocked = () => resolve([]);
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} resolve([]); };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { try{db.close();}catch(_){} resolve([]); return; }
        const r = db.transaction(STORE,"readonly").objectStore(STORE).getAll();
        r.onerror = () => { try{db.close();}catch(_){} resolve([]); };
        r.onsuccess = () => { const out = Array.isArray(r.result) ? r.result : []; try{db.close();}catch(_){} resolve(out); };
      };
    });
  }

  function currentBook(){
    const id = $("#homeFeatured")?.dataset.bookId;
    if (id) {
      const direct = books.find(b => String(b.id) === String(id));
      if (direct) return direct;
    }
    return [...books].sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0))[0] || null;
  }

  function initials(title="Narrador"){
    return String(title).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("") || "NV";
  }
  function esc(s=""){
    return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
  function author(book){
    const s = String(book?.author || "").trim();
    return !s || /^(?:autor no especificado|author not specified|unknown)$/i.test(s) ? t("unknown") : s;
  }
  function setCover(el, book){
    if (!el || !book) return;
    if (book.coverDataUrl) {
      el.style.backgroundImage = `url("${String(book.coverDataUrl).replace(/"/g,"%22")}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.textContent = "";
      el.classList.add("hasCustomCover");
    } else {
      el.style.backgroundImage = "";
      el.textContent = initials(book.title);
      el.classList.remove("hasCustomCover");
    }
  }

  function decorateHero(){
    const host = $("#homeFeatured");
    const shell = host?.querySelector(".v18HomeShell");
    const book = currentBook();
    if (!host || !shell || !book) return;

    let aura = $("#n62HomeAura");
    if (!aura) {
      aura = document.createElement("div");
      aura.id = "n62HomeAura";
      $("#homeView")?.prepend(aura);
    }
    if (book.coverDataUrl) aura.style.backgroundImage = `url("${String(book.coverDataUrl).replace(/"/g,"%22")}")`;
    else aura.style.backgroundImage = "linear-gradient(145deg,#8bb2ff,#8797ff 45%,#d9e6ff)";

    let kicker = shell.querySelector(".n62HeroKicker");
    if (!kicker) {
      kicker = document.createElement("div");
      kicker.className = "n62HeroKicker";
      const cover = shell.querySelector(".v18HomeCover");
      shell.insertBefore(kicker, cover || shell.firstChild);
    }
    kicker.textContent = t("continue");

    let meta = shell.querySelector(".n62HeroMeta");
    if (!meta) {
      meta = document.createElement("div");
      meta.className = "n62HeroMeta";
      const actions = shell.querySelector(".n61HeroActions");
      (actions?.parentNode || shell).insertBefore(meta, actions || null);
    }
    const total = Math.max(1, book.chapters?.length || 1);
    const ci = Math.max(0, Math.min(Number(book.lastChapter||0), total-1));
    const chapterTitle = book.chapters?.[ci]?.title || `${t("chapter")} ${ci+1}`;
    const pct = Math.max(4, Math.min(100, Math.round(((ci+1)/total)*100)));
    meta.innerHTML = `<div class="n62HeroChapter">${esc(chapterTitle)}</div><div class="n62HeroProgress"><i style="width:${pct}%"></i></div><div class="n62HeroCount">${t("chapter")} ${ci+1} ${t("of")} ${total}</div>`;
  }

  function openLibraryBook(book){
    const go = () => {
      const rows = $$("#library .bookRow");
      const row = rows.find(r => String(r.dataset.bookId||"") === String(book.id)) || rows.find(r => r.querySelector("h4")?.textContent?.trim() === String(book.title||"").trim());
      if (row) row.click();
    };
    if (typeof window.__narradorSetTab === "function") window.__narradorSetTab("library");
    else $(".bottomNav .navItem[data-tab='library']")?.click();
    setTimeout(go, 120);
  }

  function renderShelf(){
    const home = $("#homeView");
    if (!home) return;
    let section = $("#n62RecentSection");
    const current = currentBook();
    const list = [...books]
      .sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0))
      .filter(b => !current || String(b.id)!==String(current.id));

    if (books.length < 2 || !list.length) {
      section?.remove();
      return;
    }
    if (!section) {
      section = document.createElement("section");
      section.id = "n62RecentSection";
      const anchor = $("#homeFeatured");
      anchor?.insertAdjacentElement("afterend", section);
    }
    section.innerHTML = `<div class="n62ShelfHead"><h3>${t("library")}</h3><button type="button" class="n62SeeAll">${t("seeAll")}</button></div><div class="n62ShelfTrack"></div>`;
    const track = section.querySelector(".n62ShelfTrack");
    list.slice(0,6).forEach(book => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "n62ShelfCard";
      btn.innerHTML = `<div class="n62ShelfCover"></div><strong>${esc(book.title||"Libro")}</strong><span>${esc(author(book))}</span>`;
      setCover(btn.querySelector(".n62ShelfCover"), book);
      btn.onclick = () => openLibraryBook(book);
      track.appendChild(btn);
    });
    section.querySelector(".n62SeeAll").onclick = () => {
      if (typeof window.__narradorSetTab === "function") window.__narradorSetTab("library");
      else $(".bottomNav .navItem[data-tab='library']")?.click();
    };
  }

  function updateReaderMode(){
    document.body.classList.toggle("n62ReaderMode", !!$("#readerView.active"));
  }

  async function refresh(){
    if (refreshing) return;
    refreshing = true;
    try {
      books = await readBooks();
      decorateHero();
      renderShelf();
      updateReaderMode();
    } finally { refreshing = false; }
  }

  function install(){
    $("#homeView > .homeSection")?.classList.add("n62LegacyHomeSection");
    refresh();

    const homeFeatured = $("#homeFeatured");
    if (homeFeatured && !homeFeatured.dataset.n62Observed) {
      homeFeatured.dataset.n62Observed = "1";
      new MutationObserver(() => setTimeout(() => { decorateHero(); renderShelf(); }, 0)).observe(homeFeatured,{childList:true});
    }
    const reader = $("#readerView");
    if (reader && !reader.dataset.n62Observed) {
      reader.dataset.n62Observed = "1";
      new MutationObserver(updateReaderMode).observe(reader,{attributes:true,attributeFilter:["class"]});
    }

    window.addEventListener("pageshow", () => setTimeout(refresh,120));
    window.addEventListener("focus", () => setTimeout(refresh,140));
    window.addEventListener("narrador:auth-ready", () => setTimeout(refresh,140));
    document.addEventListener("visibilitychange", () => { if(!document.hidden) setTimeout(refresh,100); });
    window.addEventListener("click", e => {
      if (e.target?.closest?.(".bottomNav .navItem")) setTimeout(updateReaderMode,80);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
  window.__narradorUX62 = { refresh };
})();