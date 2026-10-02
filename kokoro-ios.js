// Narrador v8: iPhone/Safari compatibility layer for local Kokoro voices.
// Kokoro.js 1.2.1 can run the neural model in Safari, but its bundled phonemizer
// only exposes English. Narrador uses ephone (eSpeak NG phoneme generation for
// the web) with the Romance language pack for true Spanish / Latin-American IPA.

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

function setVoiceNote(message, isError = false) {
  const note = document.querySelector("#aiNote");
  if (!note) return;
  const strong = note.querySelector("strong");
  const span = note.querySelector("span");
  if (strong) strong.textContent = isError ? "IA local · problema de voz" : "IA local beta · v8";
  if (span) span.textContent = message;
}

function shortError(error) {
  const raw = error?.message || error?.name || String(error || "Error desconocido");
  return String(raw).replace(/\s+/g, " ").slice(0, 240);
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
    setVoiceNote("Descargando el pronunciador español local… Esto solo ocurre la primera vez.");

    const mod = await importFromFallbacks(
      EPHONE_URLS,
      m => typeof m?.default === "function" && typeof m?.roa === "function",
      "pronunciador español"
    );

    // `roa` is Ephone's Romance-language pack and includes both `es` and
    // `es-419` (Latin-American Spanish). It is loaded only when Spanish is used.
    const engine = await mod.default(mod.roa);
    if (!engine || typeof engine.textToIpa !== "function") {
      throw new Error("El pronunciador cargó sin textToIpa().");
    }

    const voices = typeof engine.getVoices === "function" ? engine.getVoices() : [];
    const hasLatAm = Array.isArray(voices) && voices.some(v => String(v?.name || "").toLowerCase() === "es-419");
    const voice = hasLatAm ? "es-419" : "es";
    engine.setVoice(voice);

    setVoiceNote(`Pronunciación ${voice === "es-419" ? "latinoamericana" : "española"} lista. Preparando narración neuronal…`);
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

function addSpanishGeneration(tts) {
  const originalGenerate = tts.generate.bind(tts);

  tts.generate = async (text, { voice = "af_heart", speed = 1 } = {}) => {
    if (!/^e[fm]_/.test(voice)) {
      return originalGenerate(text, { voice, speed });
    }

    let stage = "pronunciación";
    try {
      setVoiceNote("Analizando la pronunciación del español…");
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
        setVoiceNote("Motor neuronal listo. El pronunciador español se cargará al escuchar la primera muestra.");
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
