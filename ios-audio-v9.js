// Narrador v9: iPhone/Safari audio-unlock bridge.
// Neural speech generation can take long enough that Safari no longer treats
// a later HTMLAudioElement.play() call as part of the original user gesture.
// We unlock a Web Audio context at tap time, then transparently play generated
// blob URLs through that already-authorized context.

(() => {
  const NativeAudio = window.Audio;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !NativeAudio) return;

  let context = null;

  function getContext() {
    if (!context) context = new AudioContextCtor();
    return context;
  }

  function unlockAudio() {
    try {
      const ctx = getContext();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      // Starting a one-sample silent buffer during the gesture permanently
      // unlocks Web Audio playback for the current page session on iOS Safari.
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (error) {
      console.warn("Narrador: no se pudo desbloquear Web Audio", error);
    }
  }

  function shouldUnlock(target) {
    return !!target?.closest?.("#previewBtn, #playBtn");
  }

  document.addEventListener("pointerdown", (event) => {
    if (shouldUnlock(event.target)) unlockAudio();
  }, { capture: true, passive: true });

  document.addEventListener("touchstart", (event) => {
    if (shouldUnlock(event.target)) unlockAudio();
  }, { capture: true, passive: true });

  class NarradorBlobAudio {
    constructor(src = "") {
      this._src = src;
      this._source = null;
      this._stopped = false;
      this.onended = null;
      this.onerror = null;
    }

    get src() { return this._src; }
    set src(value) {
      if (!value) this.pause();
      this._src = value || "";
    }

    async play() {
      this._stopped = false;
      try {
        const ctx = getContext();
        if (ctx.state === "suspended") await ctx.resume();

        const response = await fetch(this._src);
        if (!response.ok) throw new Error(`No se pudo abrir el audio generado (${response.status}).`);
        const bytes = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        if (this._stopped) return;

        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        source.onended = () => {
          this._source = null;
          if (!this._stopped && typeof this.onended === "function") this.onended();
        };
        this._source = source;
        source.start(0);
      } catch (error) {
        console.error("Narrador: falló la reproducción Web Audio", error);
        if (typeof this.onerror === "function") this.onerror(error);
        throw error;
      }
    }

    pause() {
      this._stopped = true;
      if (this._source) {
        try { this._source.stop(); } catch (_) {}
        try { this._source.disconnect(); } catch (_) {}
        this._source = null;
      }
    }
  }

  function NarradorAudio(src = "") {
    if (typeof src === "string" && src.startsWith("blob:")) {
      return new NarradorBlobAudio(src);
    }
    return new NativeAudio(src);
  }

  try {
    Object.setPrototypeOf(NarradorAudio, NativeAudio);
    NarradorAudio.prototype = NativeAudio.prototype;
  } catch (_) {}

  window.Audio = NarradorAudio;
  window.__narradorUnlockAudio = unlockAudio;
})();
