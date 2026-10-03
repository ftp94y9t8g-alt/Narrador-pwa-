// Narrador v53 — per-profile Light / Dark appearance.
(() => {
  const SESSION_KEY = "narrador-auth-session-v51";
  const THEME_KEY = "narrador-theme-v53";
  const VALID = new Set(["light", "dark"]);

  function currentUserId() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return session?.userId ? String(session.userId) : "guest";
    } catch (_) {
      return "guest";
    }
  }

  function storageKey() {
    return `${THEME_KEY}::${currentUserId()}`;
  }

  function savedTheme() {
    try {
      const value = localStorage.getItem(storageKey());
      return VALID.has(value) ? value : "light";
    } catch (_) {
      return "light";
    }
  }

  function setTheme(theme, persist = true) {
    theme = VALID.has(theme) ? theme : "light";
    document.documentElement.dataset.narradorTheme = theme;
    document.documentElement.style.colorScheme = theme;
    if (document.body) document.body.dataset.narradorTheme = theme;
    if (persist) {
      try { localStorage.setItem(storageKey(), theme); } catch (_) {}
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0f17" : "#f4f6fb");

    document.querySelectorAll("[data-theme53]").forEach(button => {
      const active = button.dataset.theme53 === theme;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const label = document.getElementById("theme53State");
    if (label) label.textContent = theme === "dark" ? "Oscuro" : "Claro";
  }

  // Apply before the app paints whenever this file is injected in <head>.
  setTheme(savedTheme(), false);

  function installStyle() {
    if (document.getElementById("theme53Style")) return;
    const style = document.createElement("style");
    style.id = "theme53Style";
    style.textContent = `
      html[data-narrador-theme="dark"]{
        --bg:#0b0f17;--surface:#141a24;--surface2:#101620;--text:#f3f6fb;--muted:#9aa6b7;--line:#273141;--accent:#5b8cff;--accent2:#8a6cff;--accentSoft:#18243b;--shadow:0 18px 45px rgba(0,0,0,.28);--shadowSoft:0 8px 24px rgba(0,0,0,.22)
      }
      html[data-narrador-theme="dark"],html[data-narrador-theme="dark"] body{background:#0b0f17!important;color:#f3f6fb!important}
      html[data-narrador-theme="dark"] body{background:radial-gradient(circle at 20% -10%,rgba(91,140,255,.10),transparent 28rem),radial-gradient(circle at 95% 10%,rgba(138,108,255,.08),transparent 24rem),#0b0f17!important}
      html[data-narrador-theme="dark"] h1,html[data-narrador-theme="dark"] h2,html[data-narrador-theme="dark"] h3,html[data-narrador-theme="dark"] h4,html[data-narrador-theme="dark"] strong{color:#f4f7fb}
      html[data-narrador-theme="dark"] p,html[data-narrador-theme="dark"] .brandSub,html[data-narrador-theme="dark"] .v18HomeAuthor,html[data-narrador-theme="dark"] .v18PlayerAuthor,html[data-narrador-theme="dark"] .v18Times,html[data-narrador-theme="dark"] .historyAuthor{color:#9aa6b7!important}
      html[data-narrador-theme="dark"] .card,html[data-narrador-theme="dark"] .bookRow,html[data-narrador-theme="dark"] .chapterRow,html[data-narrador-theme="dark"] .v18Player,html[data-narrador-theme="dark"] .homeQuickAction,html[data-narrador-theme="dark"] .historyRow,html[data-narrador-theme="dark"] .settingRow,html[data-narrador-theme="dark"] .settingsStack,html[data-narrador-theme="dark"] .auth51Profile{background:#141a24!important;border-color:#273141!important;color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .continueInner{background:linear-gradient(135deg,#151b25 20%,#101622 100%)!important;border-color:#253044!important;color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .empty{background:rgba(20,26,36,.82)!important;border-color:#334055!important}
      html[data-narrador-theme="dark"] select,html[data-narrador-theme="dark"] input:not([type="range"]),html[data-narrador-theme="dark"] textarea{background:#0f1520!important;color:#f3f6fb!important;border-color:#303b4d!important}
      html[data-narrador-theme="dark"] .chapterNavBtns button,html[data-narrador-theme="dark"] .transport button{background:#141a24!important;color:#e6ecf5!important;border-color:#2c3748!important}
      html[data-narrador-theme="dark"] .currentText{background:#101620!important;border-color:#273141!important}
      html[data-narrador-theme="dark"] .currentText p{color:#d9e0ea!important}
      html[data-narrador-theme="dark"] .progress,html[data-narrador-theme="dark"] .v18Progress,html[data-narrador-theme="dark"] .storageBar{background:#252e3d!important}
      html[data-narrador-theme="dark"] .bottomNav{background:rgba(15,20,29,.94)!important;border-color:#293446!important;box-shadow:0 16px 40px rgba(0,0,0,.42)!important}
      html[data-narrador-theme="dark"] .navItem{color:#8f9caf!important}
      html[data-narrador-theme="dark"] .navItem.active{background:#1b2740!important;color:#78a0ff!important}
      html[data-narrador-theme="dark"] .homeQuickAction strong,html[data-narrador-theme="dark"] .v18Transport button{color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .homeQuickAction span{color:#9aa6b7!important}
      html[data-narrador-theme="dark"] .homeQuickIcon{background:#1b2941!important;color:#78a0ff!important}
      html[data-narrador-theme="dark"] .aiNote{background:linear-gradient(135deg,#172034,#17253d)!important;border-color:#2d426a!important}
      html[data-narrador-theme="dark"] .aiNote strong{color:#82a5ff!important}
      html[data-narrador-theme="dark"] .aiNote span{color:#a8b6cc!important}
      html[data-narrador-theme="dark"] .playerStatus{background:#17233a!important;color:#83a7ff!important}
      html[data-narrador-theme="dark"] .toast{background:#eef2f7!important;color:#111827!important}
      html[data-narrador-theme="dark"] .bookActionMenu,html[data-narrador-theme="dark"] .editBookSheet{background:#141a24!important;color:#f3f6fb!important;border-color:#2c3747!important}
      html[data-narrador-theme="dark"] .bookActionMenu button,html[data-narrador-theme="dark"] .editBookSheet button{color:#e8edf5}
      html[data-narrador-theme="dark"] .homeSheetPanel45{background:#121823!important;color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .homeSheetHead45{background:rgba(18,24,35,.96)!important}
      html[data-narrador-theme="dark"] .homeSheetHead45 h3{color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .homeSheetBody45 select{background:#0e141e!important;color:#f3f6fb!important;border-color:#2c3748!important}
      html[data-narrador-theme="dark"] .homeSheetBackdrop45{background:rgba(0,0,0,.56)!important}
      html[data-narrador-theme="dark"] .ai50Panel{background:#121823!important;border-color:#2a3546!important;color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .ai50Secondary{background:#222c3a!important;color:#dce4ef!important}
      html[data-narrador-theme="dark"] .ai50Hint{background:#0f1520!important;border-color:#263245!important;color:#9eabbc!important}
      html[data-narrador-theme="dark"] #narradorAuth51{background:radial-gradient(circle at 50% 12%,rgba(88,122,255,.14),transparent 34rem),#0b0f17!important}
      html[data-narrador-theme="dark"] .auth51Card{background:rgba(18,24,35,.97)!important;border-color:#293446!important;box-shadow:0 28px 80px rgba(0,0,0,.40)!important}
      html[data-narrador-theme="dark"] .auth51Brand h1{color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .auth51Brand p,html[data-narrador-theme="dark"] .auth51Note{color:#96a3b5!important}
      html[data-narrador-theme="dark"] .auth51Tabs{background:#0d131d!important}
      html[data-narrador-theme="dark"] .auth51Tabs button{color:#8f9caf!important}
      html[data-narrador-theme="dark"] .auth51Tabs button.active{background:#1c2532!important;color:#f3f6fb!important;box-shadow:none!important}
      html[data-narrador-theme="dark"] .auth51Form input{background:#0d131d!important;color:#f3f6fb!important;border-color:#2c3748!important}
      html[data-narrador-theme="dark"] #narradorBoot50{background:radial-gradient(circle at 50% 28%,rgba(88,122,255,.12),transparent 31rem),#0b0f17!important}
      html[data-narrador-theme="dark"] .narradorBootName50{color:#f3f6fb!important}
      html[data-narrador-theme="dark"] .narradorBootSub50,html[data-narrador-theme="dark"] .narradorBootStatus50{color:#95a2b5!important}
      html[data-narrador-theme="dark"] .narradorBootTrack50{background:#222c3a!important}

      .theme53Row{cursor:default!important}
      .theme53Control{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;background:#eef2f7;border-radius:12px;min-width:158px}
      .theme53Control button{border:0;border-radius:9px;background:transparent;color:#697589;min-height:36px;padding:0 12px;font-size:13px;font-weight:850;touch-action:manipulation}
      .theme53Control button.active{background:#fff;color:#1d2735;box-shadow:0 3px 10px rgba(31,43,69,.10)}
      html[data-narrador-theme="dark"] .theme53Control{background:#0e141e}
      html[data-narrador-theme="dark"] .theme53Control button{color:#8e9bad}
      html[data-narrador-theme="dark"] .theme53Control button.active{background:#273244;color:#f5f7fb;box-shadow:none}
      @media(max-width:480px){.theme53Control{min-width:142px}.theme53Control button{padding:0 9px}}
    `;
    document.head.appendChild(style);
  }

  function installSettingsControl() {
    const view = document.getElementById("settingsView");
    if (!view || document.getElementById("theme53Control")) return;

    const note = view.querySelector(".settingsNote");
    const label = document.createElement("div");
    label.className = "settingGroupLabel theme53GroupLabel";
    label.textContent = "Apariencia";

    const stack = document.createElement("div");
    stack.className = "settingsStack theme53Stack";
    stack.innerHTML = `
      <div class="settingRow theme53Row">
        <div class="settingIcon">◐</div>
        <div class="settingText"><strong>Modo de interfaz</strong><span>Actualmente: <b id="theme53State">Claro</b></span></div>
        <div id="theme53Control" class="theme53Control" role="group" aria-label="Modo de interfaz">
          <button type="button" data-theme53="light" aria-pressed="false">☀ Claro</button>
          <button type="button" data-theme53="dark" aria-pressed="false">☾ Oscuro</button>
        </div>
      </div>`;

    if (note) {
      view.insertBefore(label, note);
      view.insertBefore(stack, note);
    } else {
      view.append(label, stack);
    }

    stack.addEventListener("click", event => {
      const button = event.target.closest?.("[data-theme53]");
      if (!button) return;
      event.preventDefault();
      setTheme(button.dataset.theme53, true);
    });

    setTheme(savedTheme(), false);
  }

  function install() {
    installStyle();
    installSettingsControl();
    setTheme(savedTheme(), false);

    const view = document.getElementById("settingsView");
    if (view && !view.dataset.theme53Observed) {
      view.dataset.theme53Observed = "1";
      new MutationObserver(() => installSettingsControl()).observe(view, { childList: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.addEventListener("pageshow", () => {
    installSettingsControl();
    setTheme(savedTheme(), false);
  });

  window.addEventListener("narrador:auth-ready", () => setTimeout(() => {
    installSettingsControl();
    setTheme(savedTheme(), false);
  }, 0));

  window.__narradorTheme53 = { set: theme => setTheme(theme, true), get: savedTheme };
})();
