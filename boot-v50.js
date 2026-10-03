// Narrador boot guard — simplified, fail-safe startup for iPhone PWA.
(() => {
  const ROOT = "narradorBooting50";
  const NativeMO = window.MutationObserver;

  // Protect startup from MutationObserver feedback loops created by later UI layers.
  if (NativeMO && !window.__narradorStartupObserverGuard67) {
    window.__narradorStartupObserverGuard67 = true;
    class NarradorSafeMutationObserver extends NativeMO {
      constructor(callback) {
        let scheduled = false;
        let latestMutations = [];
        let latestObserver = null;
        super((mutations, observer) => {
          latestMutations = mutations;
          latestObserver = observer;
          if (scheduled) return;
          scheduled = true;
          setTimeout(() => {
            scheduled = false;
            try { callback(latestMutations, latestObserver); } catch (e) { console.error(e); }
          }, 40);
        });
      }
    }
    window.MutationObserver = NarradorSafeMutationObserver;
    setTimeout(() => {
      if (window.MutationObserver === NarradorSafeMutationObserver) window.MutationObserver = NativeMO;
    }, 1800);
  }

  document.documentElement.classList.add(ROOT);

  const style = document.createElement("style");
  style.id = "narradorBootStyle50";
  style.textContent = `
    html.${ROOT} body{overflow:hidden!important}
    html.${ROOT} body>*{visibility:hidden!important}
    html.${ROOT} body>#narradorBoot50{visibility:visible!important}
    #narradorBoot50{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 50% 28%,rgba(79,115,255,.13),transparent 31rem),#f5f7fb;opacity:1;transition:opacity .28s ease;visibility:visible!important}
    #narradorBoot50.bootDone50{opacity:0;pointer-events:none}
    .narradorBootCard50{display:grid;justify-items:center;text-align:center;padding:28px 30px;min-width:min(78vw,330px)}
    .narradorBootLogo50{width:92px;height:92px;border-radius:29px;display:grid;place-items:center;color:#fff;font-size:43px;font-weight:950;background:linear-gradient(145deg,#3e78ff,#6954ff);box-shadow:0 22px 52px rgba(70,91,255,.30)}
    .narradorBootName50{margin-top:22px;font-size:31px;font-weight:950;letter-spacing:-.045em;color:#111827}
    .narradorBootSub50{margin-top:5px;font-size:14px;font-weight:650;color:#7a8495}
    .narradorBootTrack50{width:180px;height:5px;border-radius:999px;background:#e2e7f1;margin-top:28px;overflow:hidden}
    .narradorBootTrack50 i{display:block;height:100%;width:42%;border-radius:inherit;background:linear-gradient(90deg,#4077ff,#7658ff);animation:narradorBootMove50 1.05s ease-in-out infinite}
    .narradorBootStatus50{min-height:18px;margin-top:12px;font-size:12px;font-weight:750;color:#8b95a6}
    @keyframes narradorBootMove50{0%{transform:translateX(-110%)}100%{transform:translateX(350%)}}
  `;
  document.head.appendChild(style);

  function overlay() {
    let el = document.getElementById("narradorBoot50");
    if (el) return el;
    el = document.createElement("div");
    el.id = "narradorBoot50";
    el.innerHTML = `<div class="narradorBootCard50"><div class="narradorBootLogo50">N</div><div class="narradorBootName50">Narrador</div><div class="narradorBootSub50">Audiolibros inteligentes</div><div class="narradorBootTrack50"><i></i></div><div class="narradorBootStatus50">Preparando tu biblioteca…</div></div>`;
    document.body.prepend(el);
    return el;
  }

  function finish() {
    if (window.__narradorBootReady50) return;
    window.__narradorBootReady50 = true;
    document.documentElement.classList.remove(ROOT);
    const el = document.getElementById("narradorBoot50");
    el?.classList.add("bootDone50");
    setTimeout(() => el?.remove(), 320);
    window.dispatchEvent(new CustomEvent("narrador:boot-ready"));
  }

  const run = () => {
    overlay();
    // The splash is presentation only. It never waits on IndexedDB, voices, or service workers.
    setTimeout(finish, 900);
    setTimeout(finish, 2400);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, {once:true});
  else run();
})();