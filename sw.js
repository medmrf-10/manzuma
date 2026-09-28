const CACHE = 'manzuma-v1';
const ASSETS = [
  '/manzuma/',
  '/manzuma/index.html',
  '/manzuma/manifest.webmanifest',
  '/manzuma/icons/icon-192.png',
  '/manzuma/icons/icon-512.png',
  '/manzuma/tafsir/',
  '/manzuma/hadith/',
  '/manzuma/english/',
  '/manzuma/ulum/',
  '/manzuma/core/'
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
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === 'GET' && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('/manzuma/')))
  );
});
