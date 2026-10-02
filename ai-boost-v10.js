import { KokoroTTS } from "./kokoro-ios.js?v=13";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const PREF_KEY = "narrador-voice-prefs-v10";
let warmPromise = null;
let previewAudio = null;
let previewUrl = null;
let restoring = false;

const $ = (s) => document.querySelector(s);

function setNote(message, error = false) {
  const note = $("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = error ? "Narración con IA · requiere atención" : "Narración con IA";
  if (span) span.textContent = message;
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
      setNote("Pronunciación lista. La IA neuronal se cargará cuando entres a escuchar.");
    }
  } catch (error) {
    console.warn("Narrador: no se pudo preparar la pronunciación", error);
  }
}

async function warmAI() {
  if (warmPromise) return warmPromise;
  warmPromise = (async () => {
    setNote("Preparando la IA en segundo plano…");
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "wasm",
    });
    try { await tts.prepareLanguage?.(languageFromUI()); } catch (_) {}
    window.__narradorWarmTTS = tts;
    setNote("IA preparada · narración continua lista para iPhone.");
    return tts;
  })().catch(error => {
    warmPromise = null;
    console.warn("Narrador: no se pudo preparar la IA", error);
    setNote("La IA se preparará cuando pulses reproducir.");
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
    ? "The night fell, and everything became quiet."
    : "La noche cayó y todo quedó en silencio.";
}

async function playFastPreview(button) {
  window.__narradorUnlockAudio?.();
  stopPreview();

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando muestra…";

  try {
    const tts = await warmAI();
    const language = languageFromUI();
    let voice = $("#voiceSelect")?.value || (language === "es" ? "em_alex" : "am_michael");

    if (language === "es" && !/^e[fm]_/.test(voice)) voice = /^.f_/.test(voice) ? "ef_dora" : "em_alex";
    if (language === "en" && /^e[fm]_/.test(voice)) voice = voice.startsWith("ef_") ? "af_bella" : "am_michael";

    const speed = Math.max(0.8, Math.min(1.15, Number($("#speedRange")?.value || 0.95)));
    setNote("Generando una muestra corta…");
    const raw = await tts.generate(previewTextFor(language), { voice, speed });
    previewUrl = URL.createObjectURL(raw.toBlob());
    previewAudio = new Audio(previewUrl);
    previewAudio.onended = () => {
      stopPreview();
      button.disabled = false;
      button.textContent = original;
      setNote("IA lista. Las muestras repetidas se reutilizan sin volver a generarlas.");
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
    setNote(`No se pudo generar la muestra: ${String(error?.message || error).slice(0, 180)}`, true);
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

window.addEventListener("DOMContentLoaded", restorePrefs);
window.__narradorWarmAI = warmAI;
