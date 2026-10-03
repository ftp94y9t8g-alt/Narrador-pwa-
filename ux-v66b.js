// Narrador v66b — keep Library organize state consistent when search receives focus.
(() => {
  document.addEventListener("focusin", event => {
    if (event.target?.id !== "librarySearch") return;
    const wrap = document.querySelector("#library");
    const button = document.querySelector("#organizeBtn");
    if (!wrap?.classList.contains("organizing") || !button) return;
    try {
      button.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 777,
        pointerType: "touch",
        isPrimary: true
      }));
    } catch (_) {}
    setTimeout(() => window.__narradorUX66?.apply?.(), 20);
  }, true);
})();