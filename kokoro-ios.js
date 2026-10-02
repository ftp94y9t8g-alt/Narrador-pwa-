// iPhone/Safari compatibility layer for Narrador's local Kokoro voice.
// Keeps the public KokoroTTS API used by app.js while loading a browser-friendly ESM build
// and preferring the smaller q4 model on memory-constrained mobile devices.

const MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm",
  "https://esm.sh/kokoro-js@1.2.1?bundle"
];

let kokoroModulePromise = null;

function setVoiceNote(message, isError = false) {
  const note = document.querySelector("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = isError ? "IA local · problema de compatibilidad" : "IA local beta";
  if (span) span.textContent = message;
}

async function importKokoroModule() {
  if (kokoroModulePromise) return kokoroModulePromise;
  kokoroModulePromise = (async () => {
    let lastError = null;
    for (const url of MODULE_URLS) {
      try {
        const mod = await import(url);
        if (mod?.KokoroTTS) return mod;
        throw new Error("El módulo cargó sin KokoroTTS.");
      } catch (error) {
        lastError = error;
        console.warn("Narrador: no se pudo cargar Kokoro desde", url, error);
      }
    }
    throw lastError || new Error("No se pudo cargar el motor Kokoro.");
  })().catch((error) => {
    kokoroModulePromise = null;
    throw error;
  });
  return kokoroModulePromise;
}

export class KokoroTTS {
  static async from_pretrained(modelId, options = {}) {
    setVoiceNote("Preparando el motor neuronal para iPhone. La primera vez puede tardar unos minutos.");
    const mod = await importKokoroModule();
    const BaseKokoroTTS = mod.KokoroTTS;

    const common = { ...options };
    delete common.dtype;
    delete common.device;

    const attempts = [
      { dtype: "q4", device: "wasm" },
      { dtype: "q8", device: "wasm" }
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        setVoiceNote(`Cargando voz IA local (${attempt.dtype.toUpperCase()})… Mantén Narrador abierto durante la primera carga.`);
        const tts = await BaseKokoroTTS.from_pretrained(modelId, {
          ...common,
          ...attempt,
        });
        setVoiceNote("Motor neuronal listo. La voz se genera localmente en este iPhone.");
        return tts;
      } catch (error) {
        lastError = error;
        console.warn(`Narrador: Kokoro ${attempt.dtype} falló`, error);
      }
    }

    const message = lastError?.message ? String(lastError.message).slice(0, 180) : "Error desconocido";
    setVoiceNote(`No pudo iniciarse el motor neuronal: ${message}`, true);
    throw lastError || new Error("No se pudo iniciar Kokoro en este iPhone.");
  }
}
