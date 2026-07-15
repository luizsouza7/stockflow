export const CACHE_PREFIX = 'stockflow-';
export const BUILD_ID = '__STOCKFLOW_BUILD_ID__';

const STATIC_PATHS = new Set(['/manifest.webmanifest', '/pwa-icon.svg', '/sw-policy.js']);

export function createCacheName(buildId) {
  return `${CACHE_PREFIX}static-${buildId}`;
}

export const CACHE_NAME = createCacheName(BUILD_ID);

export function createAbsoluteCacheKey(url, appOrigin) {
  return new URL(typeof url === 'string' ? url : url.url, appOrigin).href;
}

function isSameOrigin(url, appOrigin) {
  return new URL(url, appOrigin).origin === appOrigin;
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isKnownStaticPath(pathname) {
  return pathname.startsWith('/assets/') || STATIC_PATHS.has(pathname);
}

export function isAppNavigation(request, appOrigin) {
  return (
    request.method === 'GET' &&
    request.mode === 'navigate' &&
    isSameOrigin(request.url, appOrigin)
  );
}

export function isStaticAssetRequest(request, appOrigin) {
  if (request.method !== 'GET' || !isSameOrigin(request.url, appOrigin)) {
    return false;
  }

  const { pathname } = new URL(request.url, appOrigin);
  return !isApiPath(pathname) && isKnownStaticPath(pathname);
}

export function getObsoleteStockFlowCaches(cacheNames, currentCacheName = CACHE_NAME) {
  return cacheNames.filter(
    (cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== currentCacheName,
  );
}

export function isCacheableResponse(response, expectedContentType) {
  if (!response.ok || !['basic', 'default'].includes(response.type)) {
    return false;
  }

  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }

  if (expectedContentType) {
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    return contentType.includes(expectedContentType);
  }

  return true;
}

export function extractShellAssetUrls(html, appOrigin) {
  const assetUrls = [];
  const attributePattern = /(?:src|href)=["']([^"']+)["']/gi;

  for (const match of html.matchAll(attributePattern)) {
    const value = match[1];
    const url = new URL(value, appOrigin);
    if (url.origin === appOrigin && isKnownStaticPath(url.pathname)) {
      assetUrls.push(`${url.pathname}${url.search}`);
    }
  }

  return assetUrls;
}
