// Narrador v38: rebuild the Library importer around the exact Home picker.
// One real PDF input (#pdfInput) is physically moved into whichever tab is active.
// This avoids duplicate iOS file inputs, hidden-view label targets, scripted .click(), and stale SW query races.
(() => {
  // Normalize every legacy service-worker registration to one stable URL.
  // Mark the old v34 patch as already handled so library-v33.js cannot rewrite it back.
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
      console.warn("Narrador v38: no se pudo normalizar el service worker", error);
    }
  }

  const $ = (s) => document.querySelector(s);
  let observer = null;

  function makeLibraryPlus() {
    const libraryHeader = $("#libraryView .mainHeader");
    if (!libraryHeader) return null;

    let plus = $("#libraryPlusV38");
    if (!plus) {
      plus = document.createElement("label");
      plus.id = "libraryPlusV38";
      plus.className = "homePlus";
      plus.htmlFor = "pdfInput";
      plus.setAttribute("for", "pdfInput");
      plus.setAttribute("aria-label", "Importar PDF");
      plus.textContent = "＋";
      plus.style.webkitUserSelect = "none";
      plus.style.userSelect = "none";
      plus.style.webkitTouchCallout = "none";
      plus.style.touchAction = "manipulation";

      const old = $("#libraryAddV37") || $("#libraryImportNative") || $("#libraryView .libraryPlus");
      if (old) old.replaceWith(plus);
      else libraryHeader.appendChild(plus);
    }
    return plus;
  }

  function disableLegacyLibraryPicker() {
    const oldInput = $("#pdfInput2");
    if (!oldInput) return;
    oldInput.setAttribute("aria-hidden", "true");
    oldInput.tabIndex = -1;
    oldInput.style.setProperty("display", "none", "important");
    oldInput.style.pointerEvents = "none";
  }

  function syncRealPickerLocation() {
    const input = $("#pdfInput");
    const homePlus = $("#homeView .homePlus");
    const libraryPlus = $("#libraryPlusV38");
    if (!input || !homePlus || !libraryPlus) return;

    const libraryActive = $("#libraryView")?.classList.contains("active") || document.body.dataset.mainTab === "library";
    const target = libraryActive ? libraryPlus : homePlus;

    // Keep the exact same working input immediately beside the active label.
    if (input.previousElementSibling !== target) target.insertAdjacentElement("afterend", input);
  }

  function rebuild() {
    const input = $("#pdfInput");
    if (!input) return;
    input.accept = "application/pdf,.pdf";
    makeLibraryPlus();
    disableLegacyLibraryPicker();
    syncRealPickerLocation();

    if (!observer) {
      observer = new MutationObserver(syncRealPickerLocation);
      const home = $("#homeView");
      const library = $("#libraryView");
      if (home) observer.observe(home, { attributes: true, attributeFilter: ["class"] });
      if (library) observer.observe(library, { attributes: true, attributeFilter: ["class"] });
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-main-tab"] });
    }
  }

  // Run before the user can tap, and again on PWA resume.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rebuild, { once: true });
  else rebuild();
  window.addEventListener("pageshow", rebuild);

  // Extra iOS safeguard: just before native label activation, ensure #pdfInput
  // is physically in the active Library header. We do not preventDefault.
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.("#libraryPlusV38")) syncRealPickerLocation();
  }, true);
})();