const CACHE = 'manzuma-v4';
const ASSETS = [
  '/manzuma/',
  '/manzuma/index.html',
  '/manzuma/manifest.webmanifest',
  '/manzuma/icons/icon-192.png',
  '/manzuma/icons/icon-512.png',
  '/manzuma/tafsir/',
  '/manzuma/hadith/','/manzuma/hadith/muqaddima/',
  '/manzuma/english/',
  '/manzuma/ulum/',
  '/manzuma/core/',
  '/manzuma/core/articles/',
  '/manzuma/core/articles/read.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('/manzuma/')))
  );
});
