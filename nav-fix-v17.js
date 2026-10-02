// Narrador v17: robust bottom-tab navigation for iPhone/PWA.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const MAP = {home:"#homeView",library:"#libraryView",history:"#historyView",settings:"#settingsView"};
  let lastTap = 0;

  function manualSetTab(tab){
    const selector = MAP[tab];
    if(!selector) return;
    $$(".view").forEach(v=>v.classList.remove("active"));
    $(selector)?.classList.add("active");
    document.body.dataset.mainTab = tab;
    document.body.dataset.detailView = "0";
    $$(".bottomNav .navItem").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===tab));
    window.scrollTo({top:0,behavior:"instant"});
  }

  function go(tab){
    try{
      if(typeof window.__narradorSetTab === "function"){
        window.__narradorSetTab(tab);
      } else {
        manualSetTab(tab);
      }
    }catch(err){
      console.warn("Narrador v17: fallback navigation",err);
      manualSetTab(tab);
    }
    // Verify that the requested view actually became active. If not, force it.
    setTimeout(()=>{
      if(!$(MAP[tab])?.classList.contains("active")) manualSetTab(tab);
    },40);
  }

  function navTap(event){
    const item = event.target?.closest?.(".bottomNav .navItem[data-tab]");
    if(!item) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if(now-lastTap < 180) return;
    lastTap = now;
    go(item.dataset.tab);
  }

  // Capture phase avoids invisible/overlapping app layers swallowing taps.
  document.addEventListener("click",navTap,true);
  document.addEventListener("touchend",navTap,{capture:true,passive:false});

  window.__narradorForceTab = go;
})();
