// Narrador v61 — keep the UX observer shallow so iPhone cannot enter a mutation feedback loop.
(() => {
  if (window.__narradorObserverGuard61) return;
  window.__narradorObserverGuard61 = true;
  const Native = window.MutationObserver;
  if (!Native?.prototype?.observe) return;
  const observe = Native.prototype.observe;
  Native.prototype.observe = function(target, options = {}) {
    if (target === document.body && options?.childList && options?.subtree) {
      options = { ...options, subtree: false, attributes: false, characterData: false };
    }
    return observe.call(this, target, options);
  };
})();
