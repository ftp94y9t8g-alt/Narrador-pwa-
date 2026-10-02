// Narrador v39: first-tap Library importer on iPhone.
// The exact working #pdfInput from Home is moved into a Library + host BEFORE the user taps.
// In Library the user taps the native file input itself — no label forwarding, no scripted click,
// and no DOM movement during the tap gesture.
(() => {
  if ("serviceWorker" in navigator) {
    try {
      const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (url, options = {}) => {
        const src = String(url || "");
        if (/sw\.js(?:\?|$)/.test(src)) {
          return originalRegister("./sw.js", { ...options, updateViaCache: "none" });
        }
        return originalRegister(url, options);
      };
      try { navigator.serviceWorker.__narradorV34Patched = true; } catch (_) {}
    } catch (error) {
      console.warn("Narrador v39: no se pudo normalizar el service worker", error);
    }
  }

  const $ = (s) => document.querySelector(s);
  let observer = null;

  function addStyle() {
    if ($("#libraryImportStyleV39")) return;
    const style = document.createElement("style");
    style.id = "libraryImportStyleV39";
    style.textContent = `
      #libraryPlusV39{
        position:relative!important;
        overflow:hidden!important;
        -webkit-user-select:none!important;
        user-select:none!important;
        -webkit-touch-callout:none!important;
        touch-action:manipulation!important;
      }
      #libraryPlusV39 .libraryPlusGlyphV39{
        pointer-events:none!important;
        position:absolute!important;
        inset:0!important;
        z-index:1!important;
        display:grid!important;
        place-items:center!important;
      }
      #libraryPlusV39 > #pdfInput{
        display:block!important;
        position:absolute!important;
        inset:0!important;
        width:100%!important;
        height:100%!important;
        min-width:100%!important;
        min-height:100%!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        opacity:.001!important;
        z-index:20!important;
        pointer-events:auto!important;
        cursor:pointer!important;
        -webkit-appearance:none!important;
        appearance:none!important;
        -webkit-user-select:none!important;
        user-select:none!important;
        -webkit-touch-callout:none!important;
        touch-action:manipulation!important;
      }
      #libraryPlusV39 > #pdfInput::-webkit-file-upload-button,
      #libraryPlusV39 > #pdfInput::file-selector-button{
        width:100%!important;
        height:100%!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        opacity:0!important;
      }
    `;
    document.head.appendChild(style);
  }

  function makeLibraryHost() {
    const header = $("#libraryView .mainHeader");
    if (!header) return null;

    let host = $("#libraryPlusV39");
    if (!host) {
      host = document.createElement("div");
      host.id = "libraryPlusV39";
      host.className = "homePlus";
      host.setAttribute("aria-label", "Importar PDF");
      host.innerHTML = '<span class="libraryPlusGlyphV39" aria-hidden="true">＋</span>';

      const old = $("#libraryPlusV38") || $("#libraryAddV37") || $("#libraryImportNative") || $("#libraryView .libraryPlus");
      if (old) old.replaceWith(host);
      else header.appendChild(host);
    }
    return host;
  }

  function disableLegacyLibraryPicker() {
    const oldInput = $("#pdfInput2");
    if (!oldInput) return;
    oldInput.setAttribute("aria-hidden", "true");
    oldInput.tabIndex = -1;
    oldInput.style.setProperty("display", "none", "important");
    oldInput.style.pointerEvents = "none";
  }

  function syncPicker() {
    const input = $("#pdfInput");
    const homePlus = $("#homeView .homePlus");
    const libraryHost = $("#libraryPlusV39");
    if (!input || !homePlus || !libraryHost) return;

    input.accept = "application/pdf,.pdf";
    const libraryActive = $("#libraryView")?.classList.contains("active") || document.body.dataset.mainTab === "library";

    if (libraryActive) {
      // Important: the native input is already inside the + before any tap occurs.
      if (input.parentElement !== libraryHost) libraryHost.appendChild(input);
    } else {
      // Restore the original Home arrangement so its proven label remains unchanged.
      if (input.previousElementSibling !== homePlus) homePlus.insertAdjacentElement("afterend", input);
    }
  }

  function init() {
    addStyle();
    makeLibraryHost();
    disableLegacyLibraryPicker();
    syncPicker();

    if (!observer) {
      observer = new MutationObserver(() => syncPicker());
      const home = $("#homeView");
      const library = $("#libraryView");
      if (home) observer.observe(home, { attributes: true, attributeFilter: ["class"] });
      if (library) observer.observe(library, { attributes: true, attributeFilter: ["class"] });
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-main-tab"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.addEventListener("pageshow", () => {
    makeLibraryHost();
    disableLegacyLibraryPicker();
    syncPicker();
  });
})();