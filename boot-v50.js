// Narrador v50 — real startup splash/readiness gate for iPhone PWA.
(() => {
  const ROOT_CLASS = "narradorBooting50";
  const MIN_VISIBLE_MS = 720;
  const MAX_WAIT_MS = 3200;
  const startedAt = performance.now();

  document.documentElement.classList.add(ROOT_CLASS);

  const style = document.createElement("style");
  style.id = "narradorBootStyle50";
  style.textContent = `
    html.${ROOT_CLASS} body{overflow:hidden!important}
    html.${ROOT_CLASS} body>*{visibility:hidden!important}
    html.${ROOT_CLASS} body>#narradorBoot50{visibility:visible!important}
    #narradorBoot50{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 50% 28%,rgba(79,115,255,.13),transparent 31rem),#f5f7fb;opacity:1;transition:opacity .32s ease;visibility:visible!important}
    #narradorBoot50.bootDone50{opacity:0;pointer-events:none}
    .narradorBootCard50{display:grid;justify-items:center;text-align:center;padding:28px 30px;min-width:min(78vw,330px)}
    .narradorBootLogo50{width:92px;height:92px;border-radius:29px;display:grid;place-items:center;color:#fff;font-size:43px;font-weight:950;letter-spacing:-.06em;background:linear-gradient(145deg,#3e78ff,#6954ff);box-shadow:0 22px 52px rgba(70,91,255,.30);animation:narradorBootPulse50 1.55s ease-in-out infinite}
    .narradorBootName50{margin-top:22px;font-size:31px;font-weight:950;letter-spacing:-.045em;color:#111827}
    .narradorBootSub50{margin-top:5px;font-size:14px;font-weight:650;color:#7a8495}
    .narradorBootTrack50{width:180px;height:5px;border-radius:999px;background:#e2e7f1;margin-top:28px;overflow:hidden}
    .narradorBootTrack50 i{display:block;height:100%;width:42%;border-radius:inherit;background:linear-gradient(90deg,#4077ff,#7658ff);animation:narradorBootMove50 1.05s ease-in-out infinite}
    .narradorBootStatus50{min-height:18px;margin-top:12px;font-size:12px;font-weight:750;color:#8b95a6}
    @keyframes narradorBootPulse50{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
    @keyframes narradorBootMove50{0%{transform:translateX(-110%)}100%{transform:translateX(350%)}}
    @media(prefers-reduced-motion:reduce){.narradorBootLogo50,.narradorBootTrack50 i{animation:none}.narradorBootTrack50 i{width:100%}}
  `;
  document.head.appendChild(style);

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function withTimeout(promise, ms) { return Promise.race([promise, wait(ms)]); }

  function createOverlay() {
    if (document.getElementById("narradorBoot50")) return document.getElementById("narradorBoot50");
    const el = document.createElement("div");
    el.id = "narradorBoot50";
    el.innerHTML = `<div class="narradorBootCard50"><div class="narradorBootLogo50">N</div><div class="narradorBootName50">Narrador</div><div class="narradorBootSub50">Audiolibros inteligentes</div><div class="narradorBootTrack50"><i></i></div><div id="narradorBootStatus50" class="narradorBootStatus50">Preparando tu biblioteca…</div></div>`;
    document.body.prepend(el);
    return el;
  }

  function status(text) {
    const el = document.getElementById("narradorBootStatus50");
    if (el) el.textContent = text;
  }

  function warmLibrary() {
    return new Promise(resolve => {
      let request;
      try { request = indexedDB.open("narrador-db-v1"); }
      catch (_) { resolve(); return; }
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
      request.onupgradeneeded = () => {
        try { request.transaction?.abort(); } catch (_) {}
        resolve();
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains("books")) { db.close(); resolve(); return; }
          const tx = db.transaction("books", "readonly");
          const req = tx.objectStore("books").count();
          req.onsuccess = req.onerror = () => { try { db.close(); } catch (_) {} resolve(); };
        } catch (_) { try { db.close(); } catch (_) {} resolve(); }
      };
    });
  }

  function warmVoices() {
    return new Promise(resolve => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      try { if (speechSynthesis.getVoices().length) { resolve(); return; } } catch (_) {}
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        try { speechSynthesis.removeEventListener?.("voiceschanged", done); } catch (_) {}
        resolve();
      };
      try { speechSynthesis.addEventListener?.("voiceschanged", done, { once: true }); } catch (_) {}
      setTimeout(done, 650);
    });
  }

  async function warmWorker() {
    if (!("serviceWorker" in navigator)) return;
    try { await withTimeout(navigator.serviceWorker.ready, 900); } catch (_) {}
  }

  async function boot() {
    const overlay = createOverlay();
    status("Preparando tu biblioteca…");
    await withTimeout(warmLibrary(), 900);
    status("Cargando voces del iPhone…");
    await withTimeout(warmVoices(), 800);
    status("Terminando de preparar Narrador…");
    await withTimeout(warmWorker(), 950);

    const elapsed = performance.now() - startedAt;
    if (elapsed < MIN_VISIBLE_MS) await wait(MIN_VISIBLE_MS - elapsed);
    status("Listo");
    await wait(90);

    document.documentElement.classList.remove(ROOT_CLASS);
    overlay?.classList.add("bootDone50");
    setTimeout(() => overlay?.remove(), 380);
    window.__narradorBootReady50 = true;
    window.dispatchEvent(new CustomEvent("narrador:boot-ready"));
  }

  const safety = setTimeout(() => {
    if (window.__narradorBootReady50) return;
    document.documentElement.classList.remove(ROOT_CLASS);
    document.getElementById("narradorBoot50")?.remove();
    window.__narradorBootReady50 = true;
    window.dispatchEvent(new CustomEvent("narrador:boot-ready"));
  }, MAX_WAIT_MS);

  const run = () => boot().catch(() => {
    document.documentElement.classList.remove(ROOT_CLASS);
    document.getElementById("narradorBoot50")?.remove();
    window.__narradorBootReady50 = true;
    window.dispatchEvent(new CustomEvent("narrador:boot-ready"));
  }).finally(() => clearTimeout(safety));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
})();