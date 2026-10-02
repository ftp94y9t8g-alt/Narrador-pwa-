// Narrador v12: stable iPhone/Safari compatibility layer for local Kokoro voices.
// Keeps the working Spanish phonemizer, but limits raw-audio memory while the
// continuous player prepares upcoming passages in the background.

const KOKORO_URLS = [
  "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm",
  "https://esm.sh/kokoro-js@1.2.1?bundle"
];

const EPHONE_URLS = [
  "https://cdn.jsdelivr.net/npm/ephone@1.0.2/ephone.js",
  "https://unpkg.com/ephone@1.0.2/ephone.js?module"
];

let kokoroModulePromise = null;
let spanishPhonemizerPromise = null;
let singletonPromise = null;

function setVoiceNote(message, isError = false) {
  const note = document.querySelector("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = isError ? "IA local · problema de voz" : "IA local beta · v12";
  if (span) span.textContent = message;
}

function shortError(error) {
  const raw = error?.message || error?.name || String(error || "Error desconocido");
  return String(raw).replace(/\s+/g, " ").slice(0, 240);
}

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
    kokoroModulePromise = importFromFallbacks(
      KOKORO_URLS,
      mod => !!mod?.KokoroTTS,
      "Kokoro"
    ).catch(error => {
      kokoroModulePromise = null;
      throw error;
    });
  }
  return kokoroModulePromise;
}

async function loadSpanishPhonemizer() {
  if (spanishPhonemizerPromise) return spanishPhonemizerPromise;

  spanishPhonemizerPromise = (async () => {
    setVoiceNote("Preparando pronunciación española local…");
    const mod = await importFromFallbacks(
      EPHONE_URLS,
      m => typeof m?.default === "function" && typeof m?.roa === "function",
      "pronunciador español"
    );

    const engine = await mod.default(mod.roa);
    if (!engine || typeof engine.textToIpa !== "function") {
      throw new Error("El pronunciador cargó sin textToIpa().");
    }

    const voices = typeof engine.getVoices === "function" ? engine.getVoices() : [];
    const hasLatAm = Array.isArray(voices) && voices.some(v => String(v?.name || "").toLowerCase() === "es-419");
    const voice = hasLatAm ? "es-419" : "es";
    engine.setVoice(voice);
    return { engine, voice };
  })().catch(error => {
    spanishPhonemizerPromise = null;
    throw error;
  });

  return spanishPhonemizerPromise;
}

async function phonemizeSpanish(text) {
  const { engine, voice } = await loadSpanishPhonemizer();
  engine.setVoice(voice);

  const normalized = String(text || "")
    .replace(/\u00ad/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  if (!normalized) throw new Error("No hay texto para fonetizar.");

  const ipa = engine.textToIpa(normalized);
  const phonemes = String(ipa || "").replace(/\s{2,}/g, " ").trim();
  if (!phonemes) throw new Error("El pronunciador no produjo fonemas para este texto.");
  return phonemes;
}

function addNarradorGeneration(tts) {
  const originalGenerate = tts.generate.bind(tts);
  const cache = new Map();
  const pending = new Map();
  // RawAudio keeps Float32 PCM in memory. A small cache is safer on iPhone;
  // v12 also maintains a tiny Blob buffer for the passages immediately ahead.
  const MAX_CACHE = 4;

  async function generateUncached(text, { voice = "af_heart", speed = 1 } = {}) {
    if (!/^e[fm]_/.test(voice)) return originalGenerate(text, { voice, speed });

    let stage = "pronunciación";
    try {
      setVoiceNote("Analizando pronunciación…");
      const phonemes = await phonemizeSpanish(text);

      stage = "tokenización";
      const encoded = tts.tokenizer(phonemes, { truncation: true });
      const input_ids = encoded?.input_ids;
      if (!input_ids) throw new Error("El tokenizador no devolvió input_ids.");

      stage = "síntesis";
      setVoiceNote("Generando audio neuronal…");
      const audio = await tts.generate_from_ids(input_ids, { voice, speed });
      if (!audio) throw new Error("El motor no devolvió audio.");

      setVoiceNote(`Voz IA lista · ${tts.narradorDevice === "webgpu" ? "GPU" : "modo compatible"}.`);
      return audio;
    } catch (error) {
      console.error(`Narrador: error durante ${stage}`, error);
      setVoiceNote(`Falló la ${stage}: ${shortError(error)}`, true);
      throw error;
    }
  }

  tts.generate = async (text, { voice = "af_heart", speed = 1 } = {}) => {
    const normalizedText = String(text || "").trim();
    const key = `${voice}|${Number(speed).toFixed(3)}|${normalizedText}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);

    const job = generateUncached(normalizedText, { voice, speed })
      .then(audio => {
        cache.set(key, audio);
        while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return audio;
      })
      .finally(() => pending.delete(key));

    pending.set(key, job);
    return job;
  };

  tts.prepareLanguage = async (language = "es") => {
    if (String(language).toLowerCase().startsWith("es")) await loadSpanishPhonemizer();
    return true;
  };

  tts.clearNarradorCache = () => cache.clear();
  return tts;
}

export class KokoroTTS {
  static async prepareLanguage(language = "es") {
    if (String(language).toLowerCase().startsWith("es")) await loadSpanishPhonemizer();
    return true;
  }

  static async from_pretrained(modelId, options = {}) {
    if (singletonPromise) return singletonPromise;

    singletonPromise = (async () => {
      setVoiceNote("Preparando el motor neuronal…");
      const mod = await importKokoroModule();
      const BaseKokoroTTS = mod.KokoroTTS;

      const common = { ...options };
      delete common.dtype;
      delete common.device;

      const attempts = [];
      const ios = isIOSDevice();

      // WebGPU can be faster, but on iPhone the model may push Safari over its
      // per-tab memory limit. Keep the known-working Q4/WASM path on iOS.
      if (!ios && typeof navigator !== "undefined" && navigator.gpu) {
        attempts.push({ dtype: "q4", device: "webgpu", label: "GPU" });
      }
      attempts.push({ dtype: "q4", device: "wasm", label: "WASM Q4" });
      if (!ios) attempts.push({ dtype: "q8", device: "wasm", label: "WASM Q8" });

      let lastError = null;
      for (const attempt of attempts) {
        try {
          setVoiceNote(`Cargando IA con ${attempt.label}… La primera preparación puede tardar.`);
          const base = await BaseKokoroTTS.from_pretrained(modelId, {
            ...common,
            dtype: attempt.dtype,
            device: attempt.device,
          });
          base.narradorDevice = attempt.device;
          const tts = addNarradorGeneration(base);
          setVoiceNote(`Motor neuronal listo · ${attempt.device === "webgpu" ? "aceleración GPU" : "modo compatible"}.`);
          return tts;
        } catch (error) {
          lastError = error;
          console.warn(`Narrador: Kokoro ${attempt.label} falló`, error);
        }
      }

      setVoiceNote(`No pudo iniciarse el motor neuronal: ${shortError(lastError)}`, true);
      throw lastError || new Error("No se pudo iniciar Kokoro en este iPhone.");
    })().catch(error => {
      singletonPromise = null;
      throw error;
    });

    return singletonPromise;
  }
}
