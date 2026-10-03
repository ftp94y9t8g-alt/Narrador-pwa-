// Narrador v69 — QA cleanup from real-device review.
// Fixes reader text artifacts, chapter-marker parsing, mixed-language UI, metadata labels,
// author initials and the library action menu without replacing playback/PDF engines.
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let busy=false, timer=0;

  const supported=new Set(["es","en","fr","pt","it","de"]);
  function lang(){
    const h=String(document.documentElement.dataset.narradorLocale||"").toLowerCase().split(/[-_]/)[0];
    if(supported.has(h)) return h;
    const n=String(navigator.languages?.[0]||navigator.language||"en").toLowerCase().split(/[-_]/)[0];
    return supported.has(n)?n:"en";
  }
  const D={
    openBook:{es:"Abrir ficha del libro",en:"Open book details",fr:"Ouvrir la fiche du livre",pt:"Abrir detalhes do livro",it:"Apri dettagli libro",de:"Buchdetails öffnen"},
    openRead:{es:"Abrir para leer",en:"Open to read",fr:"Ouvrir pour lire",pt:"Abrir para ler",it:"Apri per leggere",de:"Zum Lesen öffnen"},
    editTitle:{es:"Editar título",en:"Edit title",fr:"Modifier le titre",pt:"Editar título",it:"Modifica titolo",de:"Titel bearbeiten"},
    editAuthor:{es:"Editar autor",en:"Edit author",fr:"Modifier l’auteur",pt:"Editar autor",it:"Modifica autore",de:"Autor bearbeiten"},
    deleteBook:{es:"Eliminar libro",en:"Delete book",fr:"Supprimer le livre",pt:"Excluir livro",it:"Elimina libro",de:"Buch löschen"},
    chapters:{es:"capítulos",en:"chapters",fr:"chapitres",pt:"capítulos",it:"capitoli",de:"Kapitel"},
    pages:{es:"páginas",en:"pages",fr:"pages",pt:"páginas",it:"pagine",de:"Seiten"},
    interfaceMode:{es:"Modo de interfaz",en:"Interface mode",fr:"Mode d’interface",pt:"Modo da interface",it:"Modalità interfaccia",de:"Oberflächenmodus"},
    currentlyLight:{es:"Actualmente: Claro",en:"Currently: Light",fr:"Actuellement : Clair",pt:"Atualmente: Claro",it:"Attualmente: Chiaro",de:"Aktuell: Hell"},
    currentlyDark:{es:"Actualmente: Oscuro",en:"Currently: Dark",fr:"Actuellement : Sombre",pt:"Atualmente: Escuro",it:"Attualmente: Scuro",de:"Aktuell: Dunkel"},
    light:{es:"Claro",en:"Light",fr:"Clair",pt:"Claro",it:"Chiaro",de:"Hell"},
    dark:{es:"Oscuro",en:"Dark",fr:"Sombre",pt:"Escuro",it:"Scuro",de:"Dunkel"},
    aiBooks:{es:"Audiolibros IA",en:"AI audiobooks",fr:"Livres audio IA",pt:"Audiolivros IA",it:"Audiolibri IA",de:"KI-Hörbücher"},
    generationCenter:{es:"Centro de generación",en:"Generation center",fr:"Centre de génération",pt:"Central de geração",it:"Centro di generazione",de:"Generierungszentrum"},
    noAiBooks:{es:"Aún no hay audiolibros IA",en:"No AI audiobooks yet",fr:"Aucun livre audio IA pour l’instant",pt:"Ainda não há audiolivros IA",it:"Nessun audiolibro IA per ora",de:"Noch keine KI-Hörbücher"},
    manageStorage:{es:"Gestionar almacenamiento",en:"Manage storage",fr:"Gérer le stockage",pt:"Gerenciar armazenamento",it:"Gestisci spazio",de:"Speicher verwalten"},
    noAiAudio:{es:"Sin audio IA guardado",en:"No AI audio stored",fr:"Aucun audio IA enregistré",pt:"Nenhum áudio IA salvo",it:"Nessun audio IA salvato",de:"Kein KI-Audio gespeichert"},
    enabled:{es:"Activadas",en:"Enabled",fr:"Activées",pt:"Ativadas",it:"Attive",de:"Aktiviert"},
    appLanguage:{es:"Idioma de la app",en:"App language",fr:"Langue de l’app",pt:"Idioma do app",it:"Lingua app",de:"App-Sprache"},
    automatic:{es:"Automático",en:"Automatic",fr:"Automatique",pt:"Automático",it:"Automatico",de:"Automatisch"}
  };
  const t=k=>D[k]?.[lang()]||D[k]?.en||k;

  function stripMarker(text=""){
    // A roman numeral is a marker only when it is followed by a real separator/space.
    // This prevents "Capítulo" from becoming "apítulo" (C is itself a Roman numeral).
    return String(text).replace(/^\s*(?:\d{1,3}|[IVXLCDM]{1,8})(?=(?:\s|[—–\-.:)]))\s*(?:[—–\-.:)]\s*)?/i,"").trim();
  }

  function cleanParagraph(text=""){
    let s=String(text).normalize("NFKC")
      .replace(/\u00ad/g,"")
      .replace(/[\u200B-\u200D\uFEFF]/g,"")
      .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\s*\n\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g,"$1$2")
      .replace(/\s*\n\s*/g," ")
      .replace(/[\t ]{2,}/g," ")
      .replace(/\s+([,.;:!?…])/g,"$1")
      .replace(/([¿¡])\s+/g,"$1")
      .trim();

    // PDF text layers often split a leading consonant: "H abía" / "H ABIA".
    // Never merge legitimate one-letter Spanish words A/E/O/Y.
    s=s.replace(/^([BCDFGHJKLMNPQRSTVWXZÑ])\s+([a-záéíóúüñ]{2,})\b/,"$1$2");
    s=s.replace(/\b([BCDFGHJKLMNPQRSTVWXZÑ])\s+([A-ZÁÉÍÓÚÜÑ]{2,})\b/g,"$1$2");
    return s;
  }

  function source(p){
    let out="";
    for(const n of [...p.childNodes]) out+=n.nodeName==="BR"?"\n":(n.textContent||"");
    return out;
  }

  function repairReader(){
    const root=$("#readerText");
    if(root){
      root.querySelectorAll("p").forEach(p=>{
        const next=cleanParagraph(source(p));
        if(next&&p.textContent!==next) p.textContent=next;
      });
    }

    const top=$("#n65ReaderTopTitle");
    const strong=top?.querySelector("strong");
    const sub=top?.querySelector("span");
    if(strong&&sub&&/\d/.test(strong.textContent||"")){
      const original=sub.dataset.n69Source||sub.dataset.n68Source||sub.textContent||"";
      if(!sub.dataset.n69Source) sub.dataset.n69Source=original;
      const fixed=stripMarker(original);
      if(fixed&&sub.textContent!==fixed) sub.textContent=fixed;
    }
  }

  function normalizeAuthor(text=""){
    let s=String(text).replace(/\s+/g," ").trim();
    s=s.replace(/^([A-Z])\.\s*([A-Z])\.\s*/,"$1. $2. ");
    s=s.replace(/^([A-Z])([A-Z])\.\s*/,"$1. $2. ");
    s=s.replace(/^([A-Z])s\.\s+/,"$1. S. ");
    return s;
  }

  function repairAuthors(){
    ["#n61NowPlaying .n61NowAuthor","#homeView .v18HomeAuthor","#bookAuthorLine","#library .libraryAuthor","#historyList .historyAuthor","#n62RecentSection .n62ShelfCard span"]
      .forEach(sel=>$$(sel).forEach(el=>{
        const next=normalizeAuthor(el.textContent);
        if(next&&next!==el.textContent) el.textContent=next;
      }));
  }

  function replaceExact(root,from,to){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const node of nodes){
      if(String(node.nodeValue||"").trim()===from){
        const lead=(node.nodeValue.match(/^\s*/)||[""])[0], trail=(node.nodeValue.match(/\s*$/)||[""])[0];
        node.nodeValue=lead+to+trail;
      }
    }
  }

  function localizeMetadata(){
    const chapter=t("chapters"), pages=t("pages");
    const roots=[...$$("#library .bookRow p,#bookMeta,#historyList p")];
    roots.forEach(el=>{
      let s=String(el.textContent||"");
      s=s.replace(/(\d+)\s+(?:capítulos|chapters|chapitres|capitoli|Kapitel)\b/gi,(_,n)=>`${n} ${chapter}`);
      s=s.replace(/(\d+)\s+(?:páginas|pages|pagine|Seiten)\b/gi,(_,n)=>`${n} ${pages}`);
      if(s!==el.textContent)el.textContent=s;
    });
  }

  function localizeSettings(){
    const root=$("#settingsView"); if(!root)return;
    const l=lang();
    const pairs=[
      ["Modo de interfaz",t("interfaceMode")],["Interface mode",t("interfaceMode")],
      ["Actualmente: Claro",t("currentlyLight")],["Currently: Light",t("currentlyLight")],
      ["Actualmente: Oscuro",t("currentlyDark")],["Currently: Dark",t("currentlyDark")],
      ["Claro",t("light")],["Light",t("light")],["Oscuro",t("dark")],["Dark",t("dark")],
      ["Audiolibros IA",t("aiBooks")],["AI audiobooks",t("aiBooks")],
      ["Centro de generación",t("generationCenter")],["Generation center",t("generationCenter")],
      ["Aún no hay audiolibros IA",t("noAiBooks")],["No AI audiobooks yet",t("noAiBooks")],
      ["Gestionar almacenamiento",t("manageStorage")],["Manage storage",t("manageStorage")],
      ["Sin audio IA guardado",t("noAiAudio")],["No AI audio stored",t("noAiAudio")],
      ["Activadas",t("enabled")],["Enabled",t("enabled")],
      ["Idioma de la app",t("appLanguage")],["App language",t("appLanguage")]
    ];
    pairs.forEach(([a,b])=>replaceExact(root,a,b));

    // Dynamic storage sentence generated by old Spanish layer.
    $$("#settingsView .settingText span,#settingsView .settingsNote").forEach(el=>{
      let s=String(el.textContent||"");
      if(l==="en"){
        s=s.replace(/([\d.,]+\s*(?:KB|MB|GB))\s+usados de\s+([\d.,]+\s*(?:KB|MB|GB))\s+disponibles/i,"$1 used · $2 available")
           .replace(/Calculando espacio…/gi,"Calculating space…")
           .replace(/Revisando audiolibros…/gi,"Checking audiobooks…");
      }
      if(s!==el.textContent)el.textContent=s;
    });
  }

  function localizeActionMenu(){
    const menu=$("#bookActionMenu"); if(!menu)return;
    const map={open:"openBook",read:"openRead",title:"editTitle",author:"editAuthor",delete:"deleteBook"};
    Object.entries(map).forEach(([a,k])=>{
      const btn=menu.querySelector(`[data-book-action="${a}"]`);
      if(!btn)return;
      // Remove legacy glyphs that render as missing-character squares on iOS.
      if(btn.textContent!==t(k)) btn.textContent=t(k);
    });
  }

  function markMenuState(){
    const menu=$("#bookActionMenu");
    if(!menu)return;
    const cs=getComputedStyle(menu);
    const open=cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)!==0;
    document.body.classList.toggle("n69BookMenuOpen",open);
  }

  function fixNowPlayingText(){
    const rw=$("#n64ReadWhile");
    if(rw){
      const span=rw.querySelector("span");
      // Keep the localized text from v66, but remove any broken fallback glyph before it.
      if(span){
        [...rw.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&String(n.nodeValue||"").trim()).forEach(n=>n.remove());
      }
    }
  }

  function apply(){
    if(busy)return; busy=true;
    try{
      document.documentElement.classList.add("n69QA");
      repairReader();
      repairAuthors();
      localizeMetadata();
      localizeSettings();
      localizeActionMenu();
      fixNowPlayingText();
      markMenuState();
    }finally{busy=false;}
  }
  function schedule(ms=0){clearTimeout(timer);timer=setTimeout(apply,ms);}

  function observe(sel){
    const el=$(sel); if(!el||el.dataset.n69Observed==="1")return;
    el.dataset.n69Observed="1";
    new MutationObserver(()=>schedule(0)).observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","style","data-n64-reader-theme"]});
  }

  function install(){
    apply();
    ["#readerView","#settingsView","#bookActionMenu","#libraryView","#bookView","#n61NowPlaying"].forEach(observe);
    document.addEventListener("click",()=>schedule(30),true);
    document.addEventListener("change",()=>schedule(20),true);
    window.addEventListener("pageshow",()=>schedule(40));
    window.addEventListener("focus",()=>schedule(50));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule(40);});
    setTimeout(()=>{["#readerView","#settingsView","#bookActionMenu","#libraryView","#bookView","#n61NowPlaying"].forEach(observe);apply();},700);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  window.__narradorUX69={apply,stripMarker,cleanParagraph};
})();