// Narrador v70 runtime stabilization layer.
(() => {
  if(window.__narradorV70Loaded)return; window.__narradorV70Loaded=true;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const supported=new Set(["es","en","fr","pt","it","de"]);
  const lang=()=>{const h=String(document.documentElement.dataset.narradorLocale||"").toLowerCase().split(/[-_]/)[0];if(supported.has(h))return h;const n=String(navigator.languages?.[0]||navigator.language||"en").toLowerCase().split(/[-_]/)[0];return supported.has(n)?n:"en";};
  const tr={read:{es:"Leer",en:"Read",fr:"Lire",pt:"Ler",it:"Leggi",de:"Lesen"},cont:{es:"Continuar escuchando",en:"Continue listening",fr:"Continuer l’écoute",pt:"Continuar ouvindo",it:"Continua ad ascoltare",de:"Weiterhören"}};
  const t=k=>tr[k]?.[lang()]||tr[k]?.en||k;
  let lock=false,tid=0;
  function cleanReader(){const root=$("#readerText");root?.querySelectorAll("p").forEach(p=>{let s=p.textContent.normalize("NFKC").replace(/\u00ad/g,"").replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/[\t ]{2,}/g," ").replace(/\s+([,.;:!?…])/g,"$1").trim();s=s.replace(/^([BCDFGHJKLMNPQRSTVWXZÑ])\s+([a-záéíóúüñ]{2,})\b/,"$1$2").replace(/\b([BCDFGHJKLMNPQRSTVWXZÑ])\s+([A-ZÁÉÍÓÚÜÑ]{2,})\b/g,"$1$2");if(s&&p.textContent!==s)p.textContent=s;});}
  function home(){const h=$("#homeFeatured");if(!h)return;const r=h.querySelector(".v18Open span,.n61HeroActions .v18Open span"),c=h.querySelector(".n61HeroListen span");if(r&&r.textContent!==t("read"))r.textContent=t("read");if(c&&c.textContent!==t("cont"))c.textContent=t("cont");h.querySelectorAll(".v18Open,.n61HeroListen").forEach(b=>[...b.childNodes].filter(n=>n.nodeType===3&&String(n.nodeValue||"").trim()).forEach(n=>n.remove()));}
  function author(){["#n61NowPlaying .n61NowAuthor","#homeView .v18HomeAuthor","#bookAuthorLine","#library .libraryAuthor","#historyList .historyAuthor","#n62RecentSection .n62ShelfCard span"].forEach(s=>$$(s).forEach(el=>{const n=String(el.textContent||"").replace(/^([A-Z])s\.\s+/,"$1. S. ").replace(/^([A-Z])([A-Z])\.\s*/,"$1. $2. ");if(n!==el.textContent)el.textContent=n;}));}
  function apply(){if(lock)return;lock=true;try{document.documentElement.classList.add("n70Stable");cleanReader();home();author();}finally{lock=false;}}
  function q(){clearTimeout(tid);tid=setTimeout(apply,0);}
  function obs(sel){const el=$(sel);if(!el||el.dataset.n70Runtime)return;el.dataset.n70Runtime="1";new MutationObserver(q).observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","data-book-id","data-chapter"]});}
  function install(){apply();["#homeView","#homeFeatured","#readerView","#libraryView","#bookView","#n61NowPlaying"].forEach(obs);document.addEventListener("click",q,true);window.addEventListener("pageshow",q);setTimeout(()=>{["#homeView","#homeFeatured","#readerView","#libraryView","#bookView","#n61NowPlaying"].forEach(obs);apply();},200);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();