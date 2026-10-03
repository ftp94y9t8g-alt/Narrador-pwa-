import { KokoroTTS } from "./kokoro-ios.js?v=13";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const PREF_KEY = "narrador-voice-prefs-v10";
let warmPromise = null;
let previewAudio = null;
let previewUrl = null;
let restoring = false;
let loadStartedAt = 0;
let loadProgress = 0;
let loadWatchdog = 0;

const $ = (s) => document.querySelector(s);

function setNote(message, error = false) {
  const note = $("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = error ? "Narración con IA · requiere atención" : "Narración con IA";
  if (span) span.textContent = message;
}

function setPreviewButton(message, disabled = true) {
  const button = $("#previewBtn");
  if (!button) return;
  button.disabled = disabled;
  button.textContent = message;
}

function languageFromUI() {
  const selected = $("#languageSelect")?.value || "auto";
  if (selected === "es" || selected === "en") return selected;
  const voice = $("#voiceSelect")?.value || "";
  if (/^e[fm]_/.test(voice)) return "es";
  if (/^[ab][fm]_/.test(voice)) return "en";
  return "es";
}

async function preparePronunciationOnly() {
  try {
    const language = languageFromUI();
    if (language === "es") {
      setNote("Preparando pronunciación española…");
      await KokoroTTS.prepareLanguage("es");
      if (!warmPromise && !window.__narradorWarmTTS) setNote("Pronunciación lista. La IA se descargará la primera vez que la uses.");
    }
  } catch (error) {
    console.warn("Narrador: no se pudo preparar la pronunciación", error);
  }
}

function progressPercent(info) {
  const value = Number(info?.progress);
  if (!Number.isFinite(value)) return null;
  if (value <= 1) return Math.max(0, Math.min(100, Math.round(value * 100)));
  return Math.max(0, Math.min(100, Math.round(value)));
}

function updateLoadProgress(info) {
  const pct = progressPercent(info);
  if (pct !== null) loadProgress = Math.max(loadProgress, pct);
  const label = loadProgress > 0 && loadProgress < 100
    ? `Descargando motor IA · ${loadProgress}%`
    : "Cargando motor IA por primera vez…";
  setNote(`${label} Mantén Narrador abierto; después quedará guardado en este iPhone.`);
  const button = $("#previewBtn");
  if (button?.disabled) button.textContent = loadProgress > 0 && loadProgress < 100 ? `Descargando IA · ${loadProgress}%` : "Cargando IA…";
}

function startLoadWatchdog() {
  clearInterval(loadWatchdog);
  loadWatchdog = setInterval(() => {
    if (!warmPromise || window.__narradorWarmTTS) {
      clearInterval(loadWatchdog);
      loadWatchdog = 0;
      return;
    }
    const seconds = Math.round((Date.now() - loadStartedAt) / 1000);
    if (seconds >= 90) {
      const pct = loadProgress ? ` (${loadProgress}%)` : "";
      setNote(`La primera descarga está tardando más de lo normal${pct}. Mantén la app abierta y verifica que el iPhone tenga conexión estable.`, true);
      const button = $("#previewBtn");
      if (button?.disabled) button.textContent = loadProgress ? `IA ${loadProgress}% · esperando…` : "IA · esperando conexión…";
    } else if (seconds >= 25 && !loadProgress) {
      setNote("Descargando el motor de voz IA. La primera vez puede tardar; las siguientes serán mucho más rápidas.");
    }
  }, 5000);
}

async function warmAI() {
  if (window.__narradorWarmTTS) return window.__narradorWarmTTS;
  if (warmPromise) return warmPromise;
  if (!navigator.onLine) {
    const error = new Error("Necesitas conexión a internet para descargar la IA por primera vez.");
    setNote(error.message, true);
    throw error;
  }

  loadStartedAt = Date.now();
  loadProgress = 0;
  setNote("Descargando el motor de voz IA por primera vez…");
  startLoadWatchdog();

  warmPromise = (async () => {
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "wasm",
      progress_callback: updateLoadProgress,
    });
    try { await tts.prepareLanguage?.(languageFromUI()); } catch (_) {}
    window.__narradorWarmTTS = tts;
    loadProgress = 100;
    clearInterval(loadWatchdog);
    loadWatchdog = 0;
    setNote("IA descargada y lista. A partir de ahora las muestras deben iniciar mucho más rápido.");
    return tts;
  })().catch(error => {
    clearInterval(loadWatchdog);
    loadWatchdog = 0;
    warmPromise = null;
    console.warn("Narrador: no se pudo preparar la IA", error);
    setNote("No se pudo descargar o iniciar la IA. Revisa la conexión y vuelve a intentarlo.", true);
    throw error;
  });
  return warmPromise;
}

function stopPreview() {
  if (previewAudio) {
    try { previewAudio.pause(); } catch (_) {}
    try { previewAudio.src = ""; } catch (_) {}
    previewAudio = null;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      engine: $("#engineSelect")?.value || "system",
      language: $("#languageSelect")?.value || "auto",
      voice: $("#voiceSelect")?.value || "",
      style: $("#styleSelect")?.value || "warm",
      speed: $("#speedRange")?.value || "0.95",
    }));
  } catch (_) {}
}

