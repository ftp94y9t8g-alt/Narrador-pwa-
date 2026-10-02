// Narrador v18: instant-feeling navigation, reliable book menus, reference-style Home.
(() => {
  const DB_NAME="narrador-db-v1", STORE="books";
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  let activeMenuId=null, homeRenderBusy=false;

  function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
  function initials(t="Narrador"){return String(t).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"NV";}
  function author(b){return String(b?.author||"Autor no especificado").trim()||"Autor no especificado";}
  function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function allBooks(){try{const db=await openDB();return await new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}catch(_){return[];}}
  async function bookById(id){return (await allBooks()).find(b=>String(b.id)===String(id))||null;}
  async function deleteById(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}

  function setCover(el,b){if(!el)return; if(b?.coverDataUrl){el.style.backgroundImage=`url(${b.coverDataUrl})`;el.textContent="";}else{el.style.backgroundImage="";el.textContent=initials(b?.title);}}
  function mins(n){n=Math.max(0,Math.round(n||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`;}

  async function renderHome(){
    if(homeRenderBusy)return; homeRenderBusy=true;
    try{
      const host=$("#homeFeatured"); if(!host)return;
      const all=(await allBooks()).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
      const empty=$("#homeEmpty");
      if(!all.length){host.classList.add("hidden");host.innerHTML="";empty?.classList.remove("hidden");return;}
      const b=all[0], total=Math.max(1,b.chapters?.length||1), ci=Math.max(0,Math.min(b.lastChapter||0,total-1));
      const pct=Math.round((ci/Math.max(1,total-1))*100), totalMin=Math.max(1,Math.round((b.charCount||0)/900)), elapsed=Math.round(totalMin*pct/100);
      host.classList.remove("hidden"); empty?.classList.add("hidden");
      host.innerHTML=`<div class="v18HomeShell" data-book-id="${esc(b.id)}">
        <div class="v18HomeCover"></div>
        <div class="v18HomeTitle">${esc(b.title)}</div>
        <div class="v18HomeAuthor">${esc(author(b))}</div>
        <button class="v18Open" type="button" data-v18-action="read">▱ Abrir</button>
        <div class="v18Player">
          <div class="v18Guide">Narrador está leyendo para ti</div>
          <h3>${esc(b.title)}</h3>
          <div class="v18PlayerAuthor">${esc(author(b))} · ${esc(b.chapters?.[ci]?.title||`Capítulo ${ci+1}`)}</div>
          <div class="v18Progress"><i style="width:${pct}%"></i></div>
          <div class="v18Times"><span>${mins(elapsed)}</span><span>${mins(totalMin)}</span></div>
          <div class="v18Transport"><button type="button" data-v18-action="prev" aria-label="Capítulo anterior">◀</button><button class="homePlayerPlay" type="button" data-v18-action="play" aria-label="Escuchar">▶</button><button type="button" data-v18-action="next" aria-label="Capítulo siguiente">▶</button></div>
          <div class="v18Wave">${Array.from({length:32},()=>"<span></span>").join("")}</div>
          <div class="v18Quick"><button class="homeQuickAction" type="button" data-v18-action="speed"><i class="homeQuickIcon">↗</i><span><strong>Velocidad</strong><span>${esc(localStorage.getItem("narrador-home-speed")||"0.95×")}</span></span></button><button class="homeQuickAction" type="button" data-v18-action="voice"><i class="homeQuickIcon">◉</i><span><strong>Elegir voz</strong><span>Preferencias de narración</span></span></button></div>
        </div>
      </div>`;
      setCover(host.querySelector(".v18HomeCover"),b);
      host.dataset.bookId=b.id; host.dataset.chapter=String(ci);
    } finally {homeRenderBusy=false;}
  }

  function manualTab(tab){
    const map={home:"#homeView",library:"#libraryView",history:"#historyView",settings:"#settingsView"}, sel=map[tab]; if(!sel)return;
    $$(".view").forEach(v=>v.classList.remove("active")); $(sel)?.classList.add("active");
    document.body.dataset.mainTab=tab;document.body.dataset.detailView="0";
    $$(".bottomNav .navItem").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    window.scrollTo(0,0); if(tab==="home")renderHome();
    requestAnimationFrame(()=>{try{window.__narradorSetTab?.(tab);}catch(_){} if(tab==="home")setTimeout(renderHome,30);});
  }

  function rowForId(id){return $$("#library .bookRow").find(r=>String(r.dataset.bookId)===String(id));}
  function openBookDetails(id,scroll=false){const row=rowForId(id); if(!row)return; row.click(); if(scroll)setTimeout(()=>$("#bookView .settingsCard")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}
  async function openListen(id,index){
    const row=rowForId(id); if(!row)return manualTab("library");
    rowForId(id)?.click();
    setTimeout(()=>{const chapters=$$("#chapters .chapterRow"); chapters[Math.max(0,Math.min(index,chapters.length-1))]?.click();setTimeout(()=>$("#playBtn")?.click(),60);},60);
  }

  function openMenu(id,anchor){
    const menu=$("#bookActionMenu");if(!menu)return;activeMenuId=id;menu.classList.add("open");
    const r=anchor.getBoundingClientRect(),w=Math.min(250,innerWidth-24);menu.style.width=`${w}px`;menu.style.left=`${Math.max(12,Math.min(innerWidth-w-12,r.right-w))}px`;menu.style.top=`${Math.max(12,Math.min(innerHeight-330,r.bottom+7))}px`;
  }
  function closeMenu(){activeMenuId=null;$("#bookActionMenu")?.classList.remove("open");}
  async function menuAction(action){
    const id=activeMenuId; if(!id)return; const b=await bookById(id); closeMenu(); if(!b)return;
    if(action==="open")return openBookDetails(id);
    if(action==="read")return window.__narradorOpenReader?.(id,b.lastChapter||0,"library");
    if(action==="cover"){const input=$("#coverEditorInput");if(input){input.dataset.bookId=id;input.value="";input.click();}return;}
    if(action==="title"||action==="author"){
      const modal=$("#editBookModal"),input=$("#editModalInput"); if(!modal||!input)return;
      $("#editModalTitle").textContent=action==="title"?"Editar título":"Editar autor";$("#editModalLabel").textContent=action==="title"?"Título del libro":"Autor";
      input.value=action==="title"?(b.title||""):(b.author||"");input.dataset.kind=action;input.dataset.bookId=id;modal.classList.add("open");setTimeout(()=>input.focus(),30);return;
    }
    if(action==="delete"&&confirm(`¿Eliminar “${b.title}” de Narrador?`)){await deleteById(id);location.reload();}
  }

  async function homeAction(action){
    const host=$("#homeFeatured"),id=host?.dataset.bookId,index=Number(host?.dataset.chapter||0); if(!id)return;
    const b=await bookById(id);if(!b)return;
    if(action==="read")return window.__narradorOpenReader?.(id,index,"home");
    if(action==="play")return openListen(id,index);
    if(action==="prev")return openListen(id,Math.max(0,index-1));
    if(action==="next")return openListen(id,Math.min((b.chapters?.length||1)-1,index+1));
    if(action==="speed"||action==="voice")return openBookDetails(id,true);
  }

  document.addEventListener("pointerdown",e=>{
    const nav=e.target.closest?.(".bottomNav .navItem[data-tab]");
    if(nav){e.preventDefault();e.stopImmediatePropagation();manualTab(nav.dataset.tab);return;}
    const dots=e.target.closest?.(".bookMenuBtn");
    if(dots){e.preventDefault();e.stopImmediatePropagation();const row=dots.closest(".bookRow");openMenu(row?.dataset.bookId,dots);return;}
    const menuBtn=e.target.closest?.("#bookActionMenu [data-book-action]");
    if(menuBtn){e.preventDefault();e.stopImmediatePropagation();menuAction(menuBtn.dataset.bookAction);return;}
    const homeBtn=e.target.closest?.("[data-v18-action]");
    if(homeBtn){e.preventDefault();e.stopImmediatePropagation();homeAction(homeBtn.dataset.v18Action);return;}
    if(!e.target.closest?.("#bookActionMenu,.bookMenuBtn"))closeMenu();
  },true);

  document.addEventListener("DOMContentLoaded",()=>{
    $("#homeView .homeSection")?.remove();
    $("#continueCard")?.classList.add("hidden");
    setTimeout(renderHome,120);
    const host=$("#homeFeatured");
    if(host)new MutationObserver(()=>{if(!host.querySelector(".v18HomeShell"))setTimeout(renderHome,20);}).observe(host,{childList:true});
  });
})();
