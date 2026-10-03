const CACHE = "narrador-v71";
const CORE = [
  "./","./index.html","./auth-v51.js?v=59","./locale-v58.js?v=59","./theme-v53.js?v=59","./boot-v50.js?v=59","./bootstrap-v40.js?v=59","./pdf-cover-v40.js?v=59","./home-player-v42.js?v=59","./home-late-v47.js?v=59","./ai-audiobook-v50.js?v=59","./ios-speech-history-v49.js?v=59","./library-firsttap-v43.js?v=59","./experience-v54.js?v=59","./home-controls-v55.js?v=59","./import-preview-v56.js?v=59","./daily-experience-v56.js?v=59","./polish-v57.js?v=59","./ux-guard-v61.js?v=611","./ux-v61.js?v=611","./ux-v62.js?v=62","./ux-v63.js?v=63","./ux-v64.js?v=64","./ux-v65.js?v=65","./ux-v66.js?v=66","./ux-v66b.js?v=661","./ux-v67.js?v=67","./ux-v69.js?v=69","./ux-v71.js?v=71",
  "./styles.css?v=16","./interface-v15.css?v=16","./interface-v16.css?v=16","./interface-v17.css?v=17","./interface-v18.css?v=18","./interface-v19.css?v=31","./harmony-v59.css?v=59","./harmony-v60.css?v=60","./ux-v61.css?v=611","./ux-v62.css?v=62","./ux-v63.css?v=63","./ux-v64.css?v=64","./ux-v65.css?v=65","./ux-v66.css?v=66","./ux-v67.css?v=67","./ux-v69.css?v=69","./ux-v71.css?v=71",
  "./interface-v16.js?v=16","./interaction-v19.js?v=31","./library-v33.js?v=37","./app.js?v=16","./detector-v4.js?v=16","./kokoro-ios.js?v=16","./ios-audio-v9.js?v=16","./ai-boost-v10.js?v=52","./continuous-ai-v12.js?v=16","./manifest.webmanifest","./icon.svg"
];

const MANAGED_JS=["auth-v51","locale-v58","theme-v53","boot-v50","bootstrap-v38","bootstrap-v40","pdf-cover-v40","home-player-v42","home-fix-v44","home-recovery-v46","home-late-v47","ai-audiobook-v50","ios-speech-history-v49","library-firsttap-v43","experience-v54","home-controls-v55","import-preview-v56","daily-experience-v56","polish-v57","ux-guard-v61","ux-v61","ux-v62","ux-v63","ux-v64","ux-v65","ux-v66","ux-v66b","ux-v67","ux-v69","ux-v71"];
const MANAGED_CSS=["harmony-v59","harmony-v60","ux-v61","ux-v62","ux-v63","ux-v64","ux-v65","ux-v66","ux-v67","ux-v69","ux-v71"];
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function enhanceHtml(html){
  let cleaned=String(html||"");
  for(const name of MANAGED_JS){cleaned=cleaned.replace(new RegExp("\\s*<script[^>]*src=[\\\"']\\.\\/"+escRe(name)+"\\.js(?:\\?v=\\d+)?[\\\"'][^>]*><\\/script>\\s*","gi"),"\n");}
  for(const name of MANAGED_CSS){cleaned=cleaned.replace(new RegExp("\\s*<link[^>]*href=[\\\"']\\.\\/"+escRe(name)+"\\.css(?:\\?v=\\d+)?[\\\"'][^>]*>\\s*","gi"),"\n");}
  cleaned=cleaned.replace(/\.\/ai-boost-v10\.js\?v=\d+/gi,"./ai-boost-v10.js?v=52");
  const head=`
  <script src="./auth-v51.js?v=59"></script>
  <script src="./locale-v58.js?v=59"></script>
  <script src="./theme-v53.js?v=59"></script>
  <script src="./boot-v50.js?v=59"></script>
  <script src="./bootstrap-v40.js?v=59"></script>
  <script type="module" src="./pdf-cover-v40.js?v=59"></script>
  <script src="./home-player-v42.js?v=59"></script>
  <script src="./library-firsttap-v43.js?v=59"></script>
  <link rel="stylesheet" href="./harmony-v59.css?v=59" />
  <link rel="stylesheet" href="./harmony-v60.css?v=60" />
  <link rel="stylesheet" href="./ux-v61.css?v=611" />
  <link rel="stylesheet" href="./ux-v62.css?v=62" />
  <link rel="stylesheet" href="./ux-v63.css?v=63" />
  <link rel="stylesheet" href="./ux-v64.css?v=64" />
  <link rel="stylesheet" href="./ux-v65.css?v=65" />
  <link rel="stylesheet" href="./ux-v66.css?v=66" />
  <link rel="stylesheet" href="./ux-v67.css?v=67" />
  <link rel="stylesheet" href="./ux-v69.css?v=69" />
  <link rel="stylesheet" href="./ux-v71.css?v=71" />
</head>`;
  cleaned=cleaned.replace("</head>",head);
  const body=`
  <script src="./import-preview-v56.js?v=59"></script>
  <script src="./home-late-v47.js?v=59"></script>
  <script src="./ai-audiobook-v50.js?v=59"></script>
  <script src="./ios-speech-history-v49.js?v=59"></script>
  <script src="./experience-v54.js?v=59"></script>
  <script src="./home-controls-v55.js?v=59"></script>
  <script src="./daily-experience-v56.js?v=59"></script>
  <script src="./polish-v57.js?v=59"></script>
  <script src="./ux-guard-v61.js?v=611"></script>
  <script src="./ux-v61.js?v=611"></script>
  <script src="./ux-v62.js?v=62"></script>
  <script src="./ux-v63.js?v=63"></script>
  <script src="./ux-v64.js?v=64"></script>
  <script src="./ux-v65.js?v=65"></script>
  <script src="./ux-v66.js?v=66"></script>
  <script src="./ux-v66b.js?v=661"></script>
  <script src="./ux-v67.js?v=67"></script>
  <script src="./ux-v69.js?v=69"></script>
  <script src="./ux-v71.js?v=71"></script>
</body>`;
  return cleaned.replace("</body>",body);
}
async function enhancedHtmlResponse(response){const html=enhanceHtml(await response.text());const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("content-encoding");headers.set("cache-control","no-cache");return new Response(html,{status:response.status,statusText:response.statusText,headers});}
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener("notificationclick",event=>{event.notification?.close?.();event.waitUntil((async()=>{const target=new URL("./",self.registration.scope).href;const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of windows){if("focus" in client){try{await client.focus();return;}catch(_){}}}if(self.clients.openWindow)await self.clients.openWindow(target);})());});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;const nav=event.request.mode==="navigate"||/(?:index\.html|\/$)/.test(url.pathname);if(nav){event.respondWith((async()=>{try{const network=await fetch(event.request,{cache:"no-store"});const enhanced=await enhancedHtmlResponse(network);const cache=await caches.open(CACHE);await cache.put("./index.html",enhanced.clone());return enhanced;}catch(error){const cached=await caches.match("./index.html")||await caches.match("./");if(!cached)throw error;return enhancedHtmlResponse(cached);}})());return;}event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});return response;}).catch(()=>caches.match(event.request)));});