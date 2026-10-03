// Narrador v64 — visual-system consolidation based on the approved redesign.
// This layer deliberately leaves the stable speech/AI/import engines untouched.
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const PREF_KEY = "narrador-reader-prefs-v64";
  let applying = false;

  const supported = new Set(["es","en","fr","pt","it","de"]);
  const locale = (() => {
    const html = document.documentElement.dataset.narradorLocale;
    if (supported.has(html)) return html;
    const raw = String(navigator.languages?.[0] || navigator.language || "en").toLowerCase().split(/[-_]/)[0];
    return supported.has(raw) ? raw : "en";
  })();

  const D = {
    readWhile:{es:"Leer mientras escucho",en:"Read while listening",fr:"Lire pendant l’écoute",pt:"Ler enquanto escuta",it:"Leggi durante l’ascolto",de:"Beim Hören lesen"},
    readerSettings:{es:"Ajustes de lectura",en:"Reading settings",fr:"Réglages de lecture",pt:"Ajustes de leitura",it:"Impostazioni di lettura",de:"Leseeinstellungen"},
    size:{es:"Tamaño",en:"Size",fr:"Taille",pt:"Tamanho",it:"Dimensione",de:"Größe"},
    typeface:{es:"Tipografía",en:"Typeface",fr:"Police",pt:"Tipografia",it:"Carattere",de:"Schrift"},
    serif:{es:"Serif",en:"Serif",fr:"Serif",pt:"Serif",it:"Serif",de:"Serif"},
    sans:{es:"Sans",en:"Sans",fr:"Sans",pt:"Sans",it:"Sans",de:"Sans"},
    legible:{es:"Legible",en:"Readable",fr:"Lisible",pt:"Legível",it:"Leggibile",de:"Lesbar"},
    spacing:{es:"Interlineado",en:"Line spacing",fr:"Interligne",pt:"Entrelinha",it:"Interlinea",de:"Zeilenabstand"},
    compact:{es:"Compacto",en:"Compact",fr:"Compact",pt:"Compacto",it:"Compatto",de:"Kompakt"},
    normal:{es:"Normal",en:"Normal",fr:"Normal",pt:"Normal",it:"Normale",de:"Normal"},
    wide:{es:"Amplio",en:"Wide",fr:"Aéré",pt:"Amplo",it:"Ampio",de:"Weit"},
    theme:{es:"Tema",en:"Theme",fr:"Thème",pt:"Tema",it:"Tema",de:"Thema"},
    light:{es:"Claro",en:"Light",fr:"Clair",pt:"Claro",it:"Chiaro",de:"Hell"},
    sepia:{es:"Sepia",en:"Sepia",fr:"Sépia",pt:"Sépia",it:"Seppia",de:"Sepia"},
    dark:{es:"Oscuro",en:"Dark",fr:"Sombre",pt:"Escuro",it:"Scuro",de:"Dunkel"},
    recent:{es:"Recientes",en:"Recent",fr:"Récents",pt:"Recentes",it:"Recenti",de:"Zuletzt"},
    inProgress:{es:"En curso",en:"In progress",fr:"En cours",pt:"Em andamento",it:"In corso",de:"In Bearbeitung"},
    finished:{es:"Terminados",en:"Finished",fr:"Terminés",pt:"Concluídos",it:"Terminati",de:"Beendet"},
    all:{es:"Todos",en:"All",fr:"Tous",pt:"Todos",it:"Tutti",de:"Alle"}
  };
  const t = k => D[k]?.[locale] || D[k]?.en || k;

  function unknown(s="") {
    return /^(?:autor no especificado|author not specified|auteur non spécifié|autor não especificado|autore non specificato|autor nicht angegeben|unknown)$/i.test(String(s).trim());
  }

  function sentenceCaseIfShouting(text="") {
    const raw = String(text).replace(/\s+/g," ").trim();
    const letters = raw.match(/[A-Za-zÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÇÃÕ]/g) || [];
    if (letters.length < 4) return raw;
    const upper = letters.filter(x => x === x.toUpperCase() && x !== x.toLowerCase()).length;
    if (upper / letters.length < .82) return raw;
    const m = raw.match(/^((?:\d+\.?|[IVXLCDM]+\.?)(?:\s+|\s*[—–-]\s*))?(.*)$/i);
    const lead = m?.[1] || "";
    let rest = (m?.[2] || raw).toLocaleLowerCase(locale);
    rest = rest.replace(/^([a-záéíóúüñàèìòùâêîôûäëïöüçãõ])/i, c => c.toLocaleUpperCase(locale));
    return `${lead}${rest}`.trim();
  }

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      return {
        size: Math.max(16, Math.min(26, Number(p.size || 19))),
        font: ["serif","sans","legible"].includes(p.font) ? p.font : "serif",
        spacing: ["compact","normal","wide"].includes(p.spacing) ? p.spacing : "normal",
        theme: ["light","sepia","dark"].includes(p.theme) ? p.theme : "light"
      };
    } catch (_) { return {size:19,font:"serif",spacing:"normal",theme:"light"}; }
  }

  function savePrefs(next) {
    const p = {...loadPrefs(),...next};
    try { localStorage.setItem(PREF_KEY,JSON.stringify(p)); } catch (_) {}
    applyReaderPrefs();
    paintReaderControls();
  }

  function applyReaderPrefs() {
    const p = loadPrefs();
    const text = $("#readerText");
    const reader = $("#readerView");
    if (!text || !reader) return;
    text.style.fontSize = `${p.size}px`;
    text.style.lineHeight = p.spacing === "compact" ? "1.42" : p.spacing === "wide" ? "1.86" : "1.62";
    text.style.fontFamily = p.font === "serif"
      ? "Iowan Old Style, Charter, Georgia, Times New Roman, serif"
      : p.font === "legible"
        ? "Atkinson Hyperlegible, Verdana, -apple-system, BlinkMacSystemFont, sans-serif"
        : "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif";
    reader.dataset.n64ReaderTheme = p.theme;
  }

  function ensureReaderControls() {
    const panel = $("#n61ReaderSheet .n61ReaderPanel");
    const options = panel?.querySelector(".n61ReaderOptions");
    if (!panel || !options || options.dataset.n64 === "1") return;
    options.dataset.n64 = "1";
    const head = panel.querySelector(".n61ReaderHead h3");
    if (head) head.textContent = t("readerSettings");
    options.innerHTML = `
      <div class="n64ReaderGroup n64SizeGroup">
        <label>${t("size")}</label>
        <div class="n64SizeStepper"><button type="button" data-n64-size="-1">−</button><strong data-n64-size-label>19 pt</strong><button type="button" data-n64-size="1">+</button></div>
      </div>
      <div class="n64ReaderGroup"><label>${t("typeface")}</label><div class="n64Segment" data-n64-group="font">
        <button type="button" data-value="serif">${t("serif")}</button><button type="button" data-value="sans">${t("sans")}</button><button type="button" data-value="legible">${t("legible")}</button>
      </div></div>
      <div class="n64ReaderGroup"><label>${t("spacing")}</label><div class="n64Segment" data-n64-group="spacing">
        <button type="button" data-value="compact">${t("compact")}</button><button type="button" data-value="normal">${t("normal")}</button><button type="button" data-value="wide">${t("wide")}</button>
      </div></div>
      <div class="n64ReaderGroup"><label>${t("theme")}</label><div class="n64Segment n64ThemeSegment" data-n64-group="theme">
        <button type="button" data-value="light">${t("light")}</button><button type="button" data-value="sepia">${t("sepia")}</button><button type="button" data-value="dark">${t("dark")}</button>
      </div></div>`;

    options.addEventListener("click", e => {
      const sizeBtn = e.target.closest("[data-n64-size]");
      if (sizeBtn) {
        const p = loadPrefs();
        savePrefs({size: Math.max(16,Math.min(26,p.size + Number(sizeBtn.dataset.n64Size || 0)))});
        return;
      }
      const btn = e.target.closest(".n64Segment [data-value]");
      if (!btn) return;
      const group = btn.closest("[data-n64-group]")?.dataset.n64Group;
      if (!group) return;
      savePrefs({[group]:btn.dataset.value});
    });
    paintReaderControls();
  }

  function paintReaderControls() {
    const p = loadPrefs();
    const root = $("#n61ReaderSheet");
    const label = root?.querySelector("[data-n64-size-label]");
    if (label) label.textContent = `${p.size} pt`;
    ["font","spacing","theme"].forEach(group => {
      $$( `[data-n64-group="${group}"] [data-value]`, root || document).forEach(btn => btn.classList.toggle("active",btn.dataset.value === p[group]));
    });
  }

  function ensureReadWhileListening() {
    const now = $("#n61NowPlaying .n61NowPanel");
    if (!now || $("#n64ReadWhile")) return;
    const btn = document.createElement("button");
    btn.id = "n64ReadWhile";
    btn.type = "button";
    btn.innerHTML = `<span class="n64BookGlyph">▣</span><span>${t("readWhile")}</span>`;
    const actions = now.querySelector(".n61NowActions");
    (actions?.parentNode || now).insertBefore(btn, actions?.nextSibling || null);
    btn.onclick = () => {
      try { window.__narradorUX61?.closeNowPlaying?.(); } catch (_) {}
      setTimeout(() => $("#homeFeatured .v18Open")?.click(),40);
    };
  }

  function cleanVisibleMetadata() {
    // Unknown-author placeholders create noise in the new system; hide rather than invent data.
    $$("#homeView .v18HomeAuthor,#bookAuthorLine,.libraryAuthor,.historyAuthor,.n61NowAuthor,.n62ShelfCard span").forEach(el => {
      const isUnknown = unknown(el.textContent || "");
      el.classList.toggle("n64UnknownAuthor",isUnknown);
    });

    // Preserve stored chapter names; only normalize visually when the PDF supplied all-caps text.
    $$("#chapters .chapterRow h4,#dailySheet56 [data-chapter56] strong,.n61NowChapter,#readerChapterTitle").forEach(el => {
      if (!el.dataset.n64Original) el.dataset.n64Original = el.textContent || "";
      const raw = el.dataset.n64Original || el.textContent || "";
      const cleaned = sentenceCaseIfShouting(raw);
      if (cleaned && el.textContent !== cleaned) el.textContent = cleaned;
    });

    $$(".eyebrow").forEach(el => {
      if (!el.dataset.n64Original) el.dataset.n64Original = el.textContent || "";
      el.textContent = sentenceCaseIfShouting(el.dataset.n64Original);
    });
  }

  function decorateChapterStates() {
    const sheet = $("#dailySheet56.open");
    if (!sheet) return;
    const rows = $$("[data-chapter56]",sheet);
    if (!rows.length) return;
    const current = rows.findIndex(r => r.classList.contains("active"));
    rows.forEach((r,i) => {
      r.classList.toggle("n64ChapterDone",current > 0 && i < current);
      r.classList.toggle("n64ChapterCurrent",i === current);
    });
  }

  function polishLibraryFilters() {
    const map = {all:t("all"),recent:t("recent"),progress:t("inProgress"),finished:t("finished")};
    const bar = $("#libraryView .filterBar");
    if (!bar) return;
    Object.entries(map).forEach(([key,label]) => {
      const btn = bar.querySelector(`[data-filter="${key}"]`);
      if (btn) btn.textContent = label;
    });
    // Do not remove History yet: v64 treats this as an A/B-safe visual consolidation.
  }

  function applyAll() {
    if (applying) return;
    applying = true;
    try {
      ensureReaderControls();
      ensureReadWhileListening();
      applyReaderPrefs();
      cleanVisibleMetadata();
      decorateChapterStates();
      polishLibraryFilters();
      document.documentElement.classList.add("n64VisualSystem");
    } finally { applying = false; }
  }

  function install() {
    applyAll();
    const observer = new MutationObserver(() => setTimeout(applyAll,0));
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
    window.addEventListener("pageshow",()=>setTimeout(applyAll,80));
    window.addEventListener("focus",()=>setTimeout(applyAll,100));
    window.addEventListener("narrador:auth-ready",()=>setTimeout(applyAll,120));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(applyAll,80);});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install();
  window.__narradorUX64 = {apply:applyAll,readerPrefs:loadPrefs};
})();