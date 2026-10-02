// Narrador interface v16: Spotify-style home/library, editable metadata, covers,
// individual book actions, grid/list views, manual ordering, history and reader.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PREF_KEY = "narrador-voice-prefs-v10";
  const ORDER_KEY = "narrador-library-order-v16";
  const VIEW_KEY = "narrador-library-view-v16";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let activeFilter = "all";
  let decorating = false;
  let decorateTimer = null;
  let activeMenuBookId = null;
  let organizeMode = false;
  let dragState = null;
  let readerBook = null;
  let readerChapter = 0;
  let readerReturnTab = "library";

  function initials(title = "Narrador") {
    return String(title).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase()).join("") || "NV";
  }
  function esc(s="") {
    return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
  function authorLabel(book) { return String(book?.author || "Autor no especificado").trim() || "Autor no especificado"; }
  function toast(message, ms=2600) {
    const el=$("#toast"); if(!el)return;
    el.textContent=message; el.classList.add("show");
    clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),ms);
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
        r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error);
      });
    } catch (_) { return []; }
  }
  async function getBook(id) { return (await books()).find(b=>String(b.id)===String(id)) || null; }
  async function putBook(book) {
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(book);
      r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
    });
  }
  async function removeBook(id) {
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);
      r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
    });
  }

  function setCover(el, book) {
    if(!el)return;
    const url=book?.coverDataUrl;
    if(url){
      el.classList.add("hasCustomCover");
      el.style.backgroundImage=`url(${JSON.stringify(url).slice(1,-1)})`;
      el.textContent="";
    } else {
      el.classList.remove("hasCustomCover");
      el.style.backgroundImage="";
      el.textContent=initials(book?.title);
    }
  }

  function setTab(tab) {
    const map={home:"#homeView",library:"#libraryView",history:"#historyView",settings:"#settingsView"};
    if(!map[tab])return;
    $$(".view").forEach(v=>v.classList.remove("active"));
    $(map[tab])?.classList.add("active");
    document.body.dataset.mainTab=tab;
    document.body.dataset.detailView="0";
    $$(".bottomNav .navItem").forEach(item=>item.classList.toggle("active",item.dataset.tab===tab));
    window.scrollTo({top:0,behavior:"instant"});
    closeBookMenu();
    if(tab==="home")refreshHome();
    if(tab==="library"){decorateLibrary();applyLibraryFilter();}
    if(tab==="history")renderHistory();
    if(tab==="settings")refreshSettings();
  }

  function originalBookRows(){ return $$("#library .bookRow"); }
  function rowById(id){ return originalBookRows().find(r=>String(r.dataset.bookId)===String(id)); }
  function clickBookById(id){ const row=rowById(id); if(row)row.click(); }

  function loadOrder(){ try{return JSON.parse(localStorage.getItem(ORDER_KEY)||"[]")||[];}catch(_){return [];} }
  function saveOrder(){
    const ids=originalBookRows().map(r=>r.dataset.bookId).filter(Boolean);
    try{localStorage.setItem(ORDER_KEY,JSON.stringify(ids));}catch(_){}
  }
  function applyOrder(){
    const wrap=$("#library"); if(!wrap)return;
    const order=loadOrder(); if(!order.length)return;
    const rank=new Map(order.map((id,i)=>[String(id),i]));
    const rows=originalBookRows();
    rows.sort((a,b)=>(rank.get(String(a.dataset.bookId))??9999)-(rank.get(String(b.dataset.bookId))??9999));
    rows.forEach(r=>wrap.appendChild(r));
  }

  function currentLibraryView(){ return localStorage.getItem(VIEW_KEY)==="list"?"list":"grid"; }
  function applyLibraryView(view=currentLibraryView()){
    const wrap=$("#library"); if(!wrap)return;
    wrap.dataset.view=view;
    try{localStorage.setItem(VIEW_KEY,view);}catch(_){}
    $("#gridViewBtn")?.classList.toggle("active",view==="grid");
    $("#listViewBtn")?.classList.toggle("active",view==="list");
  }

  function createAuthorNode(row){
    let node=row.querySelector(".libraryAuthor");
    if(node)return node;
    node=document.createElement("div"); node.className="libraryAuthor";
    row.querySelector(".grow")?.appendChild(node);
    return node;
  }
  function createMenuButton(row,book){
    const cover=row.querySelector(".miniCover"); if(!cover)return;
    let btn=cover.querySelector(".bookMenuBtn");
    if(!btn){
      btn=document.createElement("button"); btn.type="button"; btn.className="bookMenuBtn"; btn.setAttribute("aria-label","Opciones del libro"); btn.textContent="•••";
      cover.appendChild(btn);
      btn.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openBookMenu(book.id,btn);});
    }
  }

  async function decorateLibrary(){
    if(decorating)return;
    const wrap=$("#library"); if(!wrap)return;
    decorating=true;
    try{
      const all=(await books()).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      const byId=new Map(all.map(b=>[String(b.id),b]));
      const unused=[...all];
      const rows=originalBookRows();
      for(const row of rows){
        let book=row.dataset.bookId?byId.get(String(row.dataset.bookId)):null;
        if(!book){
          const title=row.querySelector("h4")?.textContent?.trim()||"";
          const idx=unused.findIndex(b=>b.title===title);
          book=idx>=0?unused.splice(idx,1)[0]:unused.shift();
          if(book)row.dataset.bookId=book.id;
        }
        if(!book)continue;
        row.classList.add("managedBookRow");
        const h4=row.querySelector("h4"); if(h4)h4.textContent=book.title;
        const author=createAuthorNode(row); if(author)author.textContent=authorLabel(book);
        const meta=row.querySelector(".grow > p"); if(meta)meta.textContent=`${book.chapters?.length||0} capítulos · ~${Math.max(1,Math.round((book.charCount||0)/900))} min`;
        const cover=row.querySelector(".miniCover"); setCover(cover,book);
        createMenuButton(row,book);
      }
      applyOrder(); applyLibraryView();
      $("#clearBtn")?.classList.add("legacyClearHidden");
      await applyLibraryFilter();
    } finally { decorating=false; }
  }

  async function progressIds(){
    const all=await books();
    return new Set(all.filter(b=>(b.lastChapter||0)>0||(b.lastSegment||0)>0).map(b=>String(b.id)));
  }
  async function applyLibraryFilter(){
    const search=($("#librarySearch")?.value||"").trim().toLowerCase();
    const rows=originalBookRows();
    const all=await books();
    const byId=new Map(all.map(b=>[String(b.id),b]));
    const progress=await progressIds();
    const recentIds=new Set([...all].sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0)).slice(0,6).map(b=>String(b.id)));
    rows.forEach(row=>{
      const b=byId.get(String(row.dataset.bookId));
      const hay=`${b?.title||""} ${b?.author||""}`.toLowerCase();
      let show=!search||hay.includes(search);
      if(activeFilter==="recent")show=show&&recentIds.has(String(row.dataset.bookId));
      if(activeFilter==="progress")show=show&&progress.has(String(row.dataset.bookId));
      row.style.display=show?"":"none";
    });
  }

  function closeBookMenu(){ const p=$("#bookActionMenu"); if(p)p.classList.remove("open"); activeMenuBookId=null; }
  async function openBookMenu(id,anchor){
    const menu=$("#bookActionMenu"); if(!menu)return;
    activeMenuBookId=id;
    menu.classList.add("open");
    const r=anchor.getBoundingClientRect();
    const width=Math.min(250,window.innerWidth-24);
    const left=Math.min(window.innerWidth-width-12,Math.max(12,r.right-width));
    const top=Math.min(window.innerHeight-330,Math.max(12,r.bottom+8));
    menu.style.width=`${width}px`; menu.style.left=`${left}px`; menu.style.top=`${top}px`;
  }

  function openEditModal(kind,book){
    const modal=$("#editBookModal"); if(!modal)return;
    const title=$("#editModalTitle"),label=$("#editModalLabel"),input=$("#editModalInput");
    const isTitle=kind==="title";
    title.textContent=isTitle?"Editar título":"Editar autor";
    label.textContent=isTitle?"Título del libro":"Autor";
    input.value=isTitle?(book.title||""):(book.author||"");
    input.dataset.kind=kind; input.dataset.bookId=book.id;
    modal.classList.add("open"); setTimeout(()=>{input.focus();input.select();},80);
  }
  function closeEditModal(){ $("#editBookModal")?.classList.remove("open"); }
  async function saveEditModal(){
    const input=$("#editModalInput"); if(!input)return;
    const value=input.value.trim(); if(!value)return toast("Escribe un valor antes de guardar.");
    const book=await getBook(input.dataset.bookId); if(!book)return;
    if(input.dataset.kind==="title")book.title=value; else book.author=value;
    await putBook(book); closeEditModal();
    if(input.dataset.kind==="title"){
      toast("Título actualizado."); setTimeout(()=>location.reload(),250);
    } else {
      toast("Autor actualizado."); await decorateLibrary(); await refreshHome(); await renderHistory(); decorateBookDetail();
    }
  }

  async function resizeCover(file){
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=data;});
    const size=720,canvas=document.createElement("canvas"); canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,size,size);
    const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;
    ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
    return canvas.toDataURL("image/jpeg",0.86);
  }
  async function chooseCover(book){
    const input=$("#coverEditorInput"); if(!input)return;
    input.dataset.bookId=book.id; input.value=""; input.click();
  }
  async function handleCoverFile(file,id){
    if(!file)return; const book=await getBook(id); if(!book)return;
    try{
      toast("Preparando portada…"); book.coverDataUrl=await resizeCover(file); await putBook(book);
      toast("Portada actualizada."); await decorateLibrary(); await refreshHome(); await renderHistory(); decorateBookDetail();
    }catch(e){console.error(e);toast("No pude usar esa imagen.",4000);}
  }

  async function deleteBook(book){
    if(!confirm(`¿Eliminar “${book.title}” de Narrador?`))return;
    await removeBook(book.id);
    const order=loadOrder().filter(id=>String(id)!==String(book.id));
    try{localStorage.setItem(ORDER_KEY,JSON.stringify(order));}catch(_){}
    toast("Libro eliminado."); setTimeout(()=>location.reload(),220);
  }

  async function handleMenuAction(action){
    const id=activeMenuBookId; closeBookMenu(); if(!id)return;
    const book=await getBook(id); if(!book)return;
    if(action==="open")return clickBookById(id);
    if(action==="read")return openReader(id,book.lastChapter||0,"library");
    if(action==="cover")return chooseCover(book);
    if(action==="title")return openEditModal("title",book);
    if(action==="author")return openEditModal("author",book);
    if(action==="delete")return deleteBook(book);
  }

  async function refreshHome(){
    const all=(await books()).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
    const featured=$("#homeFeatured"),recent=$("#homeRecent"),empty=$("#homeEmpty");
    if(!featured||!recent||!empty)return;
    featured.innerHTML=""; recent.innerHTML="";
    empty.classList.toggle("hidden",all.length>0);
    featured.classList.toggle("hidden",!all.length);
    if(!all.length)return;
    const book=all[0],ci=Math.max(0,Math.min(book.lastChapter||0,(book.chapters?.length||1)-1));
    featured.innerHTML=`<div class="featuredCover"></div><div class="featuredInfo"><h2>${esc(book.title)}</h2><p>${esc(authorLabel(book))}</p><button class="featuredOpen" type="button">▱ Abrir</button></div>`;
    setCover(featured.querySelector(".featuredCover"),book);
    featured.querySelector(".featuredOpen").onclick=()=>openReader(book.id,ci,"home");
    featured.querySelector(".featuredCover").onclick=()=>clickBookById(book.id);
    all.slice(0,6).forEach(b=>{
      const btn=document.createElement("button"); btn.className="recentBook";
      btn.innerHTML=`<div class="recentCover"></div><h4>${esc(b.title)}</h4><p>${esc(authorLabel(b))}</p>`;
      setCover(btn.querySelector(".recentCover"),b); btn.onclick=()=>clickBookById(b.id); recent.appendChild(btn);
    });
  }

  async function renderHistory(){
    const wrap=$("#historyList"); if(!wrap)return;
    const all=(await books()).filter(b=>b.chapters?.length).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
    wrap.innerHTML="";
    if(!all.length){wrap.innerHTML='<div class="historyEmpty">Tu historial aparecerá aquí cuando empieces a escuchar.</div>';return;}
    all.forEach(book=>{
      const total=Math.max(1,book.chapters.length),ci=Math.max(0,Math.min(book.lastChapter||0,total-1));
      const pct=Math.round((ci/Math.max(1,total-1))*100),chapter=book.chapters[ci];
      const btn=document.createElement("button"); btn.className="historyRow";
      btn.innerHTML=`<div class="historyCover"></div><div class="historyMeta"><h4>${esc(book.title)}</h4><div class="historyAuthor">${esc(authorLabel(book))}</div><p>${esc(chapter?.title||`Capítulo ${ci+1}`)} · ${pct}% del libro</p><div class="historyProgress"><i style="width:${pct}%"></i></div></div><div class="historyPlay">▶</div>`;
      setCover(btn.querySelector(".historyCover"),book); btn.onclick=()=>clickBookById(book.id); wrap.appendChild(btn);
    });
  }

  async function decorateBookDetail(){
    const title=$("#bookTitle")?.textContent?.trim(); if(!title||title==="Libro")return;
    const all=await books(),book=all.find(b=>b.title===title); if(!book)return;
    setCover($("#cover"),book); setCover($("#playerCover"),book);
    if($("#bookAuthorLine"))$("#bookAuthorLine").textContent=authorLabel(book);
    const read=$("#readBookBtn"); if(read){read.dataset.bookId=book.id;read.onclick=()=>openReader(book.id,book.lastChapter||0,"library");}
  }

  function renderReader(){
    if(!readerBook)return;
    const chapters=readerBook.chapters||[]; readerChapter=Math.max(0,Math.min(readerChapter,Math.max(0,chapters.length-1)));
    const ch=chapters[readerChapter]||{title:"Libro",text:""};
    $("#readerBookTitle").textContent=readerBook.title;
    $("#readerAuthor").textContent=authorLabel(readerBook);
    $("#readerChapterTitle").textContent=ch.title||`Capítulo ${readerChapter+1}`;
    setCover($("#readerCover"),readerBook);
    const sel=$("#readerChapterSelect");
    if(sel){sel.innerHTML=chapters.map((c,i)=>`<option value="${i}">${esc(c.title||`Capítulo ${i+1}`)}</option>`).join("");sel.value=String(readerChapter);}
    $("#readerPrev").disabled=readerChapter<=0; $("#readerNext").disabled=readerChapter>=chapters.length-1;
    const paras=String(ch.text||"").split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
    $("#readerText").innerHTML=paras.map(p=>`<p>${esc(p).replace(/\n/g,"<br>")}</p>`).join("")||"<p>Este capítulo no tiene texto disponible.</p>";
    window.scrollTo({top:0,behavior:"instant"});
  }
  async function openReader(id,chapter=0,returnTab="library"){
    const book=await getBook(id); if(!book)return;
    readerBook=book; readerChapter=chapter; readerReturnTab=returnTab;
    $$(".view").forEach(v=>v.classList.remove("active")); $("#readerView")?.classList.add("active");
    document.body.dataset.detailView="1"; closeBookMenu(); renderReader();
  }
  function closeReader(){ readerBook=null; setTab(readerReturnTab||"library"); }
  function readerListen(){
    if(!readerBook)return;
    const id=readerBook.id,index=readerChapter; closeReader();
    setTab("library");
    setTimeout(()=>{
      const row=rowById(id); if(!row)return; row.click();
      setTimeout(()=>{ const chapterRows=$$("#chapters .chapterRow"); chapterRows[index]?.click(); },180);
    },80);
  }

  function toggleOrganize(){
    organizeMode=!organizeMode;
    $("#library")?.classList.toggle("organizing",organizeMode);
    const btn=$("#organizeBtn"); if(btn){btn.classList.toggle("active",organizeMode);btn.textContent=organizeMode?"Listo":"Organizar";}
    if(organizeMode)toast("Arrastra las portadas para ordenar tu biblioteca.",3500); else saveOrder();
  }
  function startDrag(e,row){
    if(!organizeMode||e.button>0)return;
    e.preventDefault(); closeBookMenu();
    dragState={row,pointerId:e.pointerId}; row.classList.add("dragging");
    try{row.setPointerCapture(e.pointerId);}catch(_){}
  }
  function moveDrag(e){
    if(!dragState)return; e.preventDefault();
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("#library .bookRow");
    const row=dragState.row,wrap=$("#library"); if(!target||target===row||target.parentElement!==wrap)return;
    const rect=target.getBoundingClientRect(),view=wrap.dataset.view||"grid";
    const before=view==="list"?e.clientY<rect.top+rect.height/2:(e.clientY<rect.top+rect.height*.45||(Math.abs(e.clientY-(rect.top+rect.height/2))<rect.height*.2&&e.clientX<rect.left+rect.width/2));
    wrap.insertBefore(row,before?target:target.nextSibling);
  }
  function endDrag(){ if(!dragState)return;dragState.row.classList.remove("dragging");dragState=null;saveOrder(); }

  function readPrefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||"null")||{};}catch(_){return {};}}
  function writePrefs(next){
    const merged={engine:"system",language:"auto",voice:"",style:"warm",speed:"0.95",...readPrefs(),...next};
    try{localStorage.setItem(PREF_KEY,JSON.stringify(merged));}catch(_){}
    if(next.engine&&$("#engineSelect")){ $("#engineSelect").value=next.engine;$("#engineSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.language&&$("#languageSelect")){ $("#languageSelect").value=next.language;$("#languageSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.style&&$("#styleSelect")){ $("#styleSelect").value=next.style;$("#styleSelect").dispatchEvent(new Event("change",{bubbles:true})); }
    if(next.speed&&$("#speedRange")){ $("#speedRange").value=next.speed;$("#speedRange").dispatchEvent(new Event("input",{bubbles:true})); }
  }
  async function refreshStorage(){
    const label=$("#storageLabel"),bar=$("#storageBarFill"); if(!label||!bar)return;
    if(!navigator.storage?.estimate){label.textContent="Información no disponible";return;}
    try{const e=await navigator.storage.estimate(),used=e.usage||0,quota=e.quota||1,mb=n=>n/1024/1024;label.textContent=`${mb(used).toFixed(0)} MB usados de ${mb(quota).toFixed(0)} MB disponibles`;bar.style.width=`${Math.min(100,(used/quota)*100).toFixed(1)}%`;}catch(_){label.textContent="Información no disponible";}
  }
  function refreshSettings(){
    const p=readPrefs();
    if($("#settingsEngine"))$("#settingsEngine").value=p.engine||"system";
    if($("#settingsLanguage"))$("#settingsLanguage").value=p.language||"auto";
    if($("#settingsStyle"))$("#settingsStyle").value=p.style||"warm";
    if($("#settingsSpeed"))$("#settingsSpeed").value=p.speed||"0.95";
    if($("#notificationState")){const permission=typeof Notification!=="undefined"?Notification.permission:"unsupported";$("#notificationState").textContent=permission==="granted"?"Activadas":permission==="denied"?"Desactivadas":"Toca para permitir avisos";}
    refreshStorage();
  }
  async function requestNotifications(){if(typeof Notification==="undefined")return;try{await Notification.requestPermission();}catch(_){}refreshSettings();}

  function watchDetailViews(){
    const ids=["processingView","bookView","playerView","readerView"];
    const observer=new MutationObserver(()=>{
      const detail=ids.some(id=>$("#"+id)?.classList.contains("active")); document.body.dataset.detailView=detail?"1":"0";
      if(detail){$("#homeView")?.classList.remove("active");$("#historyView")?.classList.remove("active");$("#settingsView")?.classList.remove("active");}
      decorateBookDetail();
    });
    ids.concat(["libraryView"]).forEach(id=>{const el=$("#"+id);if(el)observer.observe(el,{attributes:true,attributeFilter:["class"]});});
    const title=$("#bookTitle"); if(title)observer.observe(title,{childList:true,characterData:true,subtree:true});
  }

  function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(()=>{decorateLibrary();refreshHome();},80);}

  document.addEventListener("DOMContentLoaded",()=>{
    document.body.dataset.mainTab="home";document.body.dataset.detailView="0";
    $("#libraryView")?.classList.remove("active");$("#homeView")?.classList.add("active");
    $$(".bottomNav .navItem[data-tab]").forEach(btn=>btn.addEventListener("click",()=>setTab(btn.dataset.tab)));
    $("#librarySearch")?.addEventListener("input",applyLibraryFilter);
    $$(".filterChip").forEach(btn=>btn.addEventListener("click",()=>{activeFilter=btn.dataset.filter||"all";$$('.filterChip').forEach(x=>x.classList.toggle("active",x===btn));applyLibraryFilter();}));
    $("#gridViewBtn")?.addEventListener("click",()=>applyLibraryView("grid"));
    $("#listViewBtn")?.addEventListener("click",()=>applyLibraryView("list"));
    $("#organizeBtn")?.addEventListener("click",toggleOrganize);
    $("#bookActionMenu")?.addEventListener("click",e=>{const b=e.target.closest?.("[data-book-action]");if(b)handleMenuAction(b.dataset.bookAction);});
    document.addEventListener("click",e=>{if(!e.target.closest?.("#bookActionMenu,.bookMenuBtn"))closeBookMenu();});
    $("#editModalCancel")?.addEventListener("click",closeEditModal);$("#editModalSave")?.addEventListener("click",saveEditModal);
    $("#editBookModal")?.addEventListener("click",e=>{if(e.target.id==="editBookModal")closeEditModal();});
    $("#editModalInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")saveEditModal();if(e.key==="Escape")closeEditModal();});
    $("#coverEditorInput")?.addEventListener("change",e=>{const f=e.target.files?.[0],id=e.target.dataset.bookId;e.target.value="";handleCoverFile(f,id);});

    $("#readerBack")?.addEventListener("click",closeReader);
    $("#readerPrev")?.addEventListener("click",()=>{readerChapter--;renderReader();});
    $("#readerNext")?.addEventListener("click",()=>{readerChapter++;renderReader();});
    $("#readerChapterSelect")?.addEventListener("change",e=>{readerChapter=Number(e.target.value)||0;renderReader();});
    $("#readerListen")?.addEventListener("click",readerListen);
    $("#readerFontDown")?.addEventListener("click",()=>{const el=$("#readerText");const n=Math.max(15,Number(el.dataset.font||19)-1);el.dataset.font=n;el.style.fontSize=`${n}px`;});
    $("#readerFontUp")?.addEventListener("click",()=>{const el=$("#readerText");const n=Math.min(28,Number(el.dataset.font||19)+1);el.dataset.font=n;el.style.fontSize=`${n}px`;});
    $("#readerTheme")?.addEventListener("click",()=>$("#readerView")?.classList.toggle("readerNight"));

    $("#settingsEngine")?.addEventListener("change",e=>writePrefs({engine:e.target.value}));
    $("#settingsLanguage")?.addEventListener("change",e=>writePrefs({language:e.target.value}));
    $("#settingsStyle")?.addEventListener("change",e=>writePrefs({style:e.target.value}));
    $("#settingsSpeed")?.addEventListener("change",e=>writePrefs({speed:e.target.value}));
    $("#notificationsRow")?.addEventListener("click",requestNotifications);

    const library=$("#library");
    if(library){
      new MutationObserver(scheduleDecorate).observe(library,{childList:true,subtree:true});
      library.addEventListener("pointerdown",e=>{const row=e.target.closest?.(".bookRow");if(row&&!e.target.closest("button"))startDrag(e,row);});
      library.addEventListener("click",e=>{if(organizeMode&&e.target.closest?.(".bookRow")){e.preventDefault();e.stopImmediatePropagation();}},true);
    }
    document.addEventListener("pointermove",moveDrag,{passive:false});document.addEventListener("pointerup",endDrag);document.addEventListener("pointercancel",endDrag);
    watchDetailViews(); applyLibraryView(); setTimeout(scheduleDecorate,180); refreshHome();refreshSettings();
  });

  window.__narradorSetTab=setTab;
  window.__narradorOpenReader=openReader;
})();
