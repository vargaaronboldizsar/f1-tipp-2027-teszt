const CACHE_PREFIX = 'apex-shell-';
const CACHE_VERSION = 'apex-shell-20261022-02';
const SHELL = ['./', './index.html', './app.js?v=20261022-02', './styles.css?v=20261022-02', './site.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  const isShell = req.mode === 'navigate' || /\.(?:html|js|css|webmanifest)$/.test(path);
  if (isShell) {
    event.respondWith(fetch(req, {cache:'no-store'}).then(res => {
      if (res && res.ok) { const copy=res.clone(); caches.open(CACHE_VERSION).then(cache=>cache.put(req,copy)); }
      return res;
    }).catch(async () => { const cached = await caches.match(req); if (cached) return cached; if (req.mode === 'navigate') return await caches.match('./index.html'); throw new Error('Offline and no cached app shell resource'); }));
    return;
  }
  if (/\.(?:png|jpe?g|webp|svg|woff2?)$/.test(path)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy=res.clone(); caches.open(CACHE_VERSION).then(cache=>cache.put(req,copy)); }
      return res;
    })));
  }
});
