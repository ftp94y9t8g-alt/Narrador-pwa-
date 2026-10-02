// Narrador v43 — force the Library + to open Files on the first tap when supported.
// Uses the browser's native showPicker() API only during the user's real touch gesture.
(() => {
  function tryOpen(event) {
    const trigger = event.target?.closest?.("#libraryPlusV40, #libraryPlusV39, #libraryPlusV38, #libraryAddV37");
    if (!trigger) return;
    const input = document.querySelector("#pdfInput2");
    if (!input || input.disabled || typeof input.showPicker !== "function") return;
    try {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.showPicker();
    } catch (_) {
      // If iOS refuses showPicker for any reason, leave the native label fallback available on the next event.
    }
  }

  // pointerdown preserves the direct user activation required by iOS.
  document.addEventListener("pointerdown", tryOpen, true);
})();