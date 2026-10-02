// Narrador v40 — rebuild Library import to exactly match the proven Home control.
// No moving inputs, no overlays, no scripted click, no pointer handlers.
// The Library control is simply: <label for="pdfInput2">+</label> + hidden <input id="pdfInput2" type="file">.
(() => {
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
      console.warn("Narrador v40: no se pudo normalizar el service worker", error);
    }
  }

  let installed = false;
  let observer = null;

  function installLibraryPicker() {
    const header = document.querySelector("#libraryView .mainHeader");
    if (!header) return false;

    // Reuse the original input node so any listener attached by app.js survives
    // even if this repair runs later than expected.
    let input = document.querySelector("#pdfInput2");
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
    if (installLibraryPicker()) return;
    if (observer) return;
    observer = new MutationObserver(() => {
      if (installLibraryPicker()) {
        observer.disconnect();
        observer = null;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  start();
  document.addEventListener("DOMContentLoaded", () => {
    if (!installed) installLibraryPicker();
  }, { once: true });
})();