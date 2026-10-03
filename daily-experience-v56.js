// Narrador v56 — daily listening upgrades: bookmarks, Home chapters, sleep-until-chapter-end and metadata cleanup.
(() => {
  const BOOK_DB="narrador-db-v1", AUDIO_DB="narrador-audio-v1";
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  let books=[], observer=null, sleepTimeout=0, sleepWatch=0, sleepState=null, refreshing=false;

  function toast(message,ms=3000){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove("show"),ms);}
  function openDB(name,version){return new Promise((resolve,reject)=>{const req=version?indexedDB.open(name,version):indexedDB.open(name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function readBooks(){try{const db=await openDB(BOOK_DB,1);const rows=await new Promise((resolve,reject)=>{const req=db.transaction("books","readonly").objectStore("books").getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});try{db.close();}catch(_){}books=rows;return rows;}catch(_){return books;}}
  async function putBook(book){try{const db=await openDB(BOOK_DB,1);await new Promise((resolve,reject)=>{const req=db.transaction("books","readwrite").objectStore("books").put(book);req.onsuccess=resolve;req.onerror=()=>reject(req.error);});try{db.close();}catch(_){}return true;}catch(_){return false;}}
  async function getJob(bookId){try{const db=await openDB(AUDIO_DB,1);const row=await new Promise(resolve=>{const req=db.transaction("jobs","readonly").objectStore("jobs").get(String(bookId));req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);});try{db.close();}catch(_){}return row;}catch(_){return null;}}
  async function putJob(job){try{const db=await openDB(AUDIO_DB,1);await new Promise((resolve,reject)=>{const req=db.transaction("jobs","readwrite").objectStore("jobs").put(job);req.onsuccess=resolve;req.onerror=()=>reject(req.error);});try{db.close();}catch(_){}return true;}catch(_){return false;}}

  function homeBook(){const id=$("#homeFeatured")?.dataset.bookId;if(id){const b=books.find(x=>String(x.id)===String(id));if(b)return b;}return [...books].sort((a,b)=>(b.lastPlayedAt||b.createdAt||0)-(a.lastPlayedAt||a.createdAt||0))[0]||null;}
  function displayedBook(){const title=$("#bookTitle")?.textContent?.trim();return books.find(b=>String(b.title||"").trim()===title)||homeBook();}
  function inferTrailingAuthor(title=""){
    const m=String(title).trim().match(/((?:(?:[A-ZÁÉÍÓÚÜÑ]\.)\s*){1,3}[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+){0,3})$/);
    return m?.[1]?.trim()||"";
  }
  async function retrofitAuthors(){
    let changed=false;
    for(const b of books){
      if(b.author&& !/^(?:autor no especificado|unknown)$/i.test(String(b.author)))continue;
      const author=inferTrailingAuthor(b.title);if(!author)continue;b.author=author;b.metadataSource=b.metadataSource||"title-inference-v56";changed=true;await putBook(b);
    }
    if(changed){
      const b=displayedBook();if(b&&$("#bookAuthorLine")&&String($("#bookTitle")?.textContent||"").trim()===String(b.title||"").trim())$("#bookAuthorLine").textContent=b.author||"Autor no especificado";
    }
  }

  function bookmarkPosition(book,source="home"){
    const chapter=Math.max(0,Math.min(Number(book?.lastChapter||0),Math.max(0,(book?.chapters?.length||1)-1)));
    const segment=Math.max(0,Number(book?.lastSegment||0));
    return {chapter,segment,source,title:book?.chapters?.[chapter]?.title||`Capítulo ${chapter+1}`};
  }
  async function addBookmark(book,source="home"){
    if(!book)return toast("No pude localizar el libro actual.");
    const pos=bookmarkPosition(book,source), job=await getJob(book.id);
    const item={id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,chapterIndex:pos.chapter,segmentIndex:pos.segment,aiBlock:job?.state==="ready"?Math.max(0,Number(job.playBlock||0)):null,label:pos.title,createdAt:Date.now()};
    book.bookmarks=Array.isArray(book.bookmarks)?book.bookmarks:[];
    const duplicate=book.bookmarks.find(x=>Number(x.chapterIndex)===item.chapterIndex&&Number(x.segmentIndex||0)===item.segmentIndex&&Number(x.aiBlock??-1)===Number(item.aiBlock??-1));
    if(duplicate){duplicate.createdAt=Date.now();duplicate.label=item.label;}else book.bookmarks.push(item);
    await putBook(book);toast(`Marcador guardado · ${item.label}`);decorateBookmarkCard();
  }

  function stopAll(){
    try{window.__narradorExperience54?.stop?.();}catch(_){}
    try{window.__narradorAudiobook50?.stop?.();}catch(_){}
    try{window.__narradorSpeech49?.stop?.();}catch(_){}
    try{speechSynthesis.cancel();}catch(_){}
  }

  async function goToPosition(book,bookmark){
    if(!book||!bookmark)return;
    book.lastChapter=Math.max(0,Math.min(Number(bookmark.chapterIndex||0),Math.max(0,book.chapters.length-1)));
    book.lastSegment=Math.max(0,Number(bookmark.segmentIndex||0));book.lastPlayedAt=Date.now();
    await putBook(book);closeSheet();window.__narradorUnlockAudio?.();
    const pref=(()=>{try{return JSON.parse(localStorage.getItem("narrador-voice-prefs-v10")||"{}")}catch(_){return{}}})();
    if(pref.engine==="kokoro"){
      const job=await getJob(book.id);if(job?.state==="ready"){job.playChapter=book.lastChapter;job.playBlock=Math.max(0,Number(bookmark.aiBlock||0));job.lastPlayedAt=Date.now();await putJob(job);try{window.__narradorAudiobook50?.stop?.(false);}catch(_){}window.__narradorAudiobook50?.play?.(book);return;}
      toast("Ese audiolibro IA todavía no está preparado.");return;
    }
    try{window.__narradorSpeech49?.stop?.(false);speechSynthesis.cancel();speechSynthesis.resume();}catch(_){}
    window.__narradorSpeech49?.playBook?.(book);
  }

  function installStyle(){
    if($("#daily56Style"))return;const style=document.createElement("style");style.id="daily56Style";style.textContent=`
      .homeDaily56{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:7px;margin:0 0 10px}.homeDaily56 button{min-width:0;height:39px;border:1px solid #dfe5ef;border-radius:12px;background:#fff;color:#354158;padding:0 8px;font-size:11px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;touch-action:manipulation}.homeDaily56 button:active{transform:scale(.97)}
      .bookmarksCard56{width:100%;margin:14px 0 0;border:1px solid var(--line,#e3e7ef);border-radius:17px;background:var(--surface,#fff);padding:13px 14px;display:flex;align-items:center;gap:12px;text-align:left;color:var(--text,#111827)}.bookmarksCard56 .star56{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:var(--accentSoft,#eef3ff);color:var(--accent,#2f6df6);font-size:18px}.bookmarksCard56 .meta56{min-width:0;flex:1}.bookmarksCard56 strong,.bookmarksCard56 span{display:block}.bookmarksCard56 span{font-size:11px;color:var(--muted,#7a8495);margin-top:3px}
      #dailySheet56{position:fixed;inset:0;z-index:2147483460;display:none}#dailySheet56.open{display:block}.daily56Back{position:absolute;inset:0;background:rgba(15,23,42,.44);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}.daily56Panel{position:absolute;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:570px;max-height:calc(100dvh - 42px);overflow:auto;margin:auto;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--line,#e4e8ef);border-radius:27px;padding:10px 18px 20px;box-shadow:0 28px 72px rgba(15,23,42,.27)}.daily56Handle{width:42px;height:5px;border-radius:9px;background:#cfd6e1;margin:2px auto 12px}.daily56Head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.daily56Head h3{margin:0;font-size:24px}.daily56Close{border:0;background:var(--surface2,#eef2f7);color:var(--text,#4b5563);width:38px;height:38px;border-radius:50%;font-size:18px}.daily56List{display:grid;gap:8px}.daily56Item{display:flex;align-items:center;gap:10px;width:100%;border:1px solid var(--line,#e2e7ef);border-radius:14px;background:var(--surface2,#f8faff);color:var(--text,#111827);padding:11px 12px;text-align:left}.daily56Item.active{border-color:#7aa0ff;background:var(--accentSoft,#eef3ff)}.daily56Item .grow56{min-width:0;flex:1}.daily56Item strong,.daily56Item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.daily56Item span{font-size:11px;color:var(--muted,#7a8495);margin-top:3px}.daily56Delete{border:0;background:transparent;color:#d04747;font-size:17px;padding:8px}.daily56Sleep{display:grid;grid-template-columns:1fr 1fr;gap:8px}.daily56Sleep button{min-height:50px;border:1px solid var(--line,#dfe5ef);border-radius:14px;background:var(--surface2,#f8faff);color:var(--text,#111827);font-weight:850}.daily56Sleep .wide56{grid-column:1/-1;background:var(--accentSoft,#eef3ff);color:var(--accent,#2f6df6)}.readerBookmark56{min-width:42px!important}
      html[data-narrador-theme="dark"] .homeDaily56 button{background:#151c28!important;color:#e8edf5!important;border-color:#2b3749!important}
    `;document.head.appendChild(style);
  }

  function ensureSheet(){
    if($("#dailySheet56"))return;const root=document.createElement("div");root.id="dailySheet56";root.innerHTML=`<div class="daily56Back"></div><div class="daily56Panel"><div class="daily56Handle"></div><div class="daily56Head"><h3 id="daily56Title">Narrador</h3><button class="daily56Close" type="button">×</button></div><div id="daily56Body"></div></div>`;document.body.appendChild(root);root.querySelector(".daily56Back").onclick=closeSheet;root.querySelector(".daily56Close").onclick=closeSheet;
  }
  function closeSheet(){$("#dailySheet56")?.classList.remove("open");document.body.classList.remove("daily56Open");}
  function showSheet(title,html){ensureSheet();$("#daily56Title").textContent=title;$("#daily56Body").innerHTML=html;$("#dailySheet56").classList.add("open");document.body.classList.add("daily56Open");}

  async function openChapters(){
    await readBooks();const book=homeBook();if(!book)return;const current=Math.max(0,Number(book.lastChapter||0));
    showSheet("Capítulos",`<div class="daily56List">${book.chapters.map((c,i)=>`<button class="daily56Item ${i===current?"active":""}" type="button" data-chapter56="${i}"><div class="grow56"><strong>${i+1}. ${escapeHTML(c.title||`Capítulo ${i+1}`)}</strong><span>${i===current?"Capítulo actual":"Ir a este capítulo"}</span></div><span>›</span></button>`).join("")}</div>`);
    $$("[data-chapter56]").forEach(btn=>btn.onclick=()=>goToPosition(book,{chapterIndex:Number(btn.dataset.chapter56),segmentIndex:0,aiBlock:0}));
  }
  function escapeHTML(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

  async function openBookmarks(book=homeBook()){
    await readBooks();book=books.find(b=>String(b.id)===String(book?.id))||homeBook();if(!book)return;
    const marks=[...(book.bookmarks||[])].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    showSheet("Marcadores",marks.length?`<div class="daily56List">${marks.map(m=>`<div class="daily56Item"><button type="button" class="grow56" data-mark56="${m.id}" style="border:0;background:transparent;color:inherit;text-align:left;padding:0"><strong>${escapeHTML(m.label||`Capítulo ${Number(m.chapterIndex||0)+1}`)}</strong><span>Guardado ${new Date(m.createdAt||Date.now()).toLocaleDateString()}</span></button><button class="daily56Delete" type="button" data-delmark56="${m.id}" aria-label="Eliminar marcador">×</button></div>`).join("")}</div>`:`<p style="text-align:center;padding:22px 6px;color:var(--muted)">Todavía no tienes marcadores en este libro.</p>`);
    $$("[data-mark56]").forEach(btn=>btn.onclick=()=>{const m=marks.find(x=>String(x.id)===btn.dataset.mark56);if(m)goToPosition(book,m);});
    $$("[data-delmark56]").forEach(btn=>btn.onclick=async()=>{book.bookmarks=(book.bookmarks||[]).filter(x=>String(x.id)!==btn.dataset.delmark56);await putBook(book);openBookmarks(book);decorateBookmarkCard();});
  }

  function clearSleep(silent=false){clearTimeout(sleepTimeout);clearInterval(sleepWatch);sleepTimeout=0;sleepWatch=0;sleepState=null;try{sessionStorage.removeItem("narrador-sleep-v56");}catch(_){}updateSleepLabels();if(!silent)toast("Temporizador cancelado.");}
  function saveSleep(){try{sessionStorage.setItem("narrador-sleep-v56",JSON.stringify(sleepState));}catch(_){}updateSleepLabels();}
  async function setSleepMinutes(minutes){clearSleep(true);sleepState={type:"time",endsAt:Date.now()+minutes*60000};saveSleep();sleepTimeout=setTimeout(()=>{stopAll();clearSleep(true);toast("Temporizador terminado. Reproducción detenida.",4200);},minutes*60000);toast(`Temporizador activado por ${minutes} minutos.`);closeSheet();}
  async function setSleepChapter(){
    await readBooks();const book=homeBook();if(!book)return;const chapter=Math.max(0,Number(book.lastChapter||0));if(chapter>=book.chapters.length-1){toast("Estás en el último capítulo; la reproducción terminará al final del libro.");closeSheet();return;}
    clearSleep(true);sleepState={type:"chapter",bookId:String(book.id),chapter};saveSleep();sleepWatch=setInterval(checkChapterSleep,800);toast("Narrador se detendrá al terminar este capítulo.",3800);closeSheet();
  }
  async function checkChapterSleep(){
    if(!sleepState)return;if(sleepState.type==="time"){if(Date.now()>=sleepState.endsAt){stopAll();clearSleep(true);toast("Temporizador terminado.");}return;}
    if(sleepState.type!=="chapter")return;await readBooks();const b=books.find(x=>String(x.id)===sleepState.bookId);if(!b)return;if(Number(b.lastChapter||0)!==Number(sleepState.chapter)){stopAll();clearSleep(true);toast("Capítulo terminado. Reproducción detenida.",4200);}
  }
  function restoreSleep(){try{sleepState=JSON.parse(sessionStorage.getItem("narrador-sleep-v56")||"null");}catch(_){sleepState=null;}if(!sleepState)return;if(sleepState.type==="time"){const left=sleepState.endsAt-Date.now();if(left<=0){stopAll();clearSleep(true);return;}sleepTimeout=setTimeout(()=>{stopAll();clearSleep(true);toast("Temporizador terminado.");},left);}else if(sleepState.type==="chapter")sleepWatch=setInterval(checkChapterSleep,800);updateSleepLabels();}
  function openSleep(){
    showSheet("Temporizador",`<div class="daily56Sleep"><button data-sleep56="10">10 min</button><button data-sleep56="20">20 min</button><button data-sleep56="30">30 min</button><button data-sleep56="45">45 min</button><button data-sleep56="60">60 min</button><button data-sleep56="0">Cancelar</button><button class="wide56" data-sleepchapter56="1">☾ Al terminar este capítulo</button></div>`);
    $$("[data-sleep56]").forEach(btn=>btn.onclick=()=>Number(btn.dataset.sleep56)?setSleepMinutes(Number(btn.dataset.sleep56)):(clearSleep(),closeSheet()));$("[data-sleepchapter56]").onclick=setSleepChapter;
  }
  function sleepText(){if(!sleepState)return"☾ Dormir";if(sleepState.type==="chapter")return"☾ Fin capítulo";return`☾ ${Math.max(1,Math.ceil((sleepState.endsAt-Date.now())/60000))} min`;}
  function updateSleepLabels(){$$("[data-home-sleep56]").forEach(b=>b.textContent=sleepText());}

  function decorateHome(){
    installStyle();const host=$("#homeFeatured");if(!host)return;const anchor=host.querySelector(".homeSkip55")||host.querySelector(".v18Transport");if(!anchor)return;
    let row=host.querySelector(".homeDaily56");if(!row){row=document.createElement("div");row.className="homeDaily56";row.innerHTML=`<button type="button" data-home-chapters56>☷ Capítulos</button><button type="button" data-home-bookmark56>☆ Marcador</button><button type="button" data-home-sleep56>☾ Dormir</button>`;anchor.insertAdjacentElement("afterend",row);row.onclick=e=>{if(e.target.closest("[data-home-chapters56]"))openChapters();else if(e.target.closest("[data-home-bookmark56]"))addBookmark(homeBook(),"home");else if(e.target.closest("[data-home-sleep56]"))openSleep();};}
    const b=homeBook();if(b){const chapter=Math.max(0,Math.min(Number(b.lastChapter||0),b.chapters.length-1)),btn=row.querySelector("[data-home-chapters56]");if(btn)btn.textContent=`☷ ${chapter+1}. ${b.chapters[chapter]?.title||"Capítulo"}`;}
    updateSleepLabels();
  }

  function decorateReader(){
    const toolbar=$("#readerView .readerToolbar");if(!toolbar||$("#readerBookmark56"))return;const btn=document.createElement("button");btn.id="readerBookmark56";btn.className="readerBookmark56";btn.type="button";btn.textContent="☆";btn.setAttribute("aria-label","Guardar marcador");toolbar.insertBefore(btn,toolbar.querySelector("#readerListen")||null);btn.onclick=async()=>{await readBooks();const title=$("#readerBookTitle")?.textContent?.trim(),book=books.find(b=>String(b.title||"").trim()===title);if(!book)return;const idx=Math.max(0,Number($("#readerChapterSelect")?.value||book.lastChapter||0));book.lastChapter=idx;book.lastSegment=0;await addBookmark(book,"reader");};
  }

  function decorateBookmarkCard(){
    const view=$("#bookView"),section=view?.querySelector(".sectionTitle");if(!view||!section)return;let card=$("#bookmarksCard56");if(!card){card=document.createElement("button");card.id="bookmarksCard56";card.className="bookmarksCard56";card.type="button";card.innerHTML=`<span class="star56">★</span><span class="meta56"><strong>Marcadores</strong><span id="bookmarksCount56">Guarda y vuelve a tus partes favoritas</span></span><span>›</span>`;section.insertAdjacentElement("beforebegin",card);card.onclick=()=>openBookmarks(displayedBook());}
    const b=displayedBook(),count=(b?.bookmarks||[]).length,span=$("#bookmarksCount56");if(span)span.textContent=count?`${count} marcador${count===1?"":"es"} guardado${count===1?"":"s"}`:"Guarda y vuelve a tus partes favoritas";
  }

  async function refresh(){if(refreshing)return;refreshing=true;try{await readBooks();await retrofitAuthors();decorateHome();decorateReader();decorateBookmarkCard();}finally{refreshing=false;}}
  function init(){installStyle();ensureSheet();refresh();restoreSleep();const host=$("#homeFeatured");if(host&&!observer){observer=new MutationObserver(()=>setTimeout(()=>refresh(),20));observer.observe(host,{childList:true});}setInterval(()=>{if(!document.hidden){decorateHome();decorateBookmarkCard();updateSleepLabels();}},15000);}

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
  window.addEventListener("pageshow",()=>setTimeout(refresh,120));window.addEventListener("narrador:auth-ready",()=>setTimeout(refresh,160));window.addEventListener("narrador:boot-ready",()=>setTimeout(refresh,160));document.addEventListener("visibilitychange",()=>{if(!document.hidden){checkChapterSleep();refresh();}});
  window.__narradorDaily56={bookmark:()=>addBookmark(homeBook()),chapters:openChapters,sleep:openSleep,bookmarks:()=>openBookmarks(homeBook())};
})();
