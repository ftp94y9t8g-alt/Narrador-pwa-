// Narrador v68 — responsive reader geometry, metadata/i18n sync and text cleanup.
// Keeps stable playback/import engines intact.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  let repairing = false;
  let properNames = new Set();
  let properBookId = "";
  let scheduled = 0;

  const supported = new Set(["es","en","fr","pt","it","de"]);
  const locale = (() => {
    const html = String(document.documentElement.dataset.narradorLocale || "").toLowerCase();
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  })();

  const D = {
    speed:{es:"Velocidad",en:"Speed",fr:"Vitesse",pt:"Velocidade",it:"Velocità",de:"Tempo"},
    done:{es:"Listo",en:"Done",fr:"Terminé",pt:"Concluído",it:"Fine",de:"Fertig"},
    speedHint:{es:"Desliza para ajustar la velocidad de narración.",en:"Slide to adjust narration speed.",fr:"Faites glisser pour régler la vitesse de narration.",pt:"Deslize para ajustar a velocidade da narração.",it:"Scorri per regolare la velocità di narrazione.",de:"Schiebe, um die Erzählgeschwindigkeit anzupassen."},
    narration:{es:"Narración",en:"Narration",fr:"Narration",pt:"Narração",it:"Narrazione",de:"Erzählung"},
    engine:{es:"Motor de voz",en:"Voice engine",fr:"Moteur vocal",pt:"Motor de voz",it:"Motore vocale",de:"Sprachengine"},
    language:{es:"Idioma",en:"Language",fr:"Langue",pt:"Idioma",it:"Lingua",de:"Sprache"},
    voice:{es:"Voz",en:"Voice",fr:"Voix",pt:"Voz",it:"Voce",de:"Stimme"},
    style:{es:"Estilo",en:"Style",fr:"Style",pt:"Estilo",it:"Stile",de:"Stil"},
    automatic:{es:"Automático",en:"Automatic",fr:"Automatique",pt:"Automático",it:"Automatico",de:"Automatisch"},
    iphoneInstant:{es:"iPhone · instantáneo",en:"iPhone · instant",fr:"iPhone · instantané",pt:"iPhone · instantâneo",it:"iPhone · istantaneo",de:"iPhone · sofort"},
    aiNatural:{es:"IA · más natural",en:"AI · more natural",fr:"IA · plus naturelle",pt:"IA · mais natural",it:"IA · più naturale",de:"KI · natürlicher"},
    warm:{es:"Cálida",en:"Warm",fr:"Chaleureux",pt:"Quente",it:"Calda",de:"Warm"},
    cinematic:{es:"Cinematográfica",en:"Cinematic",fr:"Cinématique",pt:"Cinematográfica",it:"Cinematografica",de:"Filmisch"},
    expressive:{es:"Expresiva",en:"Expressive",fr:"Expressif",pt:"Expressiva",it:"Espressiva",de:"Ausdrucksstark"},
    calm:{es:"Calmada",en:"Calm",fr:"Calme",pt:"Calma",it:"Calma",de:"Ruhig"}
  };
  const t = key => D[key]?.[locale] || D[key]?.en || key;

  function currentBookContext(){
    const host = $("#homeFeatured");
    return {
      id: host?.dataset?.bookId || "",
      chapter: Math.max(0, Number(host?.dataset?.chapter || 0) || 0)
    };
  }

  function openDB(){
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME); } catch (_) { resolve(null); return; }
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onupgradeneeded = () => { try { req.transaction?.abort(); } catch (_) {} resolve(null); };
      req.onsuccess = () => resolve(req.result);
    });
  }

  async function readBook(id){
    if (!id) return null;
    const db = await openDB();
    if (!db || !db.objectStoreNames.contains(STORE)) { try { db?.close(); } catch (_) {} return null; }
    return new Promise(resolve => {
      try {
        const req = db.transaction(STORE,"readonly").objectStore(STORE).get(id);
        req.onerror = () => { try { db.close(); } catch (_) {} resolve(null); };
        req.onsuccess = () => { const row=req.result||null; try { db.close(); } catch (_) {} resolve(row); };
      } catch (_) { try { db.close(); } catch (_) {} resolve(null); }
    });
  }

  function titleWord(s=""){
    const raw=String(s);
    if (!raw) return raw;
    return raw[0].toLocaleUpperCase(locale)+raw.slice(1).toLocaleLowerCase(locale);
  }

  async function refreshProperNames(){
    const {id}=currentBookContext();
    if (!id || id===properBookId) return;
    const book=await readBook(id);
    if (!book) return;
    properBookId=id;
    const set=new Set();
    const add=w=>{ const x=String(w||"").trim(); if(x.length>1)set.add(x.toLocaleLowerCase(locale)); };
    String(book.title||"").match(/[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,}/g)?.forEach(add);
    String(book.author||"").match(/[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,}/g)?.forEach(add);
    const text=(book.chapters||[]).slice(0,20).map(c=>c.text||"").join(" ").slice(0,250000);
    const re=/(?:\b(?:a|de|del|con|por|para|y|o|en|que|como|se|su|sus|mi|mis|tu|tus)\s+|[,;:]\s+)([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,})\b/g;
    let m;
    while((m=re.exec(text))) add(m[1]);
    properNames=set;
  }

  function isShouting(text=""){
    const letters=String(text).match(/[A-Za-zÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÇÃÕ]/g)||[];
    if(letters.length<4)return false;
    const upper=letters.filter(c=>c===c.toUpperCase()&&c!==c.toLowerCase()).length;
    return upper/letters.length>.82;
  }

  function smartChapterCase(text=""){
    const raw=String(text).replace(/\s+/g," ").trim();
    if(!raw||!isShouting(raw))return raw;
    const m=raw.match(/^((?:\d{1,3}|[IVXLCDM]{1,8})\s*(?:[—–\-.:)]\s*)?)(.*)$/i);
    const lead=m?.[1]||"";
    let rest=(m?.[2]||raw).toLocaleLowerCase(locale);
    rest=rest.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i,c=>c.toLocaleUpperCase(locale));
    rest=rest.replace(/\b([a-záéíóúüñàèìòùâêîôûäëïöüçãõ]{2,})\b/gi,(w)=>properNames.has(w.toLocaleLowerCase(locale))?titleWord(w):w);
    return `${lead}${rest}`.trim();
  }

  function stripDuplicateChapterMarker(text=""){
    return String(text).replace(/^\s*(?:\d{1,3}|[IVXLCDM]{1,8})\s*(?:[—–\-.:)]\s*)?/i,"").trim();
  }

  function cleanReaderLine(text=""){
    let s=String(text)
      .normalize("NFKC")
      .replace(/\u00ad/g,"")
      .replace(/[\u200B-\u200D\uFEFF]/g,"")
      .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\s*\n\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g,"$1$2")
      .replace(/\s*\n\s*/g," ")
      .replace(/[\t ]{2,}/g," ")
      .replace(/\s+([,.;:!?…])/g,"$1")
      .replace(/([¿¡])\s+/g,"$1")
      .trim();
    s=s.replace(/\b([BCDFGHJKLMNPQRSTVWXZÁÉÍÓÚÜÑ])\s+([A-ZÁÉÍÓÚÜÑ]{2,})\b/g,"$1$2");
    return s;
  }

  function sourceTextForParagraph(p){
    let out="";
    for(const node of [...p.childNodes]) out += node.nodeName==="BR" ? "\n" : (node.textContent||"");
    return out;
  }

  function repairReaderText(){
    if(repairing)return;
    const root=$("#readerText");
    if(!root)return;
    repairing=true;
    try{
      root.querySelectorAll("p").forEach(p=>{
        const clean=cleanReaderLine(sourceTextForParagraph(p));
        if(clean&&(p.childElementCount||p.textContent!==clean))p.textContent=clean;
      });
    }finally{repairing=false;}
  }

  function repairChapterLabels(){
    $$("#chapters .chapterRow h4,#dailySheet56 [data-chapter56] strong,#readerChapterTitle").forEach(el=>{
      const source=el.dataset.n64Original||el.dataset.n68Source||el.textContent||"";
      if(!el.dataset.n68Source)el.dataset.n68Source=source;
      const fixed=smartChapterCase(source);
      if(fixed&&el.textContent!==fixed)el.textContent=fixed;
    });

    const now=$("#n61NowChapter");
    if(now){
      const raw=now.textContent||"";
      const m=raw.match(/^([^·:]+\d+)\s*[·:]\s*(.+)$/i);
      if(m){
        const second=stripDuplicateChapterMarker(smartChapterCase(m[2]));
        const next=`${m[1].trim()} · ${second}`;
        if(second&&now.textContent!==next)now.textContent=next;
      }
    }

    const top=$("#n65ReaderTopTitle");
    const strong=top?.querySelector("strong");
    const sub=top?.querySelector("span");
    if(strong&&sub&&/\d/.test(strong.textContent||"")){
      const source=sub.dataset.n68Source||sub.textContent||"";
      if(!sub.dataset.n68Source)sub.dataset.n68Source=source;
      const next=stripDuplicateChapterMarker(smartChapterCase(source));
      if(next&&sub.textContent!==next)sub.textContent=next;
    }
  }

  function readerBackground(){
    const theme=$("#readerView")?.dataset.n64ReaderTheme||"light";
    return theme==="sepia"?"#F4ECD8":theme==="dark"?"#14171F":"#F4F6FC";
  }

  function syncReaderViewportState(){
    const active=$("#readerView")?.classList.contains("active");
    document.body.classList.toggle("n68ReaderActive",!!active);
    if(active)document.body.style.setProperty("--n68-reader-bg",readerBackground());
    else document.body.style.removeProperty("--n68-reader-bg");
  }

  function localizeSpeedSheet(){
    const sheet=$("#homeControlSheet45");
    if(!sheet)return;
    const speedOpen=sheet.classList.contains("open")&&!$("#homeSpeedPane45")?.classList.contains("hidden");
    const voiceOpen=sheet.classList.contains("open")&&!$("#homeVoicePane45")?.classList.contains("hidden");
    const title=$("#homeSheetTitle45");
    if(title){
      const next=speedOpen?t("speed"):voiceOpen?t("narration"):title.textContent;
      if(next&&title.textContent!==next)title.textContent=next;
    }
    const done=sheet.querySelector(".homeSheetHead45 [data-home45-close]");
    if(done&&done.textContent!==t("done"))done.textContent=t("done");
    const hint=sheet.querySelector(".homeSpeedHint45");
    if(hint&&hint.textContent!==t("speedHint"))hint.textContent=t("speedHint");

    if(voiceOpen){
      const labels=$$("#homeVoicePane45 label");
      const names=[t("engine"),t("language"),t("voice"),t("style")];
      labels.forEach((label,i)=>{
        const select=label.querySelector("select");
        if(!select||!names[i])return;
        for(const node of [...label.childNodes]) if(node.nodeType===Node.TEXT_NODE){node.textContent=names[i];break;}
      });
      const engine=$("#homeEngine45");
      if(engine?.options?.length>=2){engine.options[0].text=t("iphoneInstant");engine.options[1].text=t("aiNatural");}
      const language=$("#homeLanguage45");
      if(language?.options?.length)language.options[0].text=t("automatic");
      const style=$("#homeStyle45");
      if(style?.options?.length>=4){style.options[0].text=t("warm");style.options[1].text=t("cinematic");style.options[2].text=t("expressive");style.options[3].text=t("calm");}
    }
  }

  function openNativeSpeedSheet(){
    const target=$("#homeFeatured [data-home45-action='speed']")||$("[data-home45-action='speed']");
    if(target){
      try{
        target.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:868,pointerType:"touch",isPrimary:true}));
        setTimeout(localizeSpeedSheet,0);
        return true;
      }catch(_){try{target.dispatchEvent(new Event("pointerdown",{bubbles:true,cancelable:true}));setTimeout(localizeSpeedSheet,0);return true;}catch(__){}}
    }
    const sheet=$("#homeControlSheet45"),speedPane=$("#homeSpeedPane45"),voicePane=$("#homeVoicePane45");
    if(sheet&&speedPane){voicePane?.classList.add("hidden");speedPane.classList.remove("hidden");sheet.classList.add("open");document.body.classList.add("homeSheetOpen45");localizeSpeedSheet();return true;}
    return false;
  }

  function openReaderFromNowPlaying(){
    const {id,chapter}=currentBookContext();
    if(!id)return false;
    $("#n61NowPlaying")?.classList.remove("open");
    try{if(typeof window.__narradorOpenReader==="function"){window.__narradorOpenReader(id,chapter,"home");setTimeout(syncAll,0);return true;}}catch(_){}
    return false;
  }

  async function syncMediaSession(){
    if(!("mediaSession" in navigator)||typeof MediaMetadata==="undefined")return;
    const {id,chapter}=currentBookContext();
    if(!id)return;
    const book=await readBook(id);
    if(!book)return;
    const ci=Math.max(0,Math.min(chapter,Math.max(0,(book.chapters?.length||1)-1)));
    const ch=book.chapters?.[ci];
    const chapterTitle=smartChapterCase(ch?.title||"");
    try{
      navigator.mediaSession.metadata=new MediaMetadata({
        title:chapterTitle||book.title||"Narrador",
        artist:book.author||"Narrador",
        album:book.title||"Narrador",
        artwork:book.coverDataUrl?[{src:book.coverDataUrl,type:"image/jpeg"}]:[]
      });
    }catch(_){}
  }

  function syncAll(){
    document.documentElement.classList.add("n67Immersive");
    syncReaderViewportState();
    repairReaderText();
    repairChapterLabels();
    localizeSpeedSheet();
  }

  function scheduleSync(delay=0){
    clearTimeout(scheduled);
    scheduled=setTimeout(()=>{refreshProperNames().finally(()=>{syncAll();syncMediaSession();});},delay);
  }

  function installHandlers(){
    document.addEventListener("click",event=>{
      const speed=event.target?.closest?.("#n61NowPlaying [data-n61-action='speed']");
      if(speed){event.preventDefault();event.stopImmediatePropagation();openNativeSpeedSheet();return;}
      const read=event.target?.closest?.("#n64ReadWhile");
      if(read){event.preventDefault();event.stopImmediatePropagation();openReaderFromNowPlaying();return;}
      setTimeout(()=>scheduleSync(0),0);
    },true);
  }

  function installObservers(){
    const reader=$("#readerView");
    if(reader&&reader.dataset.n68Observed!=="1"){
      reader.dataset.n68Observed="1";
      new MutationObserver(()=>scheduleSync(0)).observe(reader,{childList:true,subtree:true,attributes:true,attributeFilter:["class","data-n64-reader-theme"]});
    }
    const host=$("#homeFeatured");
    if(host&&host.dataset.n68Observed!=="1"){
      host.dataset.n68Observed="1";
      new MutationObserver(()=>scheduleSync(10)).observe(host,{attributes:true,attributeFilter:["data-book-id","data-chapter"],childList:true,subtree:false});
    }
    const now=$("#n61NowPlaying");
    if(now&&now.dataset.n68Observed!=="1"){
      now.dataset.n68Observed="1";
      new MutationObserver(()=>scheduleSync(0)).observe(now,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});
    }
    const speedSheet=$("#homeControlSheet45");
    if(speedSheet&&speedSheet.dataset.n68Observed!=="1"){
      speedSheet.dataset.n68Observed="1";
      new MutationObserver(localizeSpeedSheet).observe(speedSheet,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});
    }
  }

  function install(){
    document.documentElement.classList.add("n67Immersive");
    installHandlers();
    installObservers();
    scheduleSync(0);
    window.addEventListener("pageshow",()=>{installObservers();scheduleSync(30);});
    window.addEventListener("focus",()=>{installObservers();scheduleSync(40);});
    document.addEventListener("visibilitychange",()=>{if(!document.hidden){installObservers();scheduleSync(40);}});
    setTimeout(()=>{installObservers();scheduleSync(0);},300);
    setTimeout(()=>{installObservers();scheduleSync(0);},1000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  window.__narradorUX67={repairReaderText,openNativeSpeedSheet,openReaderFromNowPlaying,syncMediaSession,syncAll};
})();
