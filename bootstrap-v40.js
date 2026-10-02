// Narrador v48 — stable bootstrap + Library PDF picker.
// IMPORTANT: constrain observers on #homeFeatured to direct-child mutations only.
// v45 accidentally observed deep text/attribute changes and then changed those same
// nodes inside its callback, creating a MutationObserver feedback loop that could
// starve iOS Safari's event loop and make every button appear dead.
(() => {
  if (!window.__narradorHomeObserverGuard && window.MutationObserver) {
    const NativeMutationObserver = window.MutationObserver;
    window.MutationObserver = class NarradorMutationObserver extends NativeMutationObserver {
      observe(target, options = {}) {
        if (target?.id === "homeFeatured" && options?.childList) {
          options = { ...options, childList: true, subtree: false, attributes: false };
          delete options.attributeFilter;
          delete options.attributeOldValue;
        }
        return super.observe(target, options);
      }
    };
    window.__narradorHomeObserverGuard = true;
  }

  // Keep every legacy registration on one stable service-worker URL and prevent
  // library-v33 from forcing an old v34 worker back onto installed PWAs.
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
      console.warn("Narrador v48: no se pudo normalizar el service worker", error);
    }
  }

  let installed = false;
  let observer = null;

  function installLibraryPicker(allowCreate = false) {
    const header = document.querySelector("#libraryView .mainHeader");
    if (!header) return false;

    // Wait for the parser to create the original #pdfInput2 before touching the
    // Library header. This avoids duplicate IDs and guarantees app.js binds to
    // this exact node later in the document.
    let input = document.querySelector("#pdfInput2");
    if (!input && !allowCreate) return false;
    if (!input) {
      input = document.createElement("input");
      input.id = "pdfInput2";
      input.type = "file";
    }

    // Detach the input before removing any legacy wrapper that contains it.
    if (input.parentElement) input.parentElement.removeChild(input);

    [
      "#libraryAddV37",
      "#libraryImportNative",
      "#libraryPlusV38",
      "#libraryPlusV39",
      "#libraryPlusV40"
    ].forEach((selector) => document.querySelector(selector)?.remove());
    document.querySelectorAll("#libraryView .libraryPlus").forEach((el) => el.remove());

    const label = document.createElement("label");
    label.id = "libraryPlusV40";
    label.className = "homePlus";
    label.htmlFor = "pdfInput2";
    label.setAttribute("for", "pdfInput2");
    label.setAttribute("aria-label", "Importar PDF");
    label.textContent = "＋";

    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.removeAttribute("aria-hidden");
    input.removeAttribute("tabindex");
    input.removeAttribute("style");
    input.disabled = false;

    // Exact same DOM pattern as Home: label immediately followed by hidden input.
    header.appendChild(label);
    header.appendChild(input);

    installed = true;
    return true;
  }

  function start() {
    if (installLibraryPicker(false)) return;
    if (observer) return;
    observer = new MutationObserver(() => {
      if (installLibraryPicker(false)) {
        observer.disconnect();
        observer = null;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  start();
  document.addEventListener("DOMContentLoaded", () => {
    if (!installed) installLibraryPicker(true);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }, { once: true });
})();