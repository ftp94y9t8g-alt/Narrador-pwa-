// Narrador v67 — immersive reader + reliable Now Playing controls.
// Keeps the stable playback/import engines intact and fixes interaction/layout issues seen on iPhone.
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  let repairing = false;

  function currentBookContext(){
    const host = $("#homeFeatured");
    return {
      id: host?.dataset?.bookId || "",
      chapter: Math.max(0, Number(host?.dataset?.chapter || 0) || 0)
    };
  }

  function openNativeSpeedSheet(){
    // The v45 control owns the real speed logic. Trigger its pointer path so iPhone
    // receives the same event sequence as a direct user tap, but keep Now Playing open.
    const target = $("#homeFeatured [data-home45-action='speed']") || $("[data-home45-action='speed']");
    if (target) {
      try {
        target.dispatchEvent(new PointerEvent("pointerdown", {
          bubbles:true,
          cancelable:true,
          pointerId:867,
          pointerType:"touch",
          isPrimary:true
        }));
        return true;
      } catch (_) {
        try { target.dispatchEvent(new Event("pointerdown", {bubbles:true,cancelable:true})); return true; } catch (_) {}
      }
    }

    // If the sheet already exists, opening it directly is a safe fallback.
    const sheet = $("#homeControlSheet45");
    const speedPane = $("#homeSpeedPane45");
    const voicePane = $("#homeVoicePane45");
    if (sheet && speedPane) {
      voicePane?.classList.add("hidden");
      speedPane.classList.remove("hidden");
      const title = $("#homeSheetTitle45");
      if (title) title.textContent = document.documentElement.dataset.narradorLocale === "es" ? "Velocidad" : "Speed";
      sheet.classList.add("open");
      document.body.classList.add("homeSheetOpen45");
      return true;
    }
    return false;
  }

  function openReaderFromNowPlaying(){
    const {id, chapter} = currentBookContext();
    if (!id) return false;
    const now = $("#n61NowPlaying");
    now?.classList.remove("open");
    try {
      if (typeof window.__narradorOpenReader === "function") {
        window.__narradorOpenReader(id, chapter, "home");
        return true;
      }
    } catch (_) {}
    return false;
  }

  function cleanReaderLine(text=""){
    let s = String(text)
      .replace(/\u00ad/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-\s*\n\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, "$1$2")
      .replace(/\s*\n\s*/g, " ")
      .replace(/[\t ]{2,}/g, " ")
      .replace(/\s+([,.;:!?…])/g, "$1")
      .replace(/([¿¡])\s+/g, "$1")
      .trim();

    // PDF text layers occasionally split the first consonant from the rest of an
    // uppercase word (for example "H ABIA"). Avoid Spanish one-letter words A/E/O/Y.
    s = s.replace(/\b([BCDFGHJKLMNPQRSTVWXZÁÉÍÓÚÜÑ])\s+([A-ZÁÉÍÓÚÜÑ]{2,})\b/g, "$1$2");
    return s;
  }

  function sourceTextForParagraph(p){
    let out = "";
    for (const node of [...p.childNodes]) {
      if (node.nodeName === "BR") out += "\n";
      else out += node.textContent || "";
    }
    return out;
  }

  function repairReaderText(){
    if (repairing) return;
    const root = $("#readerText");
    if (!root) return;
    repairing = true;
    try {
      root.querySelectorAll("p").forEach(p => {
        const raw = sourceTextForParagraph(p);
        const clean = cleanReaderLine(raw);
        if (clean && (p.childElementCount || p.textContent !== clean)) p.textContent = clean;
      });
    } finally { repairing = false; }
  }

  function markImmersiveState(){
    document.documentElement.classList.add("n67Immersive");
    repairReaderText();
  }

  function installHandlers(){
    // Capture before the v61 inline onclick handlers, which intentionally closed
    // Now Playing before proxying these actions.
    document.addEventListener("click", event => {
      const speed = event.target?.closest?.("#n61NowPlaying [data-n61-action='speed']");
      if (speed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openNativeSpeedSheet();
        return;
      }

      const read = event.target?.closest?.("#n64ReadWhile");
      if (read) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openReaderFromNowPlaying();
      }
    }, true);
  }

  function installObservers(){
    const reader = $("#readerView");
    if (reader && reader.dataset.n67Observed !== "1") {
      reader.dataset.n67Observed = "1";
      new MutationObserver(() => queueMicrotask(repairReaderText))
        .observe(reader, {childList:true, subtree:true});
    }

    const now = $("#n61NowPlaying");
    if (now && now.dataset.n67Observed !== "1") {
      now.dataset.n67Observed = "1";
      new MutationObserver(markImmersiveState)
        .observe(now, {attributes:true, attributeFilter:["class"]});
    }
  }

  function install(){
    markImmersiveState();
    installHandlers();
    installObservers();
    window.addEventListener("pageshow", () => setTimeout(markImmersiveState, 40));
    window.addEventListener("focus", () => setTimeout(markImmersiveState, 60));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(markImmersiveState, 50); });
    document.addEventListener("click", () => setTimeout(() => { installObservers(); repairReaderText(); }, 30), true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, {once:true});
  else install();

  window.__narradorUX67 = { repairReaderText, openNativeSpeedSheet, openReaderFromNowPlaying };
})();