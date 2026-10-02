const CACHE = "narrador-v50";
const CORE = [
  "./",
  "./index.html",
  "./boot-v50.js?v=50",
  "./bootstrap-v40.js?v=50",
  "./pdf-cover-v40.js?v=50",
  "./home-player-v42.js?v=50",
  "./home-late-v47.js?v=50",
  "./ai-audiobook-v50.js?v=50",
  "./ios-speech-history-v49.js?v=50",
  "./library-firsttap-v43.js?v=50",
  "./styles.css?v=16",
  "./interface-v15.css?v=16",
  "./interface-v16.css?v=16",
  "./interface-v17.css?v=17",
  "./interface-v18.css?v=18",
  "./interface-v19.css?v=31",
  "./interface-v16.js?v=16",
  "./interaction-v19.js?v=31",
  "./library-v33.js?v=37",
  "./app.js?v=16",
  "./detector-v4.js?v=16",
  "./kokoro-ios.js?v=16",
  "./ios-audio-v9.js?v=16",
  "./ai-boost-v10.js?v=16",
  "./continuous-ai-v12.js?v=16",
  "./manifest.webmanifest",
  "./icon.svg"
];

function enhanceHtml(html) {
  const cleaned = html
    .replace(/\s*<script[^>]*src=["']\.\/boot-v50\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/bootstrap-v38\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/bootstrap-v40\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/pdf-cover-v40\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/home-player-v42\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/home-fix-v44\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/home-recovery-v46\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/home-late-v47\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/ai-audiobook-v50\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/ios-speech-history-v49\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/library-firsttap-v43\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n");

  const withHead = cleaned.replace(
    "</head>",
    '  <script src="./boot-v50.js?v=50"></script>\n  <script src="./bootstrap-v40.js?v=50"></script>\n  <script type="module" src="./pdf-cover-v40.js?v=50"></script>\n  <script src="./home-player-v42.js?v=50"></script>\n  <script src="./library-firsttap-v43.js?v=50"></script>\n</head>'
  );

  return withHead.replace(
    "</body>",
    '  <script src="./home-late-v47.js?v=50"></script>\n  <script src="./ai-audiobook-v50.js?v=50"></script>\n  <script src="./ios-speech-history-v49.js?v=50"></script>\n</body>'
  );
}

async function enhancedHtmlResponse(response) {
  const html = enhanceHtml(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  event.waitUntil((async () => {
    const target = new URL("./", self.registration.scope).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        try { await client.focus(); return; } catch (_) {}
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === "navigate" || /(?:index\.html|\/$)/.test(url.pathname);

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const network = await fetch(event.request, { cache: "no-store" });
        const enhanced = await enhancedHtmlResponse(network);
        const cache = await caches.open(CACHE);
        await cache.put("./index.html", enhanced.clone());
        return enhanced;
      } catch (error) {
        const cached = await caches.match("./index.html") || await caches.match("./");
        if (!cached) throw error;
        return enhancedHtmlResponse(cached);
      }
    })());
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});