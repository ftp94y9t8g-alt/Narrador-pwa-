const CACHE = "narrador-v62";
const CORE = [
  "./",
  "./index.html",
  "./auth-v51.js?v=59",
  "./locale-v58.js?v=59",
  "./theme-v53.js?v=59",
  "./boot-v50.js?v=59",
  "./bootstrap-v40.js?v=59",
  "./pdf-cover-v40.js?v=59",
  "./home-player-v42.js?v=59",
  "./home-late-v47.js?v=59",
  "./ai-audiobook-v50.js?v=59",
  "./ios-speech-history-v49.js?v=59",
  "./library-firsttap-v43.js?v=59",
  "./experience-v54.js?v=59",
  "./home-controls-v55.js?v=59",
  "./import-preview-v56.js?v=59",
  "./daily-experience-v56.js?v=59",
  "./polish-v57.js?v=59",
  "./ux-guard-v61.js?v=611",
  "./ux-v61.js?v=611",
  "./ux-v62.js?v=62",
  "./styles.css?v=16",
  "./interface-v15.css?v=16",
  "./interface-v16.css?v=16",
  "./interface-v17.css?v=17",
  "./interface-v18.css?v=18",
  "./interface-v19.css?v=31",
  "./harmony-v59.css?v=59",
  "./harmony-v60.css?v=60",
  "./ux-v61.css?v=611",
  "./ux-v62.css?v=62",
  "./interface-v16.js?v=16",
  "./interaction-v19.js?v=31",
  "./library-v33.js?v=37",
  "./app.js?v=16",
  "./detector-v4.js?v=16",
  "./kokoro-ios.js?v=16",
  "./ios-audio-v9.js?v=16",
  "./ai-boost-v10.js?v=52",
  "./continuous-ai-v12.js?v=16",
  "./manifest.webmanifest",
  "./icon.svg"
];

function enhanceHtml(html) {
  const cleaned = html
    .replace(/\s*<script[^>]*src=["']\.\/auth-v51\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/locale-v58\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/theme-v53\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
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
    .replace(/\s*<script[^>]*src=["']\.\/library-firsttap-v43\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/experience-v54\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/home-controls-v55\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/import-preview-v56\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/daily-experience-v56\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/polish-v57\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/ux-guard-v61\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/ux-v61\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<script[^>]*src=["']\.\/ux-v62\.js(?:\?v=\d+)?["'][^>]*><\/script>\s*/gi, "\n")
    .replace(/\s*<link[^>]*href=["']\.\/harmony-v59\.css(?:\?v=\d+)?["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<link[^>]*href=["']\.\/harmony-v60\.css(?:\?v=\d+)?["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<link[^>]*href=["']\.\/ux-v61\.css(?:\?v=\d+)?["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<link[^>]*href=["']\.\/ux-v62\.css(?:\?v=\d+)?["'][^>]*>\s*/gi, "\n")
    .replace(/\.\/ai-boost-v10\.js\?v=\d+/gi, "./ai-boost-v10.js?v=52");

  const withHead = cleaned.replace(
    "</head>",
    '  <script src="./auth-v51.js?v=59"></script>\n  <script src="./locale-v58.js?v=59"></script>\n  <script src="./theme-v53.js?v=59"></script>\n  <script src="./boot-v50.js?v=59"></script>\n  <script src="./bootstrap-v40.js?v=59"></script>\n  <script type="module" src="./pdf-cover-v40.js?v=59"></script>\n  <script src="./home-player-v42.js?v=59"></script>\n  <script src="./library-firsttap-v43.js?v=59"></script>\n  <link rel="stylesheet" href="./harmony-v59.css?v=59" />\n  <link rel="stylesheet" href="./harmony-v60.css?v=60" />\n  <link rel="stylesheet" href="./ux-v61.css?v=611" />\n  <link rel="stylesheet" href="./ux-v62.css?v=62" />\n</head>'
  );

  return withHead.replace(
    "</body>",
    '  <script src="./import-preview-v56.js?v=59"></script>\n  <script src="./home-late-v47.js?v=59"></script>\n  <script src="./ai-audiobook-v50.js?v=59"></script>\n  <script src="./ios-speech-history-v49.js?v=59"></script>\n  <script src="./experience-v54.js?v=59"></script>\n  <script src="./home-controls-v55.js?v=59"></script>\n  <script src="./daily-experience-v56.js?v=59"></script>\n  <script src="./polish-v57.js?v=59"></script>\n  <script src="./ux-guard-v61.js?v=611"></script>\n  <script src="./ux-v61.js?v=611"></script>\n  <script src="./ux-v62.js?v=62"></script>\n</body>'
  );
}

async function enhancedHtmlResponse(response) {
  const html = enhanceHtml(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
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
      if ("focus" in client) { try { await client.focus(); return; } catch (_) {} }
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