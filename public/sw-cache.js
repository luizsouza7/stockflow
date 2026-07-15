import {
  CACHE_NAME,
  createAbsoluteCacheKey,
  extractShellAssetUrls,
  isCacheableResponse,
} from './sw-policy.js';

export const INDEX_URL = '/index.html';
export const OPTIONAL_CORE_ASSETS = ['/manifest.webmanifest', '/pwa-icon.svg'];

async function fetchAndCacheAsset({
  assetUrl,
  appOrigin,
  cache,
  fetchImpl,
  required,
}) {
  const cacheKey = createAbsoluteCacheKey(assetUrl, appOrigin);

  try {
    const response = await fetchImpl(cacheKey, { cache: 'reload' });
    if (!isCacheableResponse(response)) {
      if (required) {
        throw new Error(`Recurso essencial invalido: ${cacheKey}`);
      }
      return false;
    }

    await cache.put(cacheKey, response);
    return true;
  } catch (error) {
    if (required) {
      throw error;
    }
    return false;
  }
}

export async function precacheAppShell({
  appOrigin,
  cacheStorage,
  fetchImpl,
  cacheName = CACHE_NAME,
}) {
  const cache = await cacheStorage.open(cacheName);
  const indexCacheKey = createAbsoluteCacheKey(INDEX_URL, appOrigin);
  const indexResponse = await fetchImpl(indexCacheKey, { cache: 'reload' });

  if (!isCacheableResponse(indexResponse, 'text/html')) {
    throw new Error('Nao foi possivel preparar o app shell do StockFlow.');
  }

  const html = await indexResponse.clone().text();
  const discoveredAssets = [
    ...new Set(
      extractShellAssetUrls(html, appOrigin).filter(
        (assetUrl) => new URL(assetUrl, appOrigin).pathname.startsWith('/assets/'),
      ),
    ),
  ];

  await Promise.all(
    discoveredAssets.map((assetUrl) =>
      fetchAndCacheAsset({
        assetUrl,
        appOrigin,
        cache,
        fetchImpl,
        required: true,
      }),
    ),
  );

  await cache.put(indexCacheKey, indexResponse);
  await Promise.all(
    OPTIONAL_CORE_ASSETS.map((assetUrl) =>
      fetchAndCacheAsset({
        assetUrl,
        appOrigin,
        cache,
        fetchImpl,
        required: false,
      }),
    ),
  );
}

export async function handleNavigation({
  appOrigin,
  cacheStorage,
  fetchImpl,
  request,
  cacheName = CACHE_NAME,
}) {
  const cache = await cacheStorage.open(cacheName);
  const indexCacheKey = createAbsoluteCacheKey(INDEX_URL, appOrigin);

  try {
    const response = await fetchImpl(request);
    if (isCacheableResponse(response, 'text/html')) {
      await cache.put(indexCacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cachedShell = await cache.match(indexCacheKey);
    if (cachedShell) {
      return cachedShell;
    }
    throw error;
  }
}

export async function handleStaticAsset({
  appOrigin,
  cacheStorage,
  fetchImpl,
  request,
  cacheName = CACHE_NAME,
}) {
  const cache = await cacheStorage.open(cacheName);
  const cacheKey = createAbsoluteCacheKey(request, appOrigin);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetchImpl(request);
    if (isCacheableResponse(networkResponse)) {
      await cache.put(cacheKey, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return Response.error();
  }
}
