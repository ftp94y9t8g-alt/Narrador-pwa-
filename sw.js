const CACHE = "narrador-v16-final";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=16",
  "./interface-v15.css?v=16",
  "./interface-v16.css?v=16",
  "./interface-v16.js?v=16",
  "./app.js?v=16",
  "./detector-v4.js?v=16",
  "./kokoro-ios.js?v=16",
  "./ios-audio-v9.js?v=16",
  "./ai-boost-v10.js?v=16",
  "./continuous-ai-v12.js?v=16",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && /(?:index\.html|app\.js|styles\.css|interface-v15\.css|interface-v16\.css|interface-v16\.js|detector-v4\.js|kokoro-ios\.js|ios-audio-v9\.js|ai-boost-v10\.js|continuous-ai-v12\.js|\/$)/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }))
  );
});