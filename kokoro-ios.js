// Narrador v7: iPhone/Safari compatibility layer for local Kokoro voices.
// Kokoro.js 1.2.1 loads the model in Safari, but its public voice table currently
// enables English voices only. Spanish voice files exist in the v1.0 model, so
// Narrador adds its own Spanish phonemization path and calls generate_from_ids().

const MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm",
  "https://esm.sh/kokoro-js@1.2.1?bundle"
];

const PHONEMIZER_URLS = [
  "https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/+esm",
  "https://esm.sh/phonemizer@1.2.1?bundle"
];

let kokoroModulePromise = null;
let phonemizerModulePromise = null;

function setVoiceNote(message, isError = false) {
  const note = document.querySelector("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = isError ? "IA local · problema de voz" : "IA local beta · v7";
  if (span) span.textContent = message;
}

function shortError(error) {
  const raw = error?.message || error?.name || String(error || "Error desconocido");
  return String(raw).replace(/\s+/g, " ").slice(0, 220);
}

async function importFromFallbacks(urls, validator, label) {
  let lastError = null;
  for (const url of urls) {
    try {
      const mod = await import(url);
      if (validator(mod)) return mod;
      throw new Error(`${label} cargó, pero no expuso la función esperada.`);
    } catch (error) {
      lastError = error;
      console.warn(`Narrador: falló ${label} desde ${url}`, error);
    }
  }
  throw lastError || new Error(`No se pudo cargar ${label}.`);
}

async function importKokoroModule() {
  if (!kokoroModulePromise) {
    kokoroModulePromise = importFromFallbacks(MODULE_URLS, mod => !!mod?.KokoroTTS, "Kokoro")
      .catch(error => { kokoroModulePromise = null; throw error; });
  }
  return kokoroModulePromise;
}

async function importPhonemizerModule() {
  if (!phonemizerModulePromise) {
    phonemizerModulePromise = importFromFallbacks(PHONEMIZER_URLS, mod => typeof mod?.phonemize === "function", "fonetizador español")
      .catch(error => { phonemizerModulePromise = null; throw error; });
  }
  return phonemizerModulePromise;
}

const PUNCTUATION_SPLIT = /([;:,.!?¡¿—…"'«»“”(){}\[\]]+)/g;
const PUNCTUATION_ONLY = /^[;:,.!?¡¿—…"'«»“”(){}\[\]]+$/;

async function phonemizeSpanish(text) {
  const { phonemize } = await importPhonemizerModule();
  const pieces = String(text || "").split(PUNCTUATION_SPLIT).filter(Boolean);
  const out = [];

  for (const piece of pieces) {
    if (PUNCTUATION_ONLY.test(piece)) {
      out.push(piece);
      continue;
    }
    if (!piece.trim()) {
      out.push(piece);
      continue;
    }

    let result;
    try {
      // Latin-American Spanish first; generic Spanish is the fallback.
      result = await phonemize(piece, "es-419");
    } catch (_) {
      result = await phonemize(piece, "es");
    }
    const phones = Array.isArray(result) ? result.join(" ") : String(result || "");
    out.push(phones);
  }

  const phonemes = out.join("").replace(/\s{2,}/g, " ").trim();
  if (!phonemes) throw new Error("El fonetizador no produjo fonemas para este texto.");
  return phonemes;
}

function addSpanishGeneration(tts) {
  const originalGenerate = tts.generate.bind(tts);

  tts.generate = async (text, { voice = "af_heart", speed = 1 } = {}) => {
    if (!/^e[fm]_/.test(voice)) {
      return originalGenerate(text, { voice, speed });
    }

    let stage = "fonetización";
    try {
      setVoiceNote("Preparando pronunciación natural en español…");
      const phonemes = await phonemizeSpanish(text);

      stage = "tokenización";
      const encoded = tts.tokenizer(phonemes, { truncation: true });
      const input_ids = encoded?.input_ids;
      if (!input_ids) throw new Error("El tokenizador no devolvió input_ids.");

      stage = "síntesis";
      setVoiceNote("Generando audio neuronal en español…");
      const audio = await tts.generate_from_ids(input_ids, { voice, speed });
      if (!audio) throw new Error("El motor no devolvió audio.");

      setVoiceNote("Voz IA en español lista. El audio se genera localmente en este iPhone.");
      return audio;
    } catch (error) {
      console.error(`Narrador: error durante ${stage}`, error);
      setVoiceNote(`Falló la ${stage}: ${shortError(error)}`, true);
      throw error;
    }
  };

  return tts;
}

export class KokoroTTS {
  static async from_pretrained(modelId, options = {}) {
    setVoiceNote("Preparando el motor neuronal para iPhone. La primera vez puede tardar unos minutos.");
    const mod = await importKokoroModule();
    const BaseKokoroTTS = mod.KokoroTTS;

    const common = { ...options };
    delete common.dtype;
    delete common.device;

    // q4 is attempted first to lower RAM use on iPhone. q8 is the fallback.
    const attempts = [
      { dtype: "q4", device: "wasm" },
      { dtype: "q8", device: "wasm" }
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        setVoiceNote(`Cargando modelo ${attempt.dtype.toUpperCase()}… Mantén Narrador abierto durante la primera carga.`);
        const tts = await BaseKokoroTTS.from_pretrained(modelId, {
          ...common,
          ...attempt,
        });
        setVoiceNote("Motor neuronal listo. Preparando soporte de voz en español…");
        return addSpanishGeneration(tts);
      } catch (error) {
        lastError = error;
        console.warn(`Narrador: Kokoro ${attempt.dtype} falló`, error);
      }
    }

    setVoiceNote(`No pudo iniciarse el motor neuronal: ${shortError(lastError)}`, true);
    throw lastError || new Error("No se pudo iniciar Kokoro en este iPhone.");
  }
}
