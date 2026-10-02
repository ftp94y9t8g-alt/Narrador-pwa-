const CACHE = "narrador-v20";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=16",
  "./interface-v15.css?v=16",
  "./interface-v16.css?v=16",
  "./interface-v17.css?v=17",
  "./interface-v18.css?v=18",
  "./interface-v19.css?v=20",
  "./interface-v16.js?v=16",
  "./interaction-v19.js?v=20",
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

function enhanceHtml(html) {
  if (!html.includes("interface-v17.css")) {
    html = html.replace("</head>", '  <link rel="stylesheet" href="./interface-v17.css?v=17" />\n</head>');
  }
  if (!html.includes("interface-v18.css")) {
    html = html.replace("</head>", '  <link rel="stylesheet" href="./interface-v18.css?v=18" />\n</head>');
  }
  html = html.replace(/<link rel="stylesheet" href="\.\/interface-v19\.css\?v=\d+" \/>\s*/g, "");
  html = html.replace(/<script src="\.\/interaction-v19\.js\?v=\d+"><\/script>\s*/g, "");
  html = html.replace("</head>", '  <link rel="stylesheet" href="./interface-v19.css?v=20" />\n</head>');
  html = html.replace("</body>", '  <script src="./interaction-v19.js?v=20"></script>\n</body>');
  return html;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  const isAppHtml = url.origin === self.location.origin &&
    (event.request.mode === "navigate" || /(?:index\.html|\/$)/.test(url.pathname));

  if (isAppHtml) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async (response) => {
          const html = enhanceHtml(await response.text());
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}
          });
        })
        .catch(async () => {
          const cached = await caches.match("./index.html") || await caches.match("./");
          if (!cached) throw new Error("Narrador offline HTML unavailable");
          const html = enhanceHtml(await cached.text());
          return new Response(html, {headers:{"Content-Type":"text/html; charset=utf-8"}});
        })
    );
    return;
  }

  if (url.origin === self.location.origin && /(?:app\.js|styles\.css|interface-v15\.css|interface-v16\.css|interface-v17\.css|interface-v18\.css|interface-v19\.css|interface-v16\.js|interaction-v19\.js|detector-v4\.js|kokoro-ios\.js|ios-audio-v9\.js|ai-boost-v10\.js|continuous-ai-v12\.js)/.test(url.pathname)) {
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