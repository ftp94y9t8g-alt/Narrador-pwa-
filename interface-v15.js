// Narrador interface v15: functional Inicio, Biblioteca, Historial and Ajustes.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let activeFilter = "all";

  function initials(title = "Narrador") {
    return String(title).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase()).join("") || "NV";
  }
  function esc(s="") {
    return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
  function openDB() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"}); };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function books() {
    try {
      const db=await openDB();
      return await new Promise((resolve,reject)=>{
        const r=db.transaction(STORE).objectStore(STORE).getAll();
        r.onsuccess=()=>resolve(r.result||[]);
        r.onerror=()=>reject(r.error);
      });
    } catch (_) { return []; }
  }

  function setTab(tab) {
    const map = { home:"#homeView", library:"#libraryView", history:"#historyView", settings:"#settingsView" };
    if (!map[tab]) return;
    $$(".view").forEach(v=>v.classList.remove("active"));
    $(map[tab])?.classList.add("active");
    document.body.dataset.mainTab = tab;
    document.body.dataset.detailView = "0";
    $$(".bottomNav .navItem").forEach(item=>item.classList.toggle("active",item.dataset.tab===tab));
    window.scrollTo({top:0,behavior:"instant"});
    if(tab==="home") refreshHome();
    if(tab==="library") { applyLibraryFilter(); }
    if(tab==="history") renderHistory();
    if(tab==="settings") refreshSettings();
  }

  function originalBookRows() { return $$("#library .bookRow"); }
  function clickBookByTitle(title, resume=false) {
    const row=originalBookRows().find(r=>r.textContent.includes(title));
    if(row){ row.click(); if(resume) setTimeout(()=>$("#playerView #playBtn")?.focus(),250); }
  }

  async function refreshHome() {
    const all=(await books()).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
    const recent=$("#homeRecent");
    const empty=$("#homeEmpty");
    if(!recent||!empty)return;
    recent.innerHTML="";
    empty.classList.toggle("hidden",all.length>0);
    if(!all.length)return;
    all.slice(0,4).forEach(book=>{
      const ci=Math.max(0,Math.min(book.lastChapter||0,(book.chapters?.length||1)-1));
      const btn=document.createElement("button");
      btn.className="recentBook";
      btn.innerHTML=`<div class="recentCover">${initials(book.title)}</div><h4>${esc(book.title)}</h4><p>${esc(book.chapters?.[ci]?.title||`${book.chapters?.length||0} capítulos`)}</p>`;
      btn.onclick=()=>clickBookByTitle(book.title);
      recent.appendChild(btn);
    });
  }

  async function progressTitles() {
    const all=await books();
    return new Set(all.filter(b=>(b.lastChapter||0)>0 || (b.lastSegment||0)>0).map(b=>b.title));
  }

  async function applyLibraryFilter() {
    const search=($("#librarySearch")?.value||"").trim().toLowerCase();
    const rows=originalBookRows();
    const inProgress=await progressTitles();
    rows.forEach((row,index)=>{
      const text=row.textContent.toLowerCase();
      let show=!search||text.includes(search);
      if(activeFilter==="recent") show=show&&index<6;
      if(activeFilter==="progress") show=show&&[...inProgress].some(t=>text.includes(t.toLowerCase()));
      row.style.display=show?"":"none";
    });
  }

  async function renderHistory() {
    const wrap=$("#historyList");
    if(!wrap)return;
    const all=(await books()).filter(b=>b.chapters?.length).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
    wrap.innerHTML="";
    if(!all.length){ wrap.innerHTML='<div class="historyEmpty">Tu historial aparecerá aquí cuando empieces a escuchar.</div>'; return; }
    all.forEach(book=>{
      const total=Math.max(1,book.chapters.length);
      const ci=Math.max(0,Math.min(book.lastChapter||0,total-1));
      const chapter=book.chapters[ci];
      const chapterPct=Math.round((ci/Math.max(1,total-1))*100);
      const btn=document.createElement("button");
      btn.className="historyRow";
      btn.innerHTML=`<div class="historyCover">${initials(book.title)}</div><div class="historyMeta"><h4>${esc(book.title)}</h4><p>${esc(chapter?.title||`Capítulo ${ci+1}`)} · ${chapterPct}% del libro</p><div class="historyProgress"><i style="width:${chapterPct}%"></i></div></div><div class="historyPlay">▶</div>`;
      btn.onclick=()=>clickBookByTitle(book.title);
      wrap.appendChild(btn);
    });
  }

  function readPrefs(){ try{return JSON.parse(localStorage.getItem(PREF_KEY)||"null")||{};}catch(_){return {};} }
  function writePrefs(next){
    const merged={engine:"system",language:"auto",voice:"",style:"warm",speed:"0.95",...readPrefs(),...next};
    try{localStorage.setItem(PREF_KEY,JSON.stringify(merged));}catch(_){}
    if(next.engine && $("#engineSelect")){ $("#engineSelect").value=next.engine; $("#engineSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.language && $("#languageSelect")){ $("#languageSelect").value=next.language; $("#languageSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.style && $("#styleSelect")){ $("#styleSelect").value=next.style; $("#styleSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.speed && $("#speedRange")){ $("#speedRange").value=next.speed; $("#speedRange").dispatchEvent(new Event("input",{bubbles:true})); }
  }

  async function refreshStorage() {
    const label=$("#storageLabel"),bar=$("#storageBarFill");
    if(!label||!bar)return;
    if(!navigator.storage?.estimate){label.textContent="Información no disponible";return;}
    try{
      const e=await navigator.storage.estimate();
      const used=e.usage||0, quota=e.quota||1;
      const mb=n=>Math.max(0,n/1024/1024);
      label.textContent=`${mb(used).toFixed(0)} MB usados de ${mb(quota).toFixed(0)} MB disponibles`;
      bar.style.width=`${Math.min(100,(used/quota)*100).toFixed(1)}%`;
    }catch(_){label.textContent="Información no disponible";}
  }

  function refreshSettings() {
    const p=readPrefs();
    if($("#settingsEngine")) $("#settingsEngine").value=p.engine||"system";
    if($("#settingsLanguage")) $("#settingsLanguage").value=p.language||"auto";
    if($("#settingsStyle")) $("#settingsStyle").value=p.style||"warm";
    if($("#settingsSpeed")) $("#settingsSpeed").value=p.speed||"0.95";
    if($("#notificationState")){
      const permission=(typeof Notification!=="undefined"?Notification.permission:"unsupported");
      $("#notificationState").textContent=permission==="granted"?"Activadas":permission==="denied"?"Desactivadas":"Toca para permitir avisos";
    }
    refreshStorage();
  }

  async function requestNotifications() {
    if(typeof Notification==="undefined") return;
    try{ await Notification.requestPermission(); }catch(_){}
    refreshSettings();
  }

  function watchDetailViews() {
    const detailIds=["processingView","bookView","playerView"];
    const observer=new MutationObserver(()=>{
      const detail=detailIds.some(id=>$("#"+id)?.classList.contains("active"));
      document.body.dataset.detailView=detail?"1":"0";
      if(detail){
        $("#homeView")?.classList.remove("active");
        $("#historyView")?.classList.remove("active");
        $("#settingsView")?.classList.remove("active");
      } else if($("#libraryView")?.classList.contains("active")) {
        document.body.dataset.mainTab="library";
        $$(".bottomNav .navItem").forEach(item=>item.classList.toggle("active",item.dataset.tab==="library"));
      }
    });
    detailIds.concat(["libraryView"]).forEach(id=>{ const el=$("#"+id); if(el)observer.observe(el,{attributes:true,attributeFilter:["class"]}); });
  }

  function syncFromLibrary() {
    refreshHome();
    if(document.body.dataset.mainTab==="history")renderHistory();
    applyLibraryFilter();
  }

  document.addEventListener("DOMContentLoaded",()=>{
    document.body.dataset.mainTab="home";
    document.body.dataset.detailView="0";
    $("#libraryView")?.classList.remove("active");
    $("#homeView")?.classList.add("active");

    $$(".bottomNav .navItem[data-tab]").forEach(btn=>btn.addEventListener("click",()=>setTab(btn.dataset.tab)));
    $("#librarySearch")?.addEventListener("input",applyLibraryFilter);
    $$(".filterChip").forEach(btn=>btn.addEventListener("click",()=>{
      activeFilter=btn.dataset.filter||"all";
      $$(".filterChip").forEach(x=>x.classList.toggle("active",x===btn));
      applyLibraryFilter();
    }));

    $("#settingsEngine")?.addEventListener("change",e=>writePrefs({engine:e.target.value}));
    $("#settingsLanguage")?.addEventListener("change",e=>writePrefs({language:e.target.value}));
    $("#settingsStyle")?.addEventListener("change",e=>writePrefs({style:e.target.value}));
    $("#settingsSpeed")?.addEventListener("change",e=>writePrefs({speed:e.target.value}));
    $("#notificationsRow")?.addEventListener("click",requestNotifications);

    const library=$("#library");
    if(library)new MutationObserver(syncFromLibrary).observe(library,{childList:true,subtree:true});
    watchDetailViews();
    setTimeout(syncFromLibrary,250);
    refreshSettings();
  });

  window.__narradorSetTab=setTab;
})();