function restorePrefs() {
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch (_) {}
  if (!prefs) return;

  restoring = true;
  const engine = $("#engineSelect");
  const language = $("#languageSelect");
  const style = $("#styleSelect");
  const speed = $("#speedRange");

  if (engine && [...engine.options].some(o => o.value === prefs.engine)) engine.value = prefs.engine;
  if (language && [...language.options].some(o => o.value === prefs.language)) language.value = prefs.language;
  if (style && [...style.options].some(o => o.value === prefs.style)) style.value = prefs.style;
  if (speed && prefs.speed) {
    speed.value = prefs.speed;
    speed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  language?.dispatchEvent(new Event("change", { bubbles: true }));
  engine?.dispatchEvent(new Event("change", { bubbles: true }));

  queueMicrotask(() => {
    const voice = $("#voiceSelect");
    if (voice && [...voice.options].some(o => o.value === prefs.voice)) voice.value = prefs.voice;
    restoring = false;
    if (prefs.engine === "kokoro") preparePronunciationOnly();
  });
}

function previewTextFor(language) {
  return language === "en"
    ? "Welcome to Narrador. Your story is ready."
    : "Bienvenido a Narrador. Tu historia está lista.";
}

async function playFastPreview(button) {
  window.__narradorUnlockAudio?.();
  stopPreview();

  const original = "▶ Escuchar muestra";
  button.disabled = true;
  button.textContent = window.__narradorWarmTTS ? "Generando muestra…" : "Cargando IA…";

  try {
    const tts = await warmAI();
    const language = languageFromUI();
    let voice = $("#voiceSelect")?.value || (language === "es" ? "em_alex" : "am_michael");

    if (language === "es" && !/^e[fm]_/.test(voice)) voice = /^.f_/.test(voice) ? "ef_dora" : "em_alex";
    if (language === "en" && /^e[fm]_/.test(voice)) voice = voice.startsWith("ef_") ? "af_bella" : "am_michael";

    const speed = Math.max(0.8, Math.min(1.15, Number($("#speedRange")?.value || 0.95)));
    setNote("Motor IA listo · generando una muestra corta…");
    button.textContent = "Generando muestra…";
    const raw = await tts.generate(previewTextFor(language), { voice, speed });
    previewUrl = URL.createObjectURL(raw.toBlob());
    previewAudio = new Audio(previewUrl);
    previewAudio.onended = () => {
      stopPreview();
      button.disabled = false;
      button.textContent = original;
      setNote("IA lista en este iPhone. Puedes preparar el audiolibro completo.");
    };
    previewAudio.onerror = () => {
      stopPreview();
      button.disabled = false;
      button.textContent = original;
      setNote("La voz se generó, pero falló la reproducción.", true);
    };
    await previewAudio.play();
    button.textContent = "Reproduciendo…";
  } catch (error) {
    console.error("Narrador: falló la muestra rápida", error);
    button.disabled = false;
    button.textContent = original;
    setNote(`No se pudo preparar la IA: ${String(error?.message || error).slice(0, 170)}`, true);
  }
}

document.addEventListener("change", (event) => {
  if (event.target?.matches?.("#engineSelect, #languageSelect, #voiceSelect, #styleSelect")) savePrefs();

  if (!restoring && event.target?.matches?.("#engineSelect") && event.target.value === "kokoro") {
    preparePronunciationOnly();
  }
}, true);

document.addEventListener("input", (event) => {
  if (event.target?.matches?.("#speedRange")) savePrefs();
}, true);

document.addEventListener("click", (event) => {
  const button = event.target?.closest?.("#previewBtn");
  if (!button || $("#engineSelect")?.value !== "kokoro") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  playFastPreview(button);
}, { capture: true });

document.addEventListener("click", (event) => {
  const openedBook = event.target?.closest?.(".bookRow, .continueInner");
  if (!openedBook || $("#engineSelect")?.value !== "kokoro") return;
  setTimeout(() => warmAI().catch(() => {}), 700);
}, { capture: true });

document.addEventListener("pointerdown", (event) => {
  if (event.target?.closest?.("#previewBtn, #playBtn") && $("#engineSelect")?.value === "kokoro") {
    warmAI().catch(() => {});
  }
}, { capture: true, passive: true });

window.addEventListener("online", () => {
  if ($("#engineSelect")?.value === "kokoro" && !window.__narradorWarmTTS) setNote("Conexión recuperada. Toca Escuchar muestra para cargar la IA.");
});
window.addEventListener("offline", () => {
  if ($("#engineSelect")?.value === "kokoro" && !window.__narradorWarmTTS) setNote("Sin conexión. La primera descarga de la IA necesita internet.", true);
});
window.addEventListener("DOMContentLoaded", restorePrefs);
window.__narradorWarmAI = warmAI;
