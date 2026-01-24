const CACHE_NAME = 'ep-pwa-v1';
const STATIC_CACHE = 'ep-static-v1';
const MEDIA_CACHE = 'chat-media-v1';
const OFFLINE_URL = '/employee/offline.html';

const ASSETS_TO_CACHE = [OFFLINE_URL, '/employee/icons/icon.svg', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(
        keyList.map(key => {
          // Keep our primary caches, delete old ones
          if (![CACHE_NAME, STATIC_CACHE, MEDIA_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

/**
 * Strips query parameters from S3 URLs to create a stable cache key.
 */
function getCacheKey(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('s3')) {
      return `${urlObj.origin}${urlObj.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

// function isMediaRequest(url) {
//   const lowerUrl = url.toLowerCase();
//   const mediaExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm'];
//   return mediaExtensions.some(ext => lowerUrl.includes(ext));
// }

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // 1. S3 Media Caching (Cross-origin support)
  if (url.hostname.includes('s3')) {
    event.respondWith(
      (async () => {
        const cacheKey = getCacheKey(request.url);
        const cache = await caches.open(MEDIA_CACHE);
        const cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(cacheKey, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // Only handle same-origin requests for the rest (PWA logic)
  if (!url.origin.includes(self.location.origin)) return;

  // 2. API: Network Only
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // 3. Static Hashed Assets: Cache First
  if (url.pathname.includes('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        return (
          cached ||
          fetch(request).then(response => {
            return caches.open(STATIC_CACHE).then(cache => {
              cache.put(request, response.clone());
              return response;
            });
          })
        );
      })
    );
    return;
  }

  // 4. Pages and other assets: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(cachedResponse => {
        const fetchedResponse = fetch(request)
          .then(networkResponse => {
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
