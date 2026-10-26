/* Zero Sixty: offline cache. After the first visit the game runs with no connection. */
const CACHE = 'zero-sixty-v22';
const SHELL = [
  './', 'index.html', 'css/fonts.css', 'css/style.css', 'manifest.webmanifest', 'icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/three.min.js',
  'vendor/fonts/overpass-latin-400-normal.woff2', 'vendor/fonts/overpass-latin-600-normal.woff2',
  'vendor/fonts/overpass-latin-800-normal.woff2', 'vendor/fonts/overpass-latin-900-normal.woff2',
  'vendor/fonts/overpass-latin-600-italic.woff2', 'vendor/fonts/kalam-latin-400-normal.woff2', 'vendor/fonts/kalam-latin-700-normal.woff2',
  'js/core.js', 'js/geo.js', 'js/models.js', 'js/music.js', 'js/audio.js', 'js/fx.js', 'js/world.js',
  'js/entities.js', 'js/player.js', 'js/police.js', 'js/challenges.js', 'js/input.js', 'js/play.js', 'js/ui.js', 'js/game.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache straight away, refresh the copy in the background.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
