const CACHE = "narrador-v13";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=13",
  "./app.js?v=13",
  "./detector-v4.js?v=13",
  "./kokoro-ios.js?v=13",
  "./ios-audio-v9.js?v=13",
  "./ai-boost-v10.js?v=13",
  "./continuous-ai-v12.js?v=13",
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

  if (url.origin === self.location.origin && /(?:index\.html|app\.js|styles\.css|detector-v4\.js|kokoro-ios\.js|ios-audio-v9\.js|ai-boost-v10\.js|continuous-ai-v12\.js|\/$)/.test(url.pathname)) {
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