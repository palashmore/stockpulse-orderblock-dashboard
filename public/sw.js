// StockPulse service worker: caches the app shell (the page and its scripts, styles and icons) so the app
// opens quickly and shows its own screens when offline. It never caches market data, account data or any
// other-origin request: the API runs on another origin and is left alone, so prices are never stale
// copies and nothing about your account is stored by the worker.
const CACHE = 'stockpulse-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return; // never touch data requests

  if (request.mode === 'navigate') {
    // Pages: the network first, so a new version is picked up; the cached shell when offline
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Scripts, styles, icons: serve the cached copy at once and refresh it in the background
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
