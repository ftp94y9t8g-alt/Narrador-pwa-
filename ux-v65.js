// Narrador v65 — precision pass: consistent localization, metadata cleanup and compact reader/detail surfaces.
// This layer is presentation-only; stable speech, AI, PDF, auth and storage engines are not replaced.
(() => {
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  const supported = new Set(["es","en","fr","pt","it","de"]);
  const locale = (() => {
    const html = document.documentElement.dataset.narradorLocale;
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  })();

  const D = {
    home:{es:"Inicio",en:"Home",fr:"Accueil",pt:"Início",it:"Home",de:"Start"},
    library:{es:"Biblioteca",en:"Library",fr:"Bibliothèque",pt:"Biblioteca",it:"Biblioteca",de:"Bibliothek"},
    history:{es:"Historial",en:"History",fr:"Historique",pt:"Histórico",it:"Cronologia",de:"Verlauf"},
    settings:{es:"Ajustes",en:"Settings",fr:"Réglages",pt:"Ajustes",it:"Impostazioni",de:"Einstellungen"},
    continue:{es:"Continuar escuchando",en:"Continue listening",fr:"Continuer l’écoute",pt:"Continuar ouvindo",it:"Continua ad ascoltare",de:"Weiterhören"},
    read:{es:"Leer",en:"Read",fr:"Lire",pt:"Ler",it:"Leggi",de:"Lesen"},
    listen:{es:"Escuchar",en:"Listen",fr:"Écouter",pt:"Ouvir",it:"Ascolta",de:"Anhören"},
    yourLibrary:{es:"Tu biblioteca",en:"Your library",fr:"Votre bibliothèque",pt:"Sua biblioteca",it:"La tua biblioteca",de:"Deine Bibliothek"},
    seeAll:{es:"Ver todo",en:"See all",fr:"Tout voir",pt:"Ver tudo",it:"Vedi tutto",de:"Alle anzeigen"},
    myLibrary:{es:"Mi biblioteca",en:"My library",fr:"Ma bibliothèque",pt:"Minha biblioteca",it:"La mia biblioteca",de:"Meine Bibliothek"},
    search:{es:"Buscar por título o autor…",en:"Search by title or author…",fr:"Rechercher par titre ou auteur…",pt:"Buscar por título ou autor…",it:"Cerca per titolo o autore…",de:"Nach Titel oder Autor suchen…"},
    all:{es:"Todos",en:"All",fr:"Tous",pt:"Todos",it:"Tutti",de:"Alle"},
    recent:{es:"Recientes",en:"Recent",fr:"Récents",pt:"Recentes",it:"Recenti",de:"Zuletzt"},
    progress:{es:"En curso",en:"In progress",fr:"En cours",pt:"Em andamento",it:"In corso",de:"In Bearbeitung"},
    organize:{es:"Organizar",en:"Organize",fr:"Organiser",pt:"Organizar",it:"Organizza",de:"Organisieren"},
    myBooks:{es:"Mis libros",en:"My books",fr:"Mes livres",pt:"Meus livros",it:"I miei libri",de:"Meine Bücher"},
    changeCover:{es:"Cambiar portada",en:"Change cover",fr:"Changer la couverture",pt:"Trocar capa",it:"Cambia copertina",de:"Cover ändern"},
    narration:{es:"Narración",en:"Narration",fr:"Narration",pt:"Narração",it:"Narrazione",de:"Erzählung"},
    bookmarks:{es:"Marcadores",en:"Bookmarks",fr:"Signets",pt:"Marcadores",it:"Segnalibri",de:"Lesezeichen"},
    bookmarksHint:{es:"Guarda y vuelve a tus partes favoritas",en:"Save and return to your favorite parts",fr:"Enregistrez et retrouvez vos passages favoris",pt:"Salve e volte às suas partes favoritas",it:"Salva e torna ai tuoi passaggi preferiti",de:"Speichere und öffne deine Lieblingsstellen"},
    chapters:{es:"Capítulos",en:"Chapters",fr:"Chapitres",pt:"Capítulos",it:"Capitoli",de:"Kapitel"},
    back:{es:"Volver",en:"Back",fr:"Retour",pt:"Voltar",it:"Indietro",de:"Zurück"},
    chapter:{es:"Capítulo",en:"Chapter",fr:"Chapitre",pt:"Capítulo",it:"Capitolo",de:"Kapitel"},
    chapterOf:{es:"Capítulo {a} de {b}",en:"Chapter {a} of {b}",fr:"Chapitre {a} sur {b}",pt:"Capítulo {a} de {b}",it:"Capitolo {a} di {b}",de:"Kapitel {a} von {b}"}
  };
  const t = key => D[key]?.[locale] || D[key]?.en || key;

  const unknownRE = /^(?:autor no especificado|author not specified|auteur non spécifié|autor não especificado|autore non specificato|autor nicht angegeben|unknown)$/i;
  const smallWords = new Set(["de","del","la","las","el","los","y","e","en","a","al","of","the","and","in","to","da","do","das","dos","di","della","der","die","das","und"]);

  function isUnknown(text="") { return unknownRE.test(String(text).trim()); }
  function isShouting(text="") {
    const raw = String(text).trim();
    const letters = raw.match(/[A-Za-zÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÇÃÕ]/g) || [];
    if (letters.length < 5) return false;
    const upper = letters.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    return upper / letters.length > .82;
  }
  function smartTitle(text="") {
    const raw = String(text).replace(/\s+/g," ").trim();
    if (!isShouting(raw)) return raw;
    return raw.toLocaleLowerCase(locale).split(" ").map((word,i) => {
      if (/^[ivxlcdm]+[.:—–-]?$/i.test(word)) return word.toUpperCase();
      if (i > 0 && smallWords.has(word.replace(/[^a-záéíóúüñàèìòùâêîôûäëïöüçãõ]/gi,"").toLowerCase())) return word;
      return word.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i, c => c.toLocaleUpperCase(locale));
    }).join(" ");
  }
  function sentenceCase(text="") {
    const raw = String(text).replace(/\s+/g," ").trim();
    if (!isShouting(raw)) return raw;
    const m = raw.match(/^((?:\d+\.?|[IVXLCDM]+\.?)(?:\s+|\s*[—–-]\s*))?(.*)$/i);
    const lead = m?.[1] || "";
    let rest = (m?.[2] || raw).toLocaleLowerCase(locale);
    rest = rest.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i,c=>c.toLocaleUpperCase(locale));
    return `${lead}${rest}`.trim();
  }

  function setText(sel,value,root=document) {
    const el = $(sel,root);
    if (el && el.textContent !== value) el.textContent = value;
  }

  function translateNav() {
    const map = {home:"home",library:"library",history:"history",settings:"settings"};
    Object.entries(map).forEach(([tab,key]) => {
      const label = $(`.bottomNav .navItem[data-tab="${tab}"] .navLabel`);
      if (label && label.textContent !== t(key)) label.textContent = t(key);
    });
  }

  function translateHome() {
    setText("#homeView .n62HeroKicker",t("continue"));
    const read = $("#homeView .n61HeroActions .v18Open span"); if (read) read.textContent = t("read");
    const listen = $("#homeView .n61HeroListen span"); if (listen) listen.textContent = t("continue");
    setText("#n62RecentSection .n62ShelfHead h3",t("yourLibrary"));
    const see = $("#n62RecentSection .n62ShelfHead button"); if (see) see.textContent = t("seeAll");
    const count = $("#homeView .n62HeroCount");
    if (count) {
      const nums = (count.textContent.match(/\d+/g) || []).slice(0,2);
      if (nums.length === 2) count.textContent = t("chapterOf").replace("{a}",nums[0]).replace("{b}",nums[1]);
    }
  }

  function translateLibrary() {
    setText("#libraryView .libraryTop h2",t("myLibrary"));
    const search = $("#librarySearch"); if (search) search.placeholder = t("search");
    const filters = {all:"all",recent:"recent",progress:"progress"};
    Object.entries(filters).forEach(([value,key]) => {
      const btn = $(`#libraryView .filterChip[data-filter="${value}"]`); if (btn) btn.textContent = t(key);
    });
    setText("#organizeBtn",t("organize"));
    setText("#libraryContent .sectionTitle h3",t("myBooks"));
  }

  function translateBook() {
    const back = $("#bookView > .backBtn"); if (back) back.textContent = `‹ ${t("library")}`;
    setText("#bookCoverChange",t("changeCover"));
    const read = $("#bookView .n61BookActions .readBookBtn span"); if (read) read.textContent = t("read");
    const listen = $("#bookView .n61BookListen span"); if (listen) listen.textContent = t("listen");
    setText("#n61NarrationSummary .n61SummaryText strong",t("narration"));
    const markStrong = $("#bookView .bookmarksCard56 .meta56 strong"); if (markStrong) markStrong.textContent = t("bookmarks");
    const markHint = $("#bookView .bookmarksCard56 .meta56 span"); if (markHint) markHint.textContent = t("bookmarksHint");
    setText("#bookView .sectionTitle h3",t("chapters"));
  }

  function simplifyNarration() {
    const out = $("#n61NarrationSummary .n61SummaryText span");
    if (!out) return;
    const engineRaw = $("#engineSelect")?.selectedOptions?.[0]?.textContent?.trim() || "iPhone";
    const voiceRaw = $("#voiceSelect")?.selectedOptions?.[0]?.textContent?.trim() || "";
    const speed = $("#speedLabel")?.textContent?.trim() || "";
    const engine = engineRaw.split("·")[0].trim();
    const voice = voiceRaw.split("·")[0].trim();
    const parts = [engine,voice,speed].filter(Boolean);
    const value = parts.join(" · ");
    if (value && out.textContent !== value) out.textContent = value;
  }

  function ensureReaderTitle() {
    const header = $("#readerView .readerHeader");
    const toolbar = header?.querySelector(".readerToolbar");
    if (!header || !toolbar) return;
    let box = $("#n65ReaderTopTitle");
    if (!box) {
      box = document.createElement("div");
      box.id = "n65ReaderTopTitle";
      box.innerHTML = `<strong></strong><span></span>`;
      header.insertBefore(box,toolbar);
    }
    const select = $("#readerChapterSelect");
    const idx = Math.max(0,Number(select?.value || 0));
    const label = select?.selectedOptions?.[0]?.textContent?.trim() || $("#readerChapterTitle")?.textContent?.trim() || "";
    box.querySelector("strong").textContent = `${t("chapter")} ${idx+1}`;
    box.querySelector("span").textContent = sentenceCase(label.replace(/^\d+\.\s*/,""));
    const back = $("#readerBack");
    if (back) { back.textContent = "‹"; back.setAttribute("aria-label",t("back")); }
    const listen = $("#readerListen");
    if (listen) { listen.textContent = "▶"; listen.setAttribute("aria-label",t("listen")); }
  }

  function cleanMetadata() {
    const authorSelectors = [
      "#homeView .v18HomeAuthor","#bookAuthorLine","#library .libraryAuthor","#historyList .historyAuthor",
      "#n61NowPlaying .n61NowAuthor","#n62RecentSection .n62ShelfCard span"
    ];
    authorSelectors.forEach(sel => $$(sel).forEach(el => el.classList.toggle("n65UnknownAuthor",isUnknown(el.textContent))));

    const titleSelectors = ["#homeView .v18HomeTitle","#n62RecentSection .n62ShelfCard strong","#library .bookRow h4","#bookTitle","#n61NowPlaying .n61NowTitle","#historyList .historyMeta h4"];
    titleSelectors.forEach(sel => $$(sel).forEach(el => {
      const value = smartTitle(el.textContent);
      if (value && value !== el.textContent) el.textContent = value;
    }));

    const chapterSelectors = ["#chapters .chapterRow h4","#dailySheet56 [data-chapter56] strong","#n61NowPlaying .n61NowChapter","#readerChapterTitle"];
    chapterSelectors.forEach(sel => $$(sel).forEach(el => {
      const value = sentenceCase(el.textContent);
      if (value && value !== el.textContent) el.textContent = value;
    }));
  }

  function syncReaderSize() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem("narrador-reader-prefs-v64") || "null"); } catch (_) {}
    const size = Math.max(16,Math.min(26,Number(p?.size || 19)));
    document.documentElement.style.setProperty("--n65-reader-size",`${size}px`);
  }

  function apply() {
    translateNav();
    translateHome();
    translateLibrary();
    translateBook();
    simplifyNarration();
    ensureReaderTitle();
    cleanMetadata();
    syncReaderSize();
    document.documentElement.classList.add("n65Precision");
  }

  function install() {
    apply();
    document.addEventListener("click",()=>setTimeout(apply,70),true);
    document.addEventListener("change",e=>{
      if (e.target?.matches?.("#readerChapterSelect,#engineSelect,#voiceSelect,#speedRange")) setTimeout(apply,20);
    });
    document.addEventListener("input",e=>{ if (e.target?.matches?.("#speedRange")) setTimeout(apply,20); });
    window.addEventListener("pageshow",()=>setTimeout(apply,80));
    window.addEventListener("focus",()=>setTimeout(apply,100));
    window.addEventListener("narrador:auth-ready",()=>setTimeout(apply,120));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(apply,80);});
    // Reconcile late-rendered legacy layers without a subtree MutationObserver.
    setInterval(()=>{ if (!document.hidden) apply(); },1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
  window.__narradorUX65 = {apply,locale};
})();