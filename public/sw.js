import {
  BUILD_ID,
  CACHE_NAME,
  getObsoleteStockFlowCaches,
  isAppNavigation,
  isStaticAssetRequest,
} from './sw-policy.js';
import {
  handleNavigation,
  handleStaticAsset,
  precacheAppShell,
} from './sw-cache.js';

const SERVICE_WORKER_BUILD_ID = '__STOCKFLOW_BUILD_ID__';

if (SERVICE_WORKER_BUILD_ID !== BUILD_ID) {
  throw new Error('Identificadores de build inconsistentes no service worker.');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAppShell({
      appOrigin: self.location.origin,
      cacheStorage: caches,
      fetchImpl: fetch,
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        getObsoleteStockFlowCaches(keys, CACHE_NAME).map((key) => caches.delete(key)),
      ),
    ),
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (isAppNavigation(request, self.location.origin)) {
    event.respondWith(
      handleNavigation({
        appOrigin: self.location.origin,
        cacheStorage: caches,
        fetchImpl: fetch,
        request,
      }),
    );
    return;
  }

  if (isStaticAssetRequest(request, self.location.origin)) {
    event.respondWith(
      handleStaticAsset({
        appOrigin: self.location.origin,
        cacheStorage: caches,
        fetchImpl: fetch,
        request,
      }),
    );
  }
});
