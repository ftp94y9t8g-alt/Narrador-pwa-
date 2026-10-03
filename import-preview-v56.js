// Narrador v56 — smart PDF metadata, cover, hybrid chapter detection and pre-import confirmation.
// Runs in window capture so this becomes the authoritative importer without changing the stable legacy importer.
(() => {
  const DB_NAME = "narrador-db-v1";
  const STORE = "books";
  const PARSER_VERSION = 56;
  const $ = s => document.querySelector(s);
  let pdfjsPromise = null;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const cleanText = (text="") => String(text).replace(/\u00ad/g,"").replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\n([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g,"$1$2").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").replace(/[ \t]{2,}/g," ").trim();
  const norm = (s="") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[“”\"'«»]/g,"").replace(/[–—−]/g,"-").replace(/\s+/g," ").replace(/\s*[.·•…]+\s*\d+\s*$/g,"").trim();
  const median = a => { if(!a.length) return 0; const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2); return b.length%2?b[m]:(b[m-1]+b[m])/2; };
  const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

  async function pdfjs() {
    if (!pdfjsPromise) pdfjsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs").then(mod => {
      mod.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      return mod;
    });
    return pdfjsPromise;
  }

  function openDB() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:"id"}); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
  }
  async function putBook(book) {
    const db=await openDB();
    await new Promise((resolve,reject)=>{ const req=db.transaction(STORE,"readwrite").objectStore(STORE).put(book); req.onsuccess=resolve; req.onerror=()=>reject(req.error); });
    try{db.close();}catch(_){}
  }

  function strongHeading(s="") {
    const t=s.trim().replace(/\s+/g," ");
    if(!t||t.length>140)return false;
    if(/^(?:(?:chapter|cap[ií]tulo|part|parte|book|libro|section|secci[oó]n)\s+(?:[ivxlcdm\d]+|[a-záéíóúüñ]+)|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n|preface|prefacio)\b.*$/i.test(t))return true;
    return /^(?:[IVXLCDM]{1,12}|\d{1,3})\s*(?:[–—-]|[.:])\s*\S.{0,115}$/i.test(t);
  }
  const stripPageNo = (s="") => s.trim().replace(/\s*[.·•…]{2,}\s*\d{1,5}\s*$/g,"").replace(/\s{2,}\d{1,5}\s*$/g,"").trim();
  function flattenOutline(items,out=[]) { for(const i of items||[]){ if(i?.title)out.push(String(i.title).trim()); if(i?.items?.length)flattenOutline(i.items,out); } return out; }

  function linesFromItems(items,viewport){
    const groups=[];
    for(const item of items){
      const text=String(item.str||"").trim(); if(!text)continue;
      const tr=item.transform||[1,0,0,1,0,0],x=+tr[4]||0,y=+tr[5]||0,fs=Math.max(1,Math.abs(+tr[3]||0)||Math.hypot(+tr[0]||1,+tr[1]||0));
      let g=groups.find(q=>Math.abs(q.y-y)<=Math.max(2.5,fs*.22));
      if(!g){g={y,x0:x,x1:x+(item.width||0),sizes:[],parts:[]};groups.push(g);}
      g.x0=Math.min(g.x0,x); g.x1=Math.max(g.x1,x+(item.width||0)); g.sizes.push(fs); g.parts.push({x,text});
    }
    groups.sort((a,b)=>b.y-a.y);
    return groups.map(g=>{ g.parts.sort((a,b)=>a.x-b.x); const text=g.parts.map(p=>p.text).join(" ").replace(/\s+/g," ").trim(),width=Math.max(1,g.x1-g.x0); return {text,x:g.x0,y:g.y,fontSize:median(g.sizes),center:g.x0+width/2,pageWidth:viewport.width,pageHeight:viewport.height}; }).filter(x=>x.text);
  }

  function showProcessing(){
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    $("#processingView")?.classList.add("active"); window.scrollTo(0,0);
  }
  function status(text,pct){ if($("#processingStatus"))$("#processingStatus").textContent=text; if(pct!=null&&$("#progressBar"))$("#progressBar").style.width=`${pct}%`; }

  async function renderCover(pdf){
    try{
      const page=await pdf.getPage(1), base=page.getViewport({scale:1}), scale=Math.min(2.1,Math.max(1.25,1050/Math.max(1,base.width))), vp=page.getViewport({scale});
      const src=document.createElement("canvas"); src.width=Math.max(1,Math.round(vp.width)); src.height=Math.max(1,Math.round(vp.height));
      const sctx=src.getContext("2d",{alpha:false}); sctx.fillStyle="#fff"; sctx.fillRect(0,0,src.width,src.height); await page.render({canvasContext:sctx,viewport:vp}).promise;
      const out=document.createElement("canvas"); out.width=600; out.height=900; const ctx=out.getContext("2d",{alpha:false}); ctx.fillStyle="#fff"; ctx.fillRect(0,0,600,900);
      const fit=Math.min(600/src.width,900/src.height),w=src.width*fit,h=src.height*fit; ctx.drawImage(src,(600-w)/2,(900-h)/2,w,h);
      return out.toDataURL("image/jpeg",.86);
    }catch(_){return "";}
  }

  async function extract(file){
    const mod=await pdfjs(), pdf=await mod.getDocument({data:await file.arrayBuffer()}).promise;
    const meta=await pdf.getMetadata().catch(()=>({info:{},metadata:null}));
    const outline=flattenOutline(await pdf.getOutline().catch(()=>null)),pages=[];
    const coverPromise=renderCover(pdf);
    for(let n=1;n<=pdf.numPages;n++){
      status(`Leyendo página ${n} de ${pdf.numPages}`,Math.round(n/pdf.numPages*67));
      const page=await pdf.getPage(n),vp=page.getViewport({scale:1}),content=await page.getTextContent(),lines=linesFromItems(content.items,vp);
      pages.push({number:n,lines,text:cleanText(lines.map(x=>x.text).join("\n")),medianFont:median(lines.map(x=>x.fontSize))||10});
      if(n%3===0)await wait(0);
    }
    const coverDataUrl=await coverPromise;
    try{await pdf.destroy();}catch(_){}
    return {pages,numPages:pages.length,outline,meta,coverDataUrl};
  }

  function inferToc(pages){
    const limit=Math.min(pages.length,Math.max(12,Math.ceil(pages.length*.16),24)),titles=[],tocPages=new Set();
    for(let p=0;p<limit;p++){
      let leaders=0,strong=0; const local=[];
      for(const l of pages[p].lines){ const raw=l.text.trim(); if(!raw||raw.length>160)continue; const leader=/[.·•…]{2,}\s*\d{1,5}\s*$/.test(raw)||/\s{2,}\d{1,5}\s*$/.test(raw),title=stripPageNo(raw); if(leader){leaders++;local.push(title);} if(strongHeading(title)){strong++;local.push(title);} }
      if(leaders>=3||(strong>=6&&p<Math.max(8,Math.ceil(pages.length*.08)))){tocPages.add(p);titles.push(...local);}
    }
    const out=[],seen=new Set(); for(const t of titles){const k=norm(t);if(k&&!seen.has(k)){seen.add(k);out.push(t);}}
    return{titles:out,tocPages};
  }
  function knownMatch(text,known){ const k=norm(text); if(!k)return null; let best=null,score=0; for(const t of known){const q=norm(t);if(!q)continue;if(k===q)return t;if(k.length>5&&q.length>5&&(k.includes(q)||q.includes(k))){const s=Math.min(k.length,q.length)/Math.max(k.length,q.length);if(s>.8&&s>score){score=s;best=t;}}}return best; }
  function headingScore(line,page,pos,known){
    const t=line.text.trim(); if(!t||t.length>150)return{score:-99,title:t}; let score=0,reasons=[],match=knownMatch(t,known);
    if(match){score+=7;reasons.push("índice/bookmark");}
    if(/^(?:(?:chapter|cap[ií]tulo|part|parte|book|libro|section|secci[oó]n)\s+(?:[ivxlcdm\d]+|[a-záéíóúüñ]+)|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n|preface|prefacio)\b/i.test(t)){score+=6;reasons.push("patrón");}
    else if(/^(?:[IVXLCDM]{1,12}|\d{1,3})\s*(?:[–—-]|[.:])\s*\S/i.test(t)){score+=5;reasons.push("numeración");}
    else if(/^(?:[IVXLCDM]{1,8}|\d{1,3})$/i.test(t)){score+=2.5;reasons.push("número aislado");}
    const ratio=line.fontSize/Math.max(1,page.medianFont); if(ratio>=1.45){score+=3;reasons.push("tipografía");}else if(ratio>=1.22){score+=2;reasons.push("tipografía");}
    if(Math.abs(line.center-line.pageWidth/2)/(line.pageWidth/2)<.18&&t.length<100){score+=1.5;reasons.push("centrado");}
    if(pos<=5){score+=1.5;reasons.push("inicio de página");}else if(pos<=10)score+=.5; if(t.length<70)score+=.5; if(/^[A-ZÁÉÍÓÚÜÑ\d .,:;!?–—-]{3,80}$/.test(t))score+=.75;
    if(/[.!?]$/.test(t)&&t.split(/\s+/).length>10)score-=3; if(/^[\d\s]+$/.test(t))score-=4; if(/[.·•…]{2,}\s*\d{1,5}\s*$/.test(t))score-=8;
    return{score,title:match||t,reasons};
  }
  function fallbackFromText(text){
    const lines=cleanText(text).split("\n").map(x=>x.trim()).filter(Boolean),seg=[];let cur=null,front=[];
    for(const line of lines){if(strongHeading(line)){if(cur){cur.text=cleanText(cur.text);seg.push(cur);}cur={title:line,text:"",startPage:null,confidence:.6};}else if(cur)cur.text+=line+"\n";else front.push(line);}
    if(cur){cur.text=cleanText(cur.text);seg.push(cur);} const good=seg.filter((s,i)=>s.text.length>=350||i===seg.length-1);
    if(good.length>=2){const f=cleanText(front.join("\n"));if(f.length>1600)good.unshift({title:"Inicio",text:f,startPage:null,confidence:.3});return good;}
    const whole=cleanText(text),out=[];let p=0,n=1;while(p<whole.length){let e=Math.min(p+14000,whole.length);if(e<whole.length){const b=whole.lastIndexOf("\n\n",e);if(b>p+7000)e=b;}out.push({title:`Sección ${n++}`,text:whole.slice(p,e).trim(),startPage:null,confidence:.1});p=e;}return out;
  }
  function detect(pages,outline=[]){
    const toc=inferToc(pages),known=[...outline,...toc.titles],cand=[];
    for(let p=0;p<pages.length;p++){if(toc.tocPages.has(p))continue;for(let i=0;i<pages[p].lines.length;i++){const s=headingScore(pages[p].lines[i],pages[p],i,known);if(s.score>=6.5)cand.push({p,i,title:s.title,score:s.score,reasons:s.reasons});}}
    cand.sort((a,b)=>a.p-b.p||a.i-b.i||b.score-a.score);const filtered=[];for(const c of cand){const prev=filtered.at(-1);if(prev&&prev.p===c.p&&Math.abs(prev.i-c.i)<=2){if(c.score>prev.score)filtered[filtered.length-1]=c;}else filtered.push(c);}
    const map=new Map(filtered.map(c=>[`${c.p}:${c.i}`,c])),chapters=[];let current=null,front=[];
    for(let p=0;p<pages.length;p++){if(toc.tocPages.has(p))continue;for(let i=0;i<pages[p].lines.length;i++){const c=map.get(`${p}:${i}`);if(c){if(current){current.text=cleanText(current.text);if(current.text.length>=180)chapters.push(current);}current={title:c.title,text:"",startPage:p+1,confidence:Math.min(1,c.score/12),signals:c.reasons};}else{const t=pages[p].lines[i].text;if(current)current.text+=t+"\n";else front.push(t);}}if(current)current.text+="\n";else front.push("");}
    if(current){current.text=cleanText(current.text);if(current.text.length>=120)chapters.push(current);} const good=chapters.filter((c,i)=>c.text.length>=350||/epilogue|ep[ií]logo|prologue|pr[oó]logo/i.test(c.title)||i===chapters.length-1);
    if(good.length>=2){const f=cleanText(front.join("\n"));if(f.length>1600&&!toc.titles.length)good.unshift({title:"Inicio",text:f,startPage:1,confidence:.35});return good;}
    return fallbackFromText(pages.map(p=>p.text).join("\n\n"));
  }

  function cleanMeta(v){
    if(Array.isArray(v))v=v.join(", ");
    v=String(v||"").replace(/\s+/g," ").trim();
    return /^(?:unknown|untitled|none|null|anonymous|microsoft word)$/i.test(v)?"":v;
  }
  function filenameBase(file){return String(file?.name||"").replace(/\.pdf$/i,"").replace(/_/g," ").replace(/\s+/g," ").trim();}
  function authorFromFilename(base){
    let m=base.match(/(?:\bby\b|\bpor\b)\s+([^–—|]+)$/i); if(m)return cleanMeta(m[1]);
    m=base.match(/((?:(?:[A-ZÁÉÍÓÚÜÑ]\.)\s*){1,3}[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+(?:\s+[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+){0,3})$/); if(m)return cleanMeta(m[1]);
    return "";
  }
  function titleFromFilename(base,author){
    let t=base;
    if(author){const i=t.toLowerCase().lastIndexOf(author.toLowerCase());if(i>Math.max(4,t.length*.45))t=t.slice(0,i).trim().replace(/[–—\-,:|]+$/g,"").trim();}
    return cleanMeta(t.replace(/\s+-\s+/g," – "))||"Libro";
  }
  function detectLanguage(text=""){
    const s=String(text).slice(0,8000).toLowerCase(),es=(s.match(/\b(el|la|los|las|que|de|del|una|un|por|para|con|como|pero|había|estaba|era|su|sus)\b/g)||[]).length,en=(s.match(/\b(the|and|of|to|in|was|that|with|for|his|her|had|but|as|you)\b/g)||[]).length;
    return es>=en?"es":"en";
  }
  function looksLikePerson(s=""){
    s=s.trim(); if(s.length<4||s.length>65||/editorial|publisher|copyright|www\.|http|isbn|chapter|cap[ií]tulo|libro|book/i.test(s))return false;
    const parts=s.replace(/^por\s+|^by\s+/i,"").split(/\s+/); if(parts.length<2||parts.length>5)return false;
    return parts.every(p=>/^(?:[A-ZÁÉÍÓÚÜÑ]\.|[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{1,24})$/.test(p));
  }
  function inferMetadata(file,pages,meta){
    const base=filenameBase(file), info=meta?.info||{}, md=meta?.metadata;
    let title=cleanMeta(info.Title||md?.get?.("dc:title")),author=cleanMeta(info.Author||md?.get?.("dc:creator"));
    const filenameAuthor=authorFromFilename(base); if(!author)author=filenameAuthor;
    if(!title)title=titleFromFilename(base,author);

    const front=pages.slice(0,Math.min(5,pages.length));
    if(!author){
      for(const p of front){
        for(const l of p.lines.slice(0,40)){
          const raw=l.text.trim(), by=raw.match(/^(?:by|por|autor(?:a)?[:\s]+)\s*(.+)$/i);
          if(by&&looksLikePerson(by[1])){author=cleanMeta(by[1]);break;}
          if(looksLikePerson(raw)&&l.fontSize>=p.medianFont*.95&&l.fontSize<=p.medianFont*1.55){author=cleanMeta(raw);break;}
        }
        if(author)break;
      }
    }
    // Prefer a clear, large front-page title only when PDF metadata did not provide one and the filename is generic.
    const generic=/^(scan|document|book|libro|pdf|untitled)(\s*\d+)?$/i.test(title);
    if(generic){
      let best=null,bestScore=0;
      for(const p of front.slice(0,3))for(const l of p.lines.slice(0,30)){
        const raw=l.text.trim(); if(raw.length<3||raw.length>125||strongHeading(raw)||/copyright|editorial|publisher|isbn|www\.|http/i.test(raw))continue;
        const ratio=l.fontSize/Math.max(1,p.medianFont),center=1-Math.min(1,Math.abs(l.center-l.pageWidth/2)/(l.pageWidth/2)),score=ratio*3+center;
        if(score>bestScore){bestScore=score;best=raw;}
      }
      if(best)title=best;
    }
    return{title:title||"Libro",author:author||"",language:detectLanguage(front.map(p=>p.text).join("\n"))};
  }

  function installStyle(){
    if($("#import56Style"))return;
    const style=document.createElement("style");style.id="import56Style";style.textContent=`
      #importPreview56{position:fixed;inset:0;z-index:2147483450;display:none}#importPreview56.open{display:block}.imp56Back{position:absolute;inset:0;background:rgba(15,23,42,.46);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      .imp56Panel{position:absolute;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:580px;max-height:calc(100dvh - 34px);overflow:auto;margin:auto;padding:20px;background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--line,#e4e8ef);border-radius:28px;box-shadow:0 28px 78px rgba(15,23,42,.28);-webkit-overflow-scrolling:touch}.imp56Handle{width:42px;height:5px;border-radius:9px;background:#cfd6e1;margin:0 auto 16px}.imp56Head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.imp56Head h3{font-size:25px;margin:3px 0 5px;letter-spacing:-.03em}.imp56Head p{margin:0;font-size:13px}.imp56Cover{width:76px;height:106px;object-fit:contain;border-radius:11px;background:#eef1f6;box-shadow:0 8px 22px rgba(15,23,42,.12);flex:none}
      .imp56Grid{display:grid;gap:12px;margin-top:18px}.imp56Grid label{display:grid;gap:6px;color:var(--muted,#6b7280);font-size:12px;font-weight:850}.imp56Grid input,.imp56Grid select{width:100%;min-height:50px;border:1px solid var(--line,#dfe4ec);border-radius:14px;background:var(--surface2,#f8faff);color:var(--text,#111827);padding:0 13px;font-size:16px}.imp56Summary{margin:16px 0 0;padding:13px;border-radius:15px;background:var(--surface2,#f7f9fd);border:1px solid var(--line,#e5e9f0);font-size:12px;color:var(--muted,#64748b)}.imp56Chapters{display:grid;gap:6px;margin-top:10px}.imp56Chapter{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.imp56Actions{display:grid;grid-template-columns:.8fr 1.4fr;gap:9px;margin-top:18px}.imp56Actions button{min-height:50px;border:0;border-radius:15px;font-weight:900;font-size:15px}.imp56Cancel{background:var(--surface2,#eef2f8);color:var(--text,#4b5563)}.imp56Save{background:linear-gradient(145deg,#3976ff,#6657ff);color:#fff;box-shadow:0 10px 24px rgba(61,100,255,.22)}
      html[data-narrador-theme="dark"] .imp56Panel{background:#121823!important;border-color:#2a3546!important}.imp56Summary{color:inherit}
    `;document.head.appendChild(style);
  }

  function previewBook(draft){
    installStyle();
    return new Promise(resolve=>{
      let root=$("#importPreview56"); if(root)root.remove();
      root=document.createElement("div");root.id="importPreview56";root.className="open";
      const chapterRows=draft.chapters.slice(0,6).map((c,i)=>`<div class="imp56Chapter">${i+1}. ${esc(c.title||`Capítulo ${i+1}`)}</div>`).join("");
      root.innerHTML=`<div class="imp56Back"></div><div class="imp56Panel" role="dialog" aria-modal="true"><div class="imp56Handle"></div><div class="imp56Head"><div><div class="eyebrow">ANTES DE AÑADIRLO</div><h3>Revisa tu libro</h3><p>Narrador detectó estos datos automáticamente. Puedes corregirlos ahora.</p></div>${draft.coverDataUrl?`<img class="imp56Cover" src="${draft.coverDataUrl}" alt="Portada">`:""}</div><div class="imp56Grid"><label>Título<input id="imp56Title" maxlength="180" value="${esc(draft.title)}"></label><label>Autor<input id="imp56Author" maxlength="120" placeholder="Autor no especificado" value="${esc(draft.author)}"></label><label>Idioma<select id="imp56Language"><option value="es">Español</option><option value="en">English</option></select></label></div><div class="imp56Summary"><strong>${draft.pages} páginas · ${draft.chapters.length} capítulos detectados</strong><div class="imp56Chapters">${chapterRows}${draft.chapters.length>6?`<div>…y ${draft.chapters.length-6} más</div>`:""}</div></div><div class="imp56Actions"><button class="imp56Cancel" type="button">Cancelar</button><button class="imp56Save" type="button">Añadir a mi biblioteca</button></div></div>`;
      document.body.appendChild(root); $("#imp56Language").value=draft.language||"es"; document.body.style.overflow="hidden";
      const finish=value=>{document.body.style.overflow="";root.remove();resolve(value);};
      root.querySelector(".imp56Cancel").onclick=()=>finish(null); root.querySelector(".imp56Back").onclick=()=>finish(null);
      root.querySelector(".imp56Save").onclick=()=>finish({...draft,title:$("#imp56Title").value.trim()||draft.title,author:$("#imp56Author").value.trim(),language:$("#imp56Language").value});
    });
  }

  async function importFile(file){
    if(!file)return; if(file.type&&file.type!=="application/pdf")return;
    showProcessing(); if($("#processingTitle"))$("#processingTitle").textContent="Analizando el libro…"; status("Abriendo el PDF.",4);
    try{
      const {pages,numPages,outline,meta,coverDataUrl}=await extract(file); status("Detectando capítulos y metadatos…",84);
      const chapters=detect(pages,outline),charCount=chapters.reduce((a,c)=>a+(c.text?.length||0),0); if(charCount<100)throw new Error("No se encontró suficiente texto. Puede ser un PDF escaneado.");
      const guessed=inferMetadata(file,pages,meta); status(`Listo · ${chapters.length} capítulos detectados`,100);
      const chosen=await previewBook({id:crypto.randomUUID?.()||String(Date.now()),sourceFileName:file.name,title:guessed.title,author:guessed.author,language:guessed.language,pages:numPages,chapters,charCount,createdAt:Date.now(),lastChapter:0,lastSegment:0,parserVersion:PARSER_VERSION,coverDataUrl,coverSource:coverDataUrl?"pdf-first-page":""});
      if(!chosen){location.reload();return;}
      chosen.createdAt=Date.now(); await putBook(chosen); status("Añadido a tu biblioteca.",100); setTimeout(()=>location.reload(),320);
    }catch(error){console.error("Narrador v56 import:",error); alert(error?.message?.includes("escaneado")?error.message:"No pude analizar ese PDF. Prueba otro archivo."); location.reload();}
  }

  window.addEventListener("change",event=>{
    const input=event.target; if(!(input instanceof HTMLInputElement)||!(input.id==="pdfInput"||input.id==="pdfInput2"))return;
    const file=input.files?.[0]; if(!file)return;
    // Window capture happens before the legacy document/input listeners, preventing duplicate imports.
    event.preventDefault(); event.stopImmediatePropagation(); input.value=""; importFile(file);
  },true);
})();
