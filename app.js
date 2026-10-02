import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const $ = (s) => document.querySelector(s);
const views = ["library", "processing", "book", "player"];
const DB_NAME = "narrador-db-v1";
const STORE = "books";
const PARSER_VERSION = 3;
let db;

const state = {
  books: [], currentBook: null, currentChapter: 0,
  voices: [], segments: [], segmentIndex: 0, speaking: false,
  kokoro: null, kokoroLoading: null, audio: null, audioUrl: null,
};

const STYLE = {
  warm: { rate: 0.95, pitch: 1.00, pause: 210, aiSpeed: 0.96 },
  cinematic: { rate: 0.90, pitch: 0.97, pause: 300, aiSpeed: 0.92 },
  expressive: { rate: 1.00, pitch: 1.03, pause: 180, aiSpeed: 1.00 },
  calm: { rate: 0.86, pitch: 0.99, pause: 340, aiSpeed: 0.88 },
};

const AI_VOICES = {
  es: [
    ["ef_dora", "Dora · Español · femenina"],
    ["em_alex", "Alex · Español · masculina"],
    ["em_santa", "Santa · Español · masculina"],
  ],
  en: [
    ["af_heart", "Heart · English US · femenina"],
    ["af_bella", "Bella · English US · femenina"],
    ["am_michael", "Michael · English US · masculina"],
    ["bm_george", "George · English UK · masculina"],
  ],
};

function showView(name) {
  views.forEach((v) => $(`#${v}View`).classList.toggle("active", v === name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function toast(message, ms = 3000) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), ms);
}

function initials(title = "Narrador") {
  return title.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]?.toUpperCase()).join("") || "NV";
}

function escapeHtml(s="") {
  return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function cleanText(text) {
  return text
    .replace(/\u00ad/g,"")
    .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g,"$1$2")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .replace(/[ \t]{2,}/g," ")
    .trim();
}

function estimateMinutes(chars) {
  return Math.max(1, Math.round(chars / 900));
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onsuccess=()=>{db=req.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}

function dbAll(){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess=()=>resolve(r.result||[]);
    r.onerror=()=>reject(r.error);
  });
}

function dbPut(book){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(STORE,"readwrite").objectStore(STORE).put(book);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

function dbDelete(id){
  return new Promise((resolve,reject)=>{
    const r=db.transaction(STORE,"readwrite").objectStore(STORE).delete(id);
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

function isChapterHeading(line="") {
  const s=line.trim().replace(/\s+/g," ");
  if (!s || s.length > 120) return false;
  if (/^(?:(?:chapter|cap[ií]tulo|part|parte|book|libro)\s+(?:[ivxlcdm\d]+|[a-záéíóúñ]+)|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n)\b.*$/i.test(s)) return true;
  if (/^(?:[IVXLCDM]{1,10}|\d{1,3})\s*[–—-]\s*\S.{0,100}$/i.test(s)) return true;
  return false;
}

function normalizedChapterTitle(line="") {
  return line.trim().replace(/\s+/g," ");
}

async function migrateStoredBook(book) {
  if (!book?.chapters?.length || book.parserVersion >= PARSER_VERSION) return false;
  const parts = [];
  for (const chapter of book.chapters) {
    if (chapter.title && chapter.title !== "Inicio" && isChapterHeading(chapter.title)) parts.push(chapter.title);
    if (chapter.text) parts.push(chapter.text);
  }
  const lines = cleanText(parts.join("\n\n")).split("\n").map(x=>x.trim()).filter(Boolean);
  const rebuilt = [];
  let current = null;
  let preface = [];
  for (const line of lines) {
    if (isChapterHeading(line)) {
      if (current && current.text.trim()) {
        current.text = cleanText(current.text);
        rebuilt.push(current);
      }
      current = { title: normalizedChapterTitle(line), text: "", startPage: null };
      continue;
    }
    if (current) current.text += line + "\n";
    else preface.push(line);
  }
  if (current && current.text.trim()) {
    current.text = cleanText(current.text);
    rebuilt.push(current);
  }
  if (rebuilt.length >= 3 && rebuilt.length > book.chapters.length) {
    const prefaceText = cleanText(preface.join("\n"));
    if (prefaceText.length > 1200) rebuilt.unshift({title:"Inicio", text:prefaceText, startPage:null});
    book.chapters = rebuilt;
    book.charCount = rebuilt.reduce((a,c)=>a+c.text.length,0);
    book.parserVersion = PARSER_VERSION;
    book.lastChapter = Math.min(book.lastChapter||0, rebuilt.length-1);
    book.lastSegment = 0;
    await dbPut(book);
    return true;
  }
  book.parserVersion = PARSER_VERSION;
  await dbPut(book);
  return false;
}

async function loadBooks(){
  state.books=(await dbAll()).sort((a,b)=>b.createdAt-a.createdAt);
  let repaired=0;
  for (const book of state.books) if (await migrateStoredBook(book)) repaired++;
  if (repaired) {
    state.books=(await dbAll()).sort((a,b)=>b.createdAt-a.createdAt);
    toast("Capítulos reparados automáticamente.");
  }
  renderLibrary();
}

function renderLibrary(){
  const wrap=$("#library");
  wrap.innerHTML="";
  $("#emptyState").classList.toggle("hidden",state.books.length>0);
  $("#libraryContent").classList.toggle("hidden",state.books.length===0);
  $("#clearBtn").classList.toggle("hidden",state.books.length===0);

  const continueCard=$("#continueCard");
  if (state.books.length) {
    const b=state.books[0];
    const ci=Math.max(0,Math.min(b.lastChapter||0,b.chapters.length-1));
    const ch=b.chapters[ci];
    continueCard.classList.remove("hidden");
    continueCard.innerHTML=`<button class="continueInner"><div class="continueCover">${initials(b.title)}</div><div class="continueText"><div class="eyebrow">CONTINUAR ESCUCHANDO</div><h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(ch?.title || `Capítulo ${ci+1}`)}</p></div><div class="continuePlay">▶</div></button>`;
    continueCard.querySelector("button").onclick=()=>{ openBook(b.id); openPlayer(ci); };
  } else {
    continueCard.classList.add("hidden");
    continueCard.innerHTML="";
  }

  state.books.forEach(book=>{
    const btn=document.createElement("button");
    btn.className="bookRow";
    btn.innerHTML=`<div class="miniCover">${initials(book.title)}</div><div class="grow"><h4>${escapeHtml(book.title)}</h4><p>${book.chapters.length} capítulos · ~${estimateMinutes(book.charCount)} min</p></div><div class="chev">›</div>`;
    btn.onclick=()=>openBook(book.id);
    wrap.appendChild(btn);
  });
}

async function extractPdf(file){
  const buffer=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buffer}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    $("#processingStatus").textContent=`Leyendo página ${i} de ${pdf.numPages}`;
    $("#progressBar").style.width=`${Math.round((i/pdf.numPages)*74)}%`;
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    let out="",lastY=null;
    for(const item of content.items){
      const y=Math.round(item.transform?.[5]??0);
      if(lastY!==null&&Math.abs(y-lastY)>5) out+="\n";
      out+=item.str+" ";
      lastY=y;
    }
    pages.push(cleanText(out));
    await new Promise(r=>setTimeout(r,0));
  }
  return {pages,numPages:pdf.numPages};
}

function detectChapters(pages){
  const chapters=[];
  let current={title:"Inicio",text:"",startPage:1};
  for(let i=0;i<pages.length;i++){
    const pageText=pages[i];
    const lines=pageText.split("\n").map(x=>x.trim()).filter(Boolean);
    let hit=-1;
    for(let j=0;j<Math.min(lines.length,16);j++){
      if(isChapterHeading(lines[j])) { hit=j; break; }
    }
    if(hit>=0 && current.text.trim().length>350){
      chapters.push({...current,text:cleanText(current.text)});
      current={title:normalizedChapterTitle(lines[hit]),text:lines.slice(hit+1).join("\n")+"\n",startPage:i+1};
    } else {
      current.text+=pageText+"\n\n";
      if(hit>=0 && current.title==="Inicio") current.title=normalizedChapterTitle(lines[hit]);
    }
  }
  if(current.text.trim()) chapters.push({...current,text:cleanText(current.text)});
  if(chapters.length < 3) {
    const whole=pages.join("\n\n");
    const lines=whole.split("\n").map(x=>x.trim()).filter(Boolean);
    const rebuilt=[];
    let cur=null;
    let preface=[];
    for(const line of lines){
      if(isChapterHeading(line)){
        if(cur && cur.text.trim()){
          cur.text=cleanText(cur.text);
          rebuilt.push(cur);
        }
        cur={title:normalizedChapterTitle(line),text:"",startPage:null};
      } else if(cur) cur.text+=line+"\n";
      else preface.push(line);
    }
    if(cur && cur.text.trim()){
      cur.text=cleanText(cur.text);
      rebuilt.push(cur);
    }
    if(rebuilt.length>=3) {
      const prefaceText=cleanText(preface.join("\n"));
      if(prefaceText.length>1200) rebuilt.unshift({title:"Inicio",text:prefaceText,startPage:null});
      return rebuilt;
    }
  }
  if(chapters.length===1 && chapters[0].text.length>18000){
    const text=chapters[0].text,result=[];
    let pos=0,n=1;
    while(pos<text.length){
      let end=Math.min(pos+12000,text.length);
      if(end<text.length){
        const boundary=text.lastIndexOf("\n\n",end);
        if(boundary>pos+6000) end=boundary;
      }
      result.push({title:`Sección ${n++}`,text:text.slice(pos,end).trim(),startPage:null});
      pos=end;
    }
    return result;
  }
  return chapters;
}

function detectLanguage(text=""){
  const s=text.slice(0,5000).toLowerCase();
  const es=(s.match(/\b(el|la|los|las|que|de|del|una|un|por|para|con|como|pero|había|estaba|era|su|sus)\b/g)||[]).length;
  const en=(s.match(/\b(the|and|of|to|in|was|that|with|for|his|her|had|but|as|you)\b/g)||[]).length;
  return es>=en?"es":"en";
}
function activeLanguage(){
  const val=$("#languageSelect").value;
  if(val!=="auto") return val;
  return detectLanguage(state.currentBook?.chapters?.[0]?.text||"");
}

function makeDirectedSegment(text){
  const t=text.trim();
  return{text:t,dialogue:/^([“\"«—-])/.test(t)||/[”\"»]$/.test(t),question:/\?$/.test(t),exclamation:/!$/.test(t),ellipsis:/…|\.\.\.$/.test(t)};
}
function segmentText(text){
  const paragraphs=text.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean),result=[];
  for(const paragraph of paragraphs){
    const sentences=paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)||[paragraph];
    let buffer="";
    for(const sentence of sentences){
      const s=sentence.trim();
      if((buffer+" "+s).length>330&&buffer){result.push(makeDirectedSegment(buffer));buffer=s;}
      else buffer+=(buffer?" ":"")+s;
    }
    if(buffer) result.push(makeDirectedSegment(buffer));
  }
  return result;
}

function loadVoices(){state.voices=speechSynthesis.getVoices();refreshVoiceOptions();}
function refreshVoiceOptions(){
  const sel=$("#voiceSelect");
  if(!sel) return;
  sel.innerHTML="";
  const engine=$("#engineSelect").value;
  const lang=activeLanguage();
  $("#aiNote").classList.toggle("hidden",engine!=="kokoro");
  if(engine==="kokoro"){
    const list=AI_VOICES[lang]||AI_VOICES.en;
    list.forEach(([id,label])=>{const o=document.createElement("option");o.value=id;o.textContent=label;sel.appendChild(o);});
    return;
  }
  let list=state.voices.filter(v=>v.lang?.toLowerCase().startsWith(lang));
  if(!list.length)list=state.voices;
  list.sort((a,b)=>voiceScore(b)-voiceScore(a)||a.name.localeCompare(b.name));
  list.forEach(v=>{const o=document.createElement("option");o.value=state.voices.indexOf(v);o.textContent=`${v.name} · ${v.lang}${voiceScore(v)>=4?" · recomendada":""}`;sel.appendChild(o);});
}
function voiceScore(v){let n=0;const s=(v.name||"").toLowerCase();if(/premium|enhanced|natural|siri/.test(s))n+=5;if(v.localService)n+=1;if(/^es|^en/i.test(v.lang||""))n+=1;return n;}
function selectedSystemVoice(){return state.voices[Number($("#voiceSelect").value)]||null;}

function systemUtterance(segment){
  const style=STYLE[$("#styleSelect").value]||STYLE.warm;
  const speed=Number($("#speedRange").value);
  const u=new SpeechSynthesisUtterance(segment.text);
  u.rate=Math.max(.65,Math.min(1.25,style.rate*speed));
  u.pitch=style.pitch;
  if(segment.dialogue){u.rate*=.98;u.pitch+=.015}
  if(segment.question)u.pitch+=.025;
  if(segment.exclamation)u.rate*=1.01;
  if(segment.ellipsis)u.rate*=.95;
  const voice=selectedSystemVoice();
  if(voice)u.voice=voice;
  return u;
}
function pauseFor(segment){const base=(STYLE[$("#styleSelect").value]||STYLE.warm).pause;if(segment.question||segment.exclamation)return base+100;if(segment.ellipsis)return base+160;if(segment.dialogue)return base+50;return base;}

async function loadKokoro(){
  if(state.kokoro)return state.kokoro;
  if(state.kokoroLoading)return state.kokoroLoading;
  state.kokoroLoading=(async()=>{
    toast("Preparando voz IA local… la primera vez puede tardar.",6000);
    const mod=await import("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js");
    const {KokoroTTS}=mod;
    state.kokoro=await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX",{dtype:"q8",device:"wasm",progress_callback:(p)=>{if(p?.progress!=null){const pct=Math.round(p.progress);if(pct%20===0)toast(`Descargando voz IA… ${pct}%`,1800);}}});
    toast("Voz IA local lista.");
    return state.kokoro;
  })().catch(err=>{state.kokoroLoading=null;console.error(err);throw err;});
  return state.kokoroLoading;
}

function stopAllAudio(){
  state.speaking=false;
  speechSynthesis.cancel();
  if(state.audio){state.audio.pause();state.audio.src="";state.audio=null;}
  if(state.audioUrl){URL.revokeObjectURL(state.audioUrl);state.audioUrl=null;}
  updatePlayer();
}

function openBook(id){
  stopAllAudio();
  state.currentBook=state.books.find(b=>b.id===id);
  if(!state.currentBook)return;
  $("#bookTitle").textContent=state.currentBook.title;
  $("#bookMeta").textContent=`${state.currentBook.pages} páginas · ${state.currentBook.chapters.length} capítulos`;
  $("#cover").textContent=initials(state.currentBook.title);
  $("#chapterCount").textContent=String(state.currentBook.chapters.length);
  const list=$("#chapters");
  list.innerHTML="";
  state.currentBook.chapters.forEach((chapter,index)=>{
    const btn=document.createElement("button");
    btn.className="chapterRow";
    btn.innerHTML=`<div class="grow"><h4>${escapeHtml(chapter.title||`Capítulo ${index+1}`)}</h4><p>~${estimateMinutes(chapter.text.length)} min</p></div><div class="chev">›</div>`;
    btn.onclick=()=>openPlayer(index);
    list.appendChild(btn);
  });
  refreshVoiceOptions();
  showView("book");
}

function populatePlayerChapterMenu(){
  const sel=$("#playerChapterSelect");
  const chapters=state.currentBook?.chapters||[];
  sel.disabled=false;
  sel.innerHTML=chapters.map((c,i)=>`<option value="${i}">${escapeHtml(`${i+1}. ${c.title||`Capítulo ${i+1}`}`)}</option>`).join("");
  sel.value=String(state.currentChapter);
  $("#prevChapterBtn").disabled=state.currentChapter<=0;
  $("#nextChapterBtn").disabled=state.currentChapter>=chapters.length-1;
}

function openPlayer(index, keepView=false){
  stopAllAudio();
  const chapters=state.currentBook?.chapters||[];
  if(!chapters.length)return toast("Este libro no tiene capítulos disponibles.");
  state.currentChapter=Math.max(0,Math.min(index,chapters.length-1));
  state.segmentIndex=0;
  state.segments=segmentText(chapters[state.currentChapter].text);
  $("#playerCover").textContent=initials(state.currentBook.title);
  $("#playerBook").textContent=state.currentBook.title;
  $("#playerChapter").textContent=chapters[state.currentChapter].title||`Capítulo ${state.currentChapter+1}`;
  populatePlayerChapterMenu();
  updatePlayer();
  saveProgress();
  if(!keepView)showView("player");
}

function updatePlayer(){
  const total=Math.max(1,state.segments.length),current=Math.min(state.segmentIndex,total-1),pct=Math.round((current/Math.max(1,total-1))*100);
  $("#speechProgress").style.width=`${pct}%`;
  $("#speechPercent").textContent=`${pct}%`;
  $("#speechSegment").textContent=`${pct}%`;
  $("#currentText").textContent=state.segments[current]?.text||"No hay texto.";
  $("#playBtn").textContent=state.speaking?"Ⅱ":"▶";
}
async function saveProgress(){if(!state.currentBook)return;state.currentBook.lastChapter=state.currentChapter;state.currentBook.lastSegment=state.segmentIndex;await dbPut(state.currentBook).catch(()=>{});}

function speakSystem(index){
  if(!state.segments.length)return;
  speechSynthesis.cancel();
  state.segmentIndex=Math.max(0,Math.min(index,state.segments.length-1));
  const segment=state.segments[state.segmentIndex],u=systemUtterance(segment);
  u.onstart=()=>{state.speaking=true;updatePlayer()};
  u.onend=()=>{if(!state.speaking)return;if(state.segmentIndex<state.segments.length-1){const wait=pauseFor(segment);state.segmentIndex++;saveProgress();updatePlayer();setTimeout(()=>{if(state.speaking)speakSystem(state.segmentIndex)},wait);}else{state.speaking=false;updatePlayer();}};
  u.onerror=()=>{state.speaking=false;updatePlayer();toast("La voz del dispositivo se detuvo.")};
  speechSynthesis.speak(u);
}

async function speakKokoro(index){
  if(!state.segments.length)return;
  state.segmentIndex=Math.max(0,Math.min(index,state.segments.length-1));
  state.speaking=true;
  updatePlayer();
  const segment=state.segments[state.segmentIndex];
  try{
    const tts=await loadKokoro();
    if(!state.speaking)return;
    const style=STYLE[$("#styleSelect").value]||STYLE.warm;
    const speed=Math.max(.75,Math.min(1.2,style.aiSpeed*Number($("#speedRange").value)));
    const voice=$("#voiceSelect").value||((activeLanguage()==="es")?"em_alex":"af_heart");
    const raw=await tts.generate(segment.text,{voice,speed});
    if(!state.speaking)return;
    const blob=raw.toBlob();
    if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);
    state.audioUrl=URL.createObjectURL(blob);
    state.audio=new Audio(state.audioUrl);
    state.audio.onended=()=>{if(!state.speaking)return;if(state.segmentIndex<state.segments.length-1){state.segmentIndex++;saveProgress();updatePlayer();setTimeout(()=>{if(state.speaking)speakKokoro(state.segmentIndex)},pauseFor(segment));}else{state.speaking=false;updatePlayer();}};
    state.audio.onerror=()=>{state.speaking=false;updatePlayer();toast("No pude reproducir la voz IA.")};
    await state.audio.play();
  }catch(err){console.error(err);state.speaking=false;updatePlayer();toast("La voz IA no pudo iniciar en este iPhone. Puedes volver a iPhone · rápido.",6000);}
}

function togglePlay(){if(state.speaking){stopAllAudio();return;}state.speaking=true;if($("#engineSelect").value==="kokoro")speakKokoro(state.segmentIndex);else speakSystem(state.segmentIndex);}

async function importFile(file){
  if(!file)return;
  if(file.type&&file.type!=="application/pdf")return toast("Selecciona un PDF.");
  showView("processing");
  $("#progressBar").style.width="5%";
  $("#processingTitle").textContent="Analizando el libro…";
  $("#processingStatus").textContent="Abriendo el PDF.";
  try{
    const {pages,numPages}=await extractPdf(file);
    $("#processingStatus").textContent="Detectando capítulos…";
    $("#progressBar").style.width="88%";
    const chapters=detectChapters(pages),charCount=chapters.reduce((a,c)=>a+c.text.length,0);
    if(charCount<100)throw new Error("No se encontró suficiente texto. Puede ser un PDF escaneado.");
    const book={id:crypto.randomUUID?.()||String(Date.now()),title:file.name.replace(/\.pdf$/i,"").replace(/[_-]+/g," "),pages:numPages,chapters,charCount,createdAt:Date.now(),lastChapter:0,lastSegment:0,parserVersion:PARSER_VERSION};
    await dbPut(book);
    state.books.unshift(book);
    renderLibrary();
    $("#progressBar").style.width="100%";
    $("#processingStatus").textContent=`Listo · ${chapters.length} capítulos detectados`;
    setTimeout(()=>openBook(book.id),350);
  }catch(err){console.error(err);showView("library");toast(err.message?.includes("escaneado")?err.message:"No pude leer ese PDF. Prueba otro archivo.",5000);}
}

$("#previewBtn").onclick=async()=>{if(!state.currentBook)return;const sample=segmentText(state.currentBook.chapters[0]?.text||"")[0];if(!sample)return toast("No hay texto para la muestra.");stopAllAudio();state.segments=[sample];state.segmentIndex=0;state.speaking=true;if($("#engineSelect").value==="kokoro")await speakKokoro(0);else speakSystem(0);};
$("#playBtn").onclick=togglePlay;
$("#prevBtn").onclick=()=>{stopAllAudio();state.segmentIndex=Math.max(0,state.segmentIndex-1);saveProgress();updatePlayer();};
$("#nextBtn").onclick=()=>{stopAllAudio();state.segmentIndex=Math.min(state.segments.length-1,state.segmentIndex+1);saveProgress();updatePlayer();};
$("#playerChapterSelect").onchange=e=>openPlayer(Number(e.target.value),true);
$("#prevChapterBtn").onclick=()=>openPlayer(state.currentChapter-1,true);
$("#nextChapterBtn").onclick=()=>openPlayer(state.currentChapter+1,true);
$("#engineSelect").onchange=()=>{stopAllAudio();refreshVoiceOptions();};
$("#languageSelect").onchange=()=>{stopAllAudio();refreshVoiceOptions();};
$("#speedRange").oninput=e=>$("#speedLabel").textContent=`${Number(e.target.value).toFixed(2)}×`;
speechSynthesis.onvoiceschanged=loadVoices;loadVoices();

["#pdfInput","#pdfInput2"].forEach(id=>$(id).addEventListener("change",async e=>{const file=e.target.files?.[0];e.target.value="";await importFile(file);}));
$("#clearBtn").onclick=async()=>{if(!confirm("¿Eliminar todos los libros guardados en este dispositivo?"))return;stopAllAudio();for(const b of state.books)await dbDelete(b.id);state.books=[];renderLibrary();};
document.addEventListener("click",e=>{const go=e.target?.dataset?.go;if(!go)return;stopAllAudio();if(go==="library"){showView("library");renderLibrary();}else if(go==="book")showView("book");});

await openDB();
await loadBooks();
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js?v=3").catch(()=>{}));