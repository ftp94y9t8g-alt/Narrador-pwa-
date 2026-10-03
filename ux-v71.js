// Narrador v71 — single-pass real-device stabilization.
(() => {
  if (window.__narradorV71Installed) return;
  window.__narradorV71Installed = true;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let queued=false;

  function norm(s=''){return String(s).replace(/\s+/g,' ').trim();}
  function author(s=''){
    return norm(s).replace(/^([A-Z])\.\s*([A-Z])\.\s*/,'$1. $2. ').replace(/^([A-Z])([A-Z])\.\s*/,'$1. $2. ').replace(/^([A-Z])s\.\s+/,'$1. S. ');
  }
  function stripAuthorFromTitle(title, by){
    let t=norm(title), a=author(by);
    if(!t||!a||/author not specified|autor no especificado/i.test(a)) return t;
    const variants=[a,a.replace(/\.\s*/g,'.'),a.replace(/\./g,'').replace(/\s+/g,' ')];
    for(const v of variants){
      if(!v) continue;
      const esc=v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re=new RegExp('(?:\\s*[·|—–-]\\s*|\\s+)'+esc+'\\s*$','i');
      if(re.test(t)) return t.replace(re,'').trim();
    }
    return t;
  }
  function fixPair(titleEl, authorEl){
    if(!titleEl||!authorEl)return;
    const a=author(authorEl.textContent);
    if(a && a!==norm(authorEl.textContent)) authorEl.textContent=a;
    const t=stripAuthorFromTitle(titleEl.textContent,a);
    if(t && t!==norm(titleEl.textContent)) titleEl.textContent=t;
  }
  function fixTitles(){
    fixPair($('#n61NowPlaying .n61NowTitle'),$('#n61NowPlaying .n61NowAuthor'));
    fixPair($('#bookTitle'),$('#bookAuthorLine'));
    $$('.bookRow,.n62ShelfCard,.historyItem').forEach(card=>{
      const title=card.querySelector('.libraryTitle,.bookTitle,h3,strong');
      const by=card.querySelector('.libraryAuthor,.bookAuthor,.historyAuthor,p,span');
      if(title&&by)fixPair(title,by);
    });
  }
  function cleanReader(){
    const root=$('#readerText'); if(!root)return;
    root.querySelectorAll('p').forEach(p=>{
      let s=norm(p.textContent).normalize('NFKC').replace(/\u00ad/g,'').replace(/[\u200B-\u200D\uFEFF]/g,'');
      s=s.replace(/^([BCDFGHJKLMNPQRSTVWXZÑ])\s+([a-záéíóúüñ]{2,})\b/,'$1$2');
      if(s&&s!==p.textContent)p.textContent=s;
    });
  }
  function stopIOSSelection(){
    $$('button,.navItem,.bottomNav,.bookRow,.n62ShelfCard,.n61MiniPlayer,[role="button"]').forEach(el=>{
      el.style.webkitUserSelect='none'; el.style.userSelect='none'; el.style.webkitTouchCallout='none';
    });
  }
  function fixDuplicateIds(){
    // A duplicated enhancement layer used to create duplicate controls. Keep the last/current instance only.
    const seen=new Map();
    $$('[id]').forEach(el=>{const id=el.id;if(!id)return;if(seen.has(id)){const old=seen.get(id); if(old!==el && /^(n6|home|bookActionMenu|reader)/.test(id)) old.remove();}seen.set(id,el);});
  }
  function apply(){queued=false;fixDuplicateIds();fixTitles();cleanReader();stopIOSSelection();document.documentElement.classList.add('n71Stable');}
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(apply);}
  const mo=new MutationObserver(schedule);
  function install(){apply();mo.observe(document.body,{childList:true,subtree:true});document.addEventListener('click',schedule,true);document.addEventListener('change',schedule,true);window.addEventListener('pageshow',schedule);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();