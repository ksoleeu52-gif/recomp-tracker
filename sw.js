/**
 * Service worker: makes the app load instantly and work fully offline.
 *
 * Strategy
 * - On install, precache every file the app needs (the "app shell").
 * - Same-origin requests are served cache-first, so the gym's bad signal never slows the app down.
 * - Cross-origin requests (e.g. the Open Food Facts API) are left alone and go to the network.
 * - Releasing a new version = bump VERSION. The new worker installs in the background and
 *   the app shows an "Update" toast; tapping it activates the new worker and reloads.
 *
 * Keep VERSION in sync with APP_VERSION in js/config.js.
 */
const VERSION = '0.1.0';
const CACHE = `recomp-${VERSION}`;

// Every file the app needs to run offline. Paths are relative to this file (the app's scope).
const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/config.js',
  'js/router.js',
  'js/db/idb.js',
  'js/db/settings.js',
  'js/db/storage.js',
  'js/lib/html.js',
  'js/lib/dates.js',
  'js/lib/format.js',
  'js/lib/nutrition.js',
  'js/components/fields.js',
  'js/components/ring.js',
  'js/components/summary-card.js',
  'js/components/toast.js',
  'js/screens/today.js',
  'js/screens/foods.js',
  'js/screens/meals.js',
  'js/screens/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' bypasses the HTTP cache so we never precache a stale file.
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('recomp-') && key !== CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// The page asks us to activate immediately when the user taps "Update".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // APIs etc: straight to network
  if (url.pathname.includes('/tests/')) return; // never cache the test pages

  // App navigation always gets the cached shell; routing happens in the URL hash.
  if (request.mode === 'navigate') {
    const indexUrl = new URL('index.html', self.registration.scope).href;
    event.respondWith(caches.match(indexUrl).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  // Not precached (e.g. a lazily-loaded file): fetch it and keep a copy for next time.
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}
