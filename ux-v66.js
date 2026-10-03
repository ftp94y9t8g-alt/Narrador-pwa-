// Narrador v66 — exhaustive device-review cleanup.
// Fixes only UI/metadata/localization issues observed in the v65 screen recording.
// Stable speech, AI generation, PDF import, auth and storage engines remain untouched.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s,r=document) => r.querySelector(s);
  const $$ = (s,r=document) => [...r.querySelectorAll(s)];
  let applying = false;
  let hydrating = false;
  let metadataNormalized = false;

  const supported = new Set(["es","en","fr","pt","it","de"]);
  function locale(){
    const html = document.documentElement.dataset.narradorLocale;
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  }

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
    done:{es:"Listo",en:"Done",fr:"Terminé",pt:"Concluído",it:"Fatto",de:"Fertig"},
    myBooks:{es:"Mis libros",en:"My books",fr:"Mes livres",pt:"Meus livros",it:"I miei libri",de:"Meine Bücher"},
    changeCover:{es:"Cambiar portada",en:"Change cover",fr:"Changer la couverture",pt:"Trocar capa",it:"Cambia copertina",de:"Cover ändern"},
    narration:{es:"Narración",en:"Narration",fr:"Narration",pt:"Narração",it:"Narrazione",de:"Erzählung"},
    bookmarks:{es:"Marcadores",en:"Bookmarks",fr:"Signets",pt:"Marcadores",it:"Segnalibri",de:"Lesezeichen"},
    bookmarksHint:{es:"Guarda y vuelve a tus partes favoritas",en:"Save and return to your favorite parts",fr:"Enregistrez et retrouvez vos passages favoris",pt:"Salve e volte às suas partes favoritas",it:"Salva e torna ai tuoi passaggi preferiti",de:"Speichere und öffne deine Lieblingsstellen"},
    chapters:{es:"Capítulos",en:"Chapters",fr:"Chapitres",pt:"Capítulos",it:"Capitoli",de:"Kapitel"},
    back:{es:"Volver",en:"Back",fr:"Retour",pt:"Voltar",it:"Indietro",de:"Zurück"},
    chapter:{es:"Capítulo",en:"Chapter",fr:"Chapitre",pt:"Capítulo",it:"Capitolo",de:"Kapitel"},
    nowPlaying:{es:"Reproduciendo",en:"Now Playing",fr:"Lecture en cours",pt:"Reproduzindo",it:"In riproduzione",de:"Wiedergabe"},
    speed:{es:"Velocidad",en:"Speed",fr:"Vitesse",pt:"Velocidade",it:"Velocità",de:"Tempo"},
    sleep:{es:"Dormir",en:"Sleep",fr:"Minuterie",pt:"Dormir",it:"Timer",de:"Schlaf"},
    bookmark:{es:"Marcador",en:"Bookmark",fr:"Signet",pt:"Marcador",it:"Segnalibro",de:"Lesezeichen"},
    readWhile:{es:"Leer mientras escucho",en:"Read while listening",fr:"Lire pendant l’écoute",pt:"Ler enquanto escuta",it:"Leggi durante l’ascolto",de:"Beim Hören lesen"},
    pages:{es:["página","páginas"],en:["page","pages"],fr:["page","pages"],pt:["página","páginas"],it:["pagina","pagine"],de:["Seite","Seiten"]},
    chapterUnits:{es:["capítulo","capítulos"],en:["chapter","chapters"],fr:["chapitre","chapitres"],pt:["capítulo","capítulos"],it:["capitolo","capitoli"],de:["Kapitel","Kapitel"]}
  };
  const t = key => D[key]?.[locale()] || D[key]?.en || key;
  const unit = (key,n) => {
    const pair = D[key]?.[locale()] || D[key]?.en || [key,key];
    return pair[Number(n) === 1 ? 0 : 1];
  };

  const unknownRE = /^(?:autor no especificado|author not specified|auteur non spécifié|autor não especificado|autore non specificato|autor nicht angegeben|unknown)$/i;
  const smallWords = new Set(["de","del","la","las","el","los","y","e","en","a","al","of","the","and","in","to","da","do","das","dos","di","della","der","die","und"]);
  const isUnknown = s => !String(s||"").trim() || unknownRE.test(String(s||"").trim());

  function isShouting(text=""){
    const raw=String(text).trim();
    const letters=raw.match(/[A-Za-zÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÇÃÕ]/g)||[];
    if(letters.length<5)return false;
    const upper=letters.filter(c=>c===c.toUpperCase()&&c!==c.toLowerCase()).length;
    return upper/letters.length>.82;
  }
  function smartTitle(text=""){
    const raw=String(text).replace(/\s+/g," ").trim();
    if(!isShouting(raw))return raw;
    return raw.toLocaleLowerCase(locale()).split(" ").map((word,i)=>{
      if(/^[ivxlcdm]+[.:—–-]?$/i.test(word))return word.toUpperCase();
      const bare=word.replace(/[^a-záéíóúüñàèìòùâêîôûäëïöüçãõ]/gi,"").toLowerCase();
      if(i>0&&smallWords.has(bare))return word;
      return word.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i,c=>c.toLocaleUpperCase(locale()));
    }).join(" ");
  }
  function sentenceCase(text=""){
    const raw=String(text).replace(/\s+/g," ").trim();
    if(!isShouting(raw))return raw;
    const m=raw.match(/^((?:\d+\.?|[IVXLCDM]+\.?)(?:\s+|\s*[—–-]\s*))?(.*)$/i);
    const lead=m?.[1]||"";
    let rest=(m?.[2]||raw).toLocaleLowerCase(locale());
    rest=rest.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i,c=>c.toLocaleUpperCase(locale()));
    return `${lead}${rest}`.trim();
  }
  function smartAuthor(text=""){
    let s=String(text||"").replace(/\s+/g," ").trim();
    s=s.replace(/\b((?:[A-Za-z]\.){2,4})/g,token=>{
      const letters=token.match(/[A-Za-z]/g)||[];
      return letters.map(x=>`${x.toUpperCase()}.`).join(" ");
    });
    return s;
  }

  function openDB(){
    return new Promise((resolve,reject)=>{
      let req;
      try{req=indexedDB.open(DB_NAME);}catch(e){reject(e);return;}
      req.onerror=()=>reject(req.error);
      req.onupgradeneeded=()=>{try{req.transaction?.abort();}catch(_){}reject(new Error("db-upgrade"));};
      req.onsuccess=()=>resolve(req.result);
    });
  }
  async function readBooks(){
    try{
      const db=await openDB();
      const rows=await new Promise((resolve,reject)=>{
        if(!db.objectStoreNames.contains(STORE)){resolve([]);return;}
        const req=db.transaction(STORE,"readonly").objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
      });
      try{db.close();}catch(_){}
      return rows;
    }catch(_){return[];}
  }
  async function putBook(book){
    try{
      const db=await openDB();
      await new Promise((resolve,reject)=>{
        const req=db.transaction(STORE,"readwrite").objectStore(STORE).put(book);
        req.onsuccess=resolve;req.onerror=()=>reject(req.error);
      });
      try{db.close();}catch(_){}
      return true;
    }catch(_){return false;}
  }

  async function normalizeStoredMetadata(){
    if(metadataNormalized)return;
    metadataNormalized=true;
    const rows=await readBooks();
    let changed=false;
    for(const book of rows){
      let dirty=false;
      const title=smartTitle(book.title||"");
      if(title&&title!==book.title){book.title=title;dirty=true;}
      const author=smartAuthor(book.author||"");
      if(author&&author!==book.author){book.author=author;dirty=true;}
      if(Array.isArray(book.chapters)){
        for(const chapter of book.chapters){
          const next=sentenceCase(chapter?.title||"");
          if(next&&chapter&&next!==chapter.title){chapter.title=next;dirty=true;}
        }
      }
      if(dirty){await putBook(book);changed=true;}
    }
    if(changed){
      try{await Promise.resolve(window.__narradorRefreshHome47?.());}catch(_){}
      try{await Promise.resolve(window.__narradorUX61?.refresh?.());}catch(_){}
    }
  }

  function setText(selector,value,root=document){
    const el=$(selector,root);if(el&&el.textContent!==value)el.textContent=value;
  }
  function hideUnknown(el){
    if(!el)return;
    const hide=isUnknown(el.textContent);
    el.classList.toggle("n66UnknownAuthor",hide);
    el.hidden=hide;
    if(!hide){el.hidden=false;el.textContent=smartAuthor(el.textContent);}
  }

  function translateNav(){
    const map={home:"home",library:"library",history:"history",settings:"settings"};
    Object.entries(map).forEach(([tab,key])=>setText(`.bottomNav .navItem[data-tab="${tab}"] .navLabel`,t(key)));
  }
  function translateHome(){
    setText("#homeView .n62HeroKicker",t("continue"));
    const read=$("#homeView .n61HeroActions .v18Open span");if(read)read.textContent=t("read");
    const listen=$("#homeView .n61HeroListen span");if(listen)listen.textContent=t("continue");
    setText("#n62RecentSection .n62ShelfHead h3",t("yourLibrary"));
    const see=$("#n62RecentSection .n62ShelfHead button");if(see)see.textContent=t("seeAll");
  }
  function translateLibrary(){
    setText("#libraryView .libraryTop h2",t("myLibrary"));
    const search=$("#librarySearch");if(search)search.placeholder=t("search");
    const map={all:"all",recent:"recent",progress:"progress"};
    Object.entries(map).forEach(([v,k])=>setText(`#libraryView .filterChip[data-filter="${v}"]`,t(k)));
    const org=$("#organizeBtn");
    if(org)org.textContent=$("#library")?.classList.contains("organizing")?t("done"):t("organize");
    setText("#libraryContent .sectionTitle h3",t("myBooks"));
  }
  function translateBook(){
    const back=$("#bookView > .backBtn");if(back)back.textContent=`‹ ${t("library")}`;
    setText("#bookCoverChange",t("changeCover"));
    const read=$("#bookView .n61BookActions .readBookBtn span");if(read)read.textContent=t("read");
    const listen=$("#bookView .n61BookListen span");if(listen)listen.textContent=t("listen");
    setText("#n61NarrationSummary .n61SummaryText strong",t("narration"));
    const markStrong=$("#bookView .bookmarksCard56 .meta56 strong");if(markStrong)markStrong.textContent=t("bookmarks");
    const markHint=$("#bookView .bookmarksCard56 .meta56 span");if(markHint)markHint.textContent=t("bookmarksHint");
    setText("#bookView .sectionTitle h3",t("chapters"));
    const meta=$("#bookMeta");
    if(meta){
      const nums=(meta.textContent.match(/\d+/g)||[]).map(Number);
      if(nums.length>=2)meta.textContent=`${nums[0]} ${unit("pages",nums[0])} · ${nums[1]} ${unit("chapterUnits",nums[1])}`;
    }
  }
  function simplifyNarration(){
    const out=$("#n61NarrationSummary .n61SummaryText span");if(!out)return;
    const engineRaw=$("#engineSelect")?.selectedOptions?.[0]?.textContent?.trim()||"iPhone";
    const voiceRaw=$("#voiceSelect")?.selectedOptions?.[0]?.textContent?.trim()||"";
    const speed=$("#speedLabel")?.textContent?.trim()||"";
    const engine=engineRaw.split("·")[0].trim();
    const voice=voiceRaw.split("·")[0].trim();
    out.textContent=[engine,voice,speed].filter(Boolean).join(" · ");
  }

  function cleanVisibleMetadata(){
    ["#homeView .v18HomeAuthor","#bookAuthorLine","#library .libraryAuthor","#historyList .historyAuthor","#n61NowPlaying .n61NowAuthor","#n62RecentSection .n62ShelfCard span"].forEach(sel=>$$(sel).forEach(hideUnknown));
    ["#homeView .v18HomeTitle","#n62RecentSection .n62ShelfCard strong","#library .bookRow h4","#bookTitle","#n61NowPlaying .n61NowTitle","#historyList .historyMeta h4"].forEach(sel=>$$(sel).forEach(el=>{
      const next=smartTitle(el.textContent);if(next&&next!==el.textContent)el.textContent=next;
    }));
    ["#chapters .chapterRow h4","#dailySheet56 [data-chapter56] strong","#readerChapterTitle"].forEach(sel=>$$(sel).forEach(el=>{
      const next=sentenceCase(el.textContent);if(next&&next!==el.textContent)el.textContent=next;
    }));
    ["#homeView .v18HomeAuthor","#bookAuthorLine","#library .libraryAuthor","#historyList .historyAuthor","#n61NowPlaying .n61NowAuthor","#n62RecentSection .n62ShelfCard span"].forEach(sel=>$$(sel).forEach(el=>{
      if(!isUnknown(el.textContent)){const next=smartAuthor(el.textContent);if(next&&next!==el.textContent)el.textContent=next;}
    }));
  }

  async function hydrateBookDetail(){
    if(hydrating||!$("#bookView"))return;
    hydrating=true;
    try{
      const title=String($("#bookTitle")?.textContent||"").trim();
      if(!title)return;
      const rows=await readBooks();
      const book=rows.find(b=>String(b.title||"").trim()===title)||rows.find(b=>smartTitle(String(b.title||""))===title);
      if(!book)return;
      const author=$("#bookAuthorLine");
      if(author){
        if(isUnknown(book.author)){author.textContent="";author.hidden=true;author.classList.add("n66UnknownAuthor");}
        else{author.hidden=false;author.classList.remove("n66UnknownAuthor");author.textContent=smartAuthor(book.author);}
      }
    }finally{hydrating=false;}
  }

  function repairReader(){
    const back=$("#readerBack");if(back){back.setAttribute("aria-label",t("back"));back.setAttribute("title",t("back"));}
    const listen=$("#readerListen");if(listen){listen.setAttribute("aria-label",t("listen"));listen.setAttribute("title",t("listen"));}
    const box=$("#n65ReaderTopTitle");
    if(box){
      box.setAttribute("role","button");box.tabIndex=0;box.setAttribute("aria-label",t("chapters"));box.setAttribute("title",t("chapters"));
      if(box.dataset.n66Bound!=="1"){
        box.dataset.n66Bound="1";
        const openPicker=()=>{
          const select=$("#readerChapterSelect");if(!select)return;
          try{if(select.showPicker){select.showPicker();return;}}catch(_){}
          try{select.focus({preventScroll:true});select.click();}catch(_){}
        };
        box.addEventListener("click",openPicker);
        box.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openPicker();}});
      }
    }
  }

  function repairNowPlaying(){
    const root=$("#n61NowPlaying");if(!root)return;
    setText(".n61NowTop strong",t("nowPlaying"),root);
    const actionMap={speed:"speed",chapters:"chapters",sleep:"sleep",bookmark:"bookmark"};
    Object.entries(actionMap).forEach(([a,k])=>setText(`[data-n61-action="${a}"] span`,t(k),root));
    const rw=$("#n64ReadWhile");
    if(rw){
      rw.innerHTML=`<svg class="n66BookIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 17h10M8 4v13"/></svg><span>${t("readWhile")}</span>`;
    }
    const back=root.querySelector(".n61Back15"),forward=root.querySelector(".n61Forward15");
    if(back&&back.dataset.n66!=="1"){
      back.dataset.n66="1";
      back.innerHTML=`<svg class="n66SkipIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8V4L2 7l3 3V8a8 8 0 1 1-1 4"/><text x="8.2" y="15" text-anchor="middle">15</text></svg><span>15 s</span>`;
    }
    if(forward&&forward.dataset.n66!=="1"){
      forward.dataset.n66="1";
      forward.innerHTML=`<svg class="n66SkipIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8V4l3 3-3 3V8a8 8 0 1 0 1 4"/><text x="15.8" y="15" text-anchor="middle">15</text></svg><span>15 s</span>`;
    }
    const chapter=root.querySelector(".n61NowChapter");
    if(chapter){
      const raw=String(chapter.textContent||"").trim();
      const m=raw.match(/^(\d+)\.\s*(.+)$/);
      if(m)chapter.textContent=`${t("chapter")} ${m[1]} · ${sentenceCase(m[2])}`;
    }
  }

  function exitOrganizeForSearch(){
    const wrap=$("#library"),btn=$("#organizeBtn");
    if(wrap?.classList.contains("organizing")&&btn){
      try{btn.click();}catch(_){}
      setTimeout(()=>{if(wrap.classList.contains("organizing"))wrap.classList.remove("organizing");apply();},30);
    }
  }

  function translateToast(){
    const toast=$("#toast");if(!toast)return;
    const raw=String(toast.textContent||"").trim();
    const map={
      "Mantén y arrastra un libro para cambiar su posición.":{en:"Press and drag a book to reorder it.",fr:"Maintenez et faites glisser un livre pour le réorganiser.",pt:"Pressione e arraste um livro para reordená-lo.",it:"Tieni premuto e trascina un libro per riordinarlo.",de:"Halte ein Buch gedrückt und ziehe es zum Sortieren."}
    };
    const next=map[raw]?.[locale()];if(next&&next!==raw)toast.textContent=next;
  }

  function apply(){
    if(applying)return;
    applying=true;
    try{
      translateNav();translateHome();translateLibrary();translateBook();simplifyNarration();
      cleanVisibleMetadata();repairReader();repairNowPlaying();translateToast();
      document.documentElement.classList.add("n66Cleanup");
    }finally{applying=false;}
    hydrateBookDetail();
  }

  function observeHost(selector,{attributes=false}={}){
    const host=$(selector);if(!host||host.dataset.n66Observed==="1")return;
    host.dataset.n66Observed="1";
    const mo=new MutationObserver(()=>queueMicrotask(apply));
    mo.observe(host,{childList:true,subtree:true,characterData:true,attributes,attributeFilter:attributes?["class"]:undefined});
  }

  function install(){
    normalizeStoredMetadata().finally(()=>setTimeout(apply,0));
    apply();
    ["#homeView","#libraryView","#bookView","#readerView","#n61NowPlaying","#historyView"].forEach(sel=>observeHost(sel,{attributes:sel==="#libraryView"}));
    document.addEventListener("focusin",e=>{if(e.target?.id==="librarySearch")exitOrganizeForSearch();});
    document.addEventListener("click",()=>setTimeout(apply,40),true);
    document.addEventListener("change",()=>setTimeout(apply,20),true);
    window.addEventListener("pageshow",()=>setTimeout(apply,60));
    window.addEventListener("focus",()=>setTimeout(apply,80));
    window.addEventListener("narrador:auth-ready",()=>setTimeout(apply,100));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(apply,60);});
    // Targeted reconciliation beats late legacy renderers without a whole-document observer.
    setInterval(()=>{if(!document.hidden)apply();},700);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  window.__narradorUX66={apply,normalizeStoredMetadata};
})();