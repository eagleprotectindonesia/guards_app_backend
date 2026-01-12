const CACHE_NAME = 'guard-pwa-{{BUILD_ID}}';
const STATIC_CACHE = 'guard-static-v1'; // For hashed assets
const OFFLINE_URL = '/guard/offline.html';

const ASSETS_TO_CACHE = [
  OFFLINE_URL,
  '/guard/icons/icon.svg',
  '/guard/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key !== STATIC_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin (except CDN if needed)
  if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) return;

  // 2. API: Network Only (Always fresh data)
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 3. Static Hashed Assets (JS, CSS from Next.js): Cache First
  if (url.pathname.includes('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // 4. Pages and other assets: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        const fetchedResponse = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
             if (request.mode === 'navigate' && !cachedResponse) {
               return caches.match(OFFLINE_URL);
             }
          });

        return cachedResponse || fetchedResponse;
      });
    })
  );
});