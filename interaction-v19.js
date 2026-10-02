// Narrador v20: reliable iPhone editing/cover picker + fast navigation/home.
(() => {
  const DB_NAME="narrador-db-v1", STORE="books";
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  let activeMenuId=null, homeRenderBusy=false, modalClosing=false;

  const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const initials=(t="Narrador")=>String(t).split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"NV";
  const author=b=>String(b?.author||"Autor no especificado").trim()||"Autor no especificado";
  function toast(msg,ms=2200){const el=$("#toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),ms);}

  function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function allBooks(){try{const db=await openDB();return await new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}catch(_){return[];}}
  async function bookById(id){return (await allBooks()).find(b=>String(b.id)===String(id))||null;}
  async function putBook(book){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(book);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}
  async function deleteById(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);});}

  function setCover(el,b){if(!el)return;if(b?.coverDataUrl){el.style.backgroundImage=`url("${String(b.coverDataUrl).replace(/"/g,"%22")}")`;el.classList.add("hasCustomCover");el.textContent="";}else{el.style.backgroundImage="";el.classList.remove("hasCustomCover");el.textContent=initials(b?.title);}}
  function mins(n){n=Math.max(0,Math.round(n||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`;}

  async function renderHome(){
    if(homeRenderBusy)return; homeRenderBusy=true;
    try{
      const host=$("#homeFeatured"); if(!host)return;
      const all=(await allBooks()).sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0));
      const empty=$("#homeEmpty");
      if(!all.length){host.classList.add("hidden");host.innerHTML="";empty?.classList.remove("hidden");return;}
      const b=all[0],total=Math.max(1,b.chapters?.length||1),ci=Math.max(0,Math.min(b.lastChapter||0,total-1));
      const pct=Math.round((ci/Math.max(1,total-1))*100),totalMin=Math.max(1,Math.round((b.charCount||0)/900)),elapsed=Math.round(totalMin*pct/100);
      host.classList.remove("hidden");empty?.classList.add("hidden");
      host.innerHTML=`<div class="v18HomeShell" data-book-id="${esc(b.id)}">
        <div class="v18HomeCover"></div>
        <div class="v18HomeTitle">${esc(b.title)}</div>
        <div class="v18HomeAuthor">${esc(author(b))}</div>
        <button class="v18Open" type="button" data-v19-home="read">▱ Abrir</button>
        <div class="v18Player">
          <div class="v18Guide">Narrador está leyendo para ti</div>
          <h3>${esc(b.title)}</h3>
          <div class="v18PlayerAuthor">${esc(author(b))} · ${esc(b.chapters?.[ci]?.title||`Capítulo ${ci+1}`)}</div>
          <div class="v18Progress"><i style="width:${pct}%"></i></div>
          <div class="v18Times"><span>${mins(elapsed)}</span><span>${mins(totalMin)}</span></div>
          <div class="v18Transport"><button type="button" data-v19-home="prev">◀</button><button class="homePlayerPlay" type="button" data-v19-home="play">▶</button><button type="button" data-v19-home="next">▶</button></div>
          <div class="v18Wave">${Array.from({length:32},()=>"<span></span>").join("")}</div>
          <div class="v18Quick"><button class="homeQuickAction" type="button" data-v19-home="speed"><i class="homeQuickIcon">↗</i><span><strong>Velocidad</strong><span>${esc(localStorage.getItem("narrador-home-speed")||"0.95×")}</span></span></button><button class="homeQuickAction" type="button" data-v19-home="voice"><i class="homeQuickIcon">◉</i><span><strong>Elegir voz</strong><span>Preferencias de narración</span></span></button></div>
        </div>
      </div>`;
      setCover(host.querySelector(".v18HomeCover"),b);host.dataset.bookId=b.id;host.dataset.chapter=String(ci);
    } finally {homeRenderBusy=false;}
  }

  function closeKeyboard(){
    const input=$("#editModalInput");
    if(input && document.activeElement===input){try{input.blur();}catch(_){}}
  }
  function closeEdit(){
    if(modalClosing)return;
    modalClosing=true;
    const m=$("#editBookModal"),input=$("#editModalInput");
    closeKeyboard();
    if(m){m.classList.remove("open");m.setAttribute("aria-hidden","true");}
    if(input){input.readOnly=true;setTimeout(()=>{input.readOnly=false;},260);}
    setTimeout(()=>{modalClosing=false;},280);
  }

  function manualTab(tab){
    closeEdit();closeKeyboard();
    const map={home:"#homeView",library:"#libraryView",history:"#historyView",settings:"#settingsView"},sel=map[tab];if(!sel)return;
    $$(".view").forEach(v=>v.classList.remove("active"));$(sel)?.classList.add("active");
    document.body.dataset.mainTab=tab;document.body.dataset.detailView="0";
    $$(".bottomNav .navItem").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    window.scrollTo(0,0);
    try{window.__narradorSetTab?.(tab);}catch(_){}
    if(tab==="home")setTimeout(renderHome,0);
  }

  function rowForId(id){return $$("#library .bookRow").find(r=>String(r.dataset.bookId)===String(id));}
  function openBookDetails(id,scroll=false){closeKeyboard();const row=rowForId(id);if(!row)return;row.click();if(scroll)setTimeout(()=>$("#bookView .settingsCard")?.scrollIntoView({behavior:"smooth",block:"start"}),0);}
  function openListen(id,index){closeKeyboard();const row=rowForId(id);if(!row){manualTab("library");return;}row.click();setTimeout(()=>{const chapters=$$("#chapters .chapterRow");chapters[Math.max(0,Math.min(index,chapters.length-1))]?.click();setTimeout(()=>$("#playBtn")?.click(),0);},0);}

  function openMenu(id,anchor){const menu=$("#bookActionMenu");if(!menu||!id)return;closeEdit();activeMenuId=id;menu.classList.add("open");const r=anchor.getBoundingClientRect(),w=Math.min(250,innerWidth-24);menu.style.width=`${w}px`;menu.style.left=`${Math.max(12,Math.min(innerWidth-w-12,r.right-w))}px`;menu.style.top=`${Math.max(12,Math.min(innerHeight-330,r.bottom+7))}px`;}
  function closeMenu(){activeMenuId=null;$("#bookActionMenu")?.classList.remove("open");}

  function rowValue(id,kind){const row=rowForId(id);if(kind==="title")return row?.querySelector("h4")?.textContent?.trim()||"";const a=row?.querySelector(".libraryAuthor")?.textContent?.trim()||"";return a==="Autor no especificado"?"":a;}
  function openEditNow(kind,id){
    const modal=$("#editBookModal"),input=$("#editModalInput");if(!modal||!input)return;
    closeMenu();
    $("#editModalTitle").textContent=kind==="title"?"Editar título":"Editar autor";
    $("#editModalLabel").textContent=kind==="title"?"Título del libro":"Autor";
    input.readOnly=false;input.dataset.kind=kind;input.dataset.bookId=id;input.value=rowValue(id,kind);
    modal.classList.add("open");modal.setAttribute("aria-hidden","false");
    requestAnimationFrame(()=>{try{input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}catch(_){}});
  }

  async function saveEdit(){
    const input=$("#editModalInput");if(!input)return;
    const value=input.value.trim(),id=input.dataset.bookId,kind=input.dataset.kind;
    if(!value){toast("Escribe un valor antes de guardar.");try{input.focus();}catch(_){}return;}
    closeEdit();
    try{
      const b=await bookById(id);if(!b)return toast("No encontré ese libro.");
      if(kind==="title")b.title=value;else b.author=value;
      await putBook(b);toast(kind==="title"?"Título actualizado.":"Autor actualizado.");setTimeout(()=>location.reload(),140);
    }catch(err){console.error(err);toast("No pude guardar el cambio.",3200);}
  }

  async function resizeCover(file){
    const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file);});
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=data;});
    const size=720,c=document.createElement("canvas");c.width=size;c.height=size;const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
    const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);return c.toDataURL("image/jpeg",.86);
  }
  async function saveCover(file,id){if(!file||!id)return;try{toast("Preparando portada…");const b=await bookById(id);if(!b)return;b.coverDataUrl=await resizeCover(file);await putBook(b);toast("Portada actualizada.");setTimeout(()=>location.reload(),160);}catch(err){console.error(err);toast("No pude usar esa imagen.",3500);}}
  function launchFreshCoverPicker(id){
    closeKeyboard();
    const picker=document.createElement("input");
    picker.type="file";picker.accept="image/*";picker.setAttribute("aria-hidden","true");
    picker.style.cssText="position:fixed;left:-20px;top:-20px;width:1px;height:1px;opacity:.01;pointer-events:none;";
    picker.addEventListener("change",()=>{const file=picker.files?.[0];picker.remove();if(file)saveCover(file,id);},{once:true});
    document.body.appendChild(picker);
    try{picker.click();}catch(err){picker.remove();console.error(err);toast("No pude abrir Fotos. Inténtalo de nuevo.",3200);}
    closeMenu();
  }

  function menuActionSync(action){
    const id=activeMenuId;if(!id)return;
    if(action==="cover")return launchFreshCoverPicker(id);
    if(action==="title"||action==="author")return openEditNow(action,id);
    if(action==="open"){closeMenu();return openBookDetails(id);}
    if(action==="read"){closeMenu();return window.__narradorOpenReader?.(id,Number(rowForId(id)?.dataset.lastChapter||0),"library");}
    if(action==="delete"){
      const title=rowValue(id,"title")||"este libro";closeMenu();if(confirm(`¿Eliminar “${title}” de Narrador?`))deleteById(id).then(()=>location.reload());
    }
  }

  async function homeAction(action){closeKeyboard();const host=$("#homeFeatured"),id=host?.dataset.bookId,index=Number(host?.dataset.chapter||0);if(!id)return;const b=await bookById(id);if(!b)return;if(action==="read")return window.__narradorOpenReader?.(id,index,"home");if(action==="play")return openListen(id,index);if(action==="prev")return openListen(id,Math.max(0,index-1));if(action==="next")return openListen(id,Math.min((b.chapters?.length||1)-1,index+1));if(action==="speed"||action==="voice")return openBookDetails(id,true);}

  function resetLegacyInteractiveNodes(){
    const menu=$("#bookActionMenu");if(menu){const clean=menu.cloneNode(true);menu.replaceWith(clean);}
    const modal=$("#editBookModal");if(modal){const clean=modal.cloneNode(true);modal.replaceWith(clean);}
    const oldCover=$("#coverEditorInput");if(oldCover){const clean=oldCover.cloneNode(true);oldCover.replaceWith(clean);}
  }

  document.addEventListener("pointerdown",e=>{
    const save=e.target.closest?.("#editModalSave");
    if(save){e.preventDefault();e.stopImmediatePropagation();saveEdit();return;}
    const cancel=e.target.closest?.("#editModalCancel");
    if(cancel){e.preventDefault();e.stopImmediatePropagation();closeEdit();return;}
    const menuBtn=e.target.closest?.("#bookActionMenu [data-book-action]");
    if(menuBtn){const action=menuBtn.dataset.bookAction;if(action==="cover")menuActionSync(action);else menuActionSync(action);e.preventDefault();e.stopImmediatePropagation();return;}
    const nav=e.target.closest?.(".bottomNav .navItem[data-tab]");
    if(nav){e.preventDefault();e.stopImmediatePropagation();manualTab(nav.dataset.tab);return;}
    const dots=e.target.closest?.(".bookMenuBtn");
    if(dots){e.preventDefault();e.stopImmediatePropagation();openMenu(dots.closest(".bookRow")?.dataset.bookId,dots);return;}
    const homeBtn=e.target.closest?.("[data-v19-home]");
    if(homeBtn){e.preventDefault();e.stopImmediatePropagation();homeAction(homeBtn.dataset.v19Home);return;}
    if(e.target.id==="editBookModal"){e.preventDefault();e.stopImmediatePropagation();closeEdit();return;}
    if(!e.target.closest?.("#bookActionMenu,.bookMenuBtn,.editBookSheet"))closeMenu();
  },true);

  document.addEventListener("touchstart",e=>{
    const save=e.target.closest?.("#editModalSave"),cancel=e.target.closest?.("#editModalCancel");
    if(save){e.preventDefault();e.stopImmediatePropagation();saveEdit();return;}
    if(cancel){e.preventDefault();e.stopImmediatePropagation();closeEdit();return;}
  },{capture:true,passive:false});

  document.addEventListener("click",e=>{
    if(e.target.closest?.("#bookActionMenu [data-book-action],#editModalCancel,#editModalSave,[data-v19-home]")){e.preventDefault();e.stopImmediatePropagation();}
  },true);

  document.addEventListener("DOMContentLoaded",()=>{
    resetLegacyInteractiveNodes();
    $("#homeView .homeSection")?.remove();$("#continueCard")?.classList.add("hidden");
    $("#editModalInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveEdit();}else if(e.key==="Escape"){e.preventDefault();closeEdit();}},true);
    setTimeout(renderHome,80);
    const host=$("#homeFeatured");if(host)new MutationObserver(()=>{if(!host.querySelector(".v18HomeShell"))setTimeout(renderHome,0);}).observe(host,{childList:true});
  });
})();
