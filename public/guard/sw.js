const CACHE_NAME = 'guard-pwa-{{BUILD_ID}}';
const OFFLINE_URL = '/guard/offline.html';
const ASSETS_TO_CACHE = [
  OFFLINE_URL,
  '/guard/icons/icon.svg'
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
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle requests within the scope and GET method
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  // Don't cache API calls aggressively - we need real-time data
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Optional: Return a JSON offline message for API calls?
        // For now, let it fail naturally or handle in frontend code
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Network First Strategy for pages
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If it's a navigation request (HTML page), show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
      })
  );
});