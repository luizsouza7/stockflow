import { describe, expect, it, vi } from 'vitest';
import {
  handleStaticAsset,
  precacheAppShell,
} from '../../public/sw-cache.js';
import { CACHE_NAME, createCacheName } from '../../public/sw-policy.js';

const APP_ORIGIN = 'https://stockflow.example';
const INDEX_KEY = `${APP_ORIGIN}/index.html`;
const JS_KEY = `${APP_ORIGIN}/assets/index-build.js`;
const CSS_KEY = `${APP_ORIGIN}/assets/index-build.css`;

function response(body, contentType) {
  return new Response(body, {
    headers: {
      'content-type': contentType,
      vary: 'Origin',
    },
  });
}

class MemoryCache {
  entries = new Map();

  async put(key, value) {
    this.entries.set(typeof key === 'string' ? key : key.url, value);
  }

  async match(key) {
    return this.entries.get(typeof key === 'string' ? key : key.url);
  }
}

class MemoryCacheStorage {
  caches = new Map();
  openedNames = [];

  async open(name) {
    this.openedNames.push(name);
    if (!this.caches.has(name)) {
      this.caches.set(name, new MemoryCache());
    }
    return this.caches.get(name);
  }
}

function shellHtml() {
  return `
    <script type="module" crossorigin src="/assets/index-build.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-build.css">
  `;
}

function onlineFetch(url) {
  const key = typeof url === 'string' ? url : url.url;
  if (key === INDEX_KEY) return Promise.resolve(response(shellHtml(), 'text/html'));
  if (key === JS_KEY) return Promise.resolve(response('javascript', 'text/javascript'));
  if (key === CSS_KEY) return Promise.resolve(response('css', 'text/css'));
  return Promise.resolve(response('optional', 'image/svg+xml'));
}

describe('cache do service worker', () => {
  it('grava o HTML e os assets descobertos no cache da versao atual', async () => {
    const cacheStorage = new MemoryCacheStorage();

    await precacheAppShell({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: onlineFetch,
    });

    const cache = cacheStorage.caches.get(CACHE_NAME);
    expect(cache.entries.has(INDEX_KEY)).toBe(true);
    expect(cache.entries.has(JS_KEY)).toBe(true);
    expect(cache.entries.has(CSS_KEY)).toBe(true);
    expect(cacheStorage.openedNames).toEqual([CACHE_NAME]);
  });

  it.each([
    ['JavaScript', JS_KEY],
    ['CSS', CSS_KEY],
  ])('recupera %s precacheado por uma Request absoluta sem acessar a rede', async (_type, key) => {
    const cacheStorage = new MemoryCacheStorage();
    await precacheAppShell({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: onlineFetch,
    });
    const offlineFetch = vi.fn(() => Promise.reject(new TypeError('offline')));

    const result = await handleStaticAsset({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: offlineFetch,
      request: new Request(key, { headers: { Origin: APP_ORIGIN } }),
    });

    expect(result.ok).toBe(true);
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(cacheStorage.openedNames.at(-1)).toBe(CACHE_NAME);
  });

  it('nao conclui a instalacao quando um asset essencial nao pode ser precacheado', async () => {
    const cacheStorage = new MemoryCacheStorage();
    const incompleteFetch = vi.fn((url) => {
      const key = typeof url === 'string' ? url : url.url;
      if (key === CSS_KEY) return Promise.reject(new TypeError('offline'));
      return onlineFetch(url);
    });

    await expect(
      precacheAppShell({
        appOrigin: APP_ORIGIN,
        cacheStorage,
        fetchImpl: incompleteFetch,
      }),
    ).rejects.toThrow('offline');
  });

  it('retorna erro controlado sem usar index.html quando asset e rede estao ausentes', async () => {
    const cacheStorage = new MemoryCacheStorage();
    const cache = await cacheStorage.open(CACHE_NAME);
    await cache.put(INDEX_KEY, response(shellHtml(), 'text/html'));

    const result = await handleStaticAsset({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: vi.fn(() => Promise.reject(new TypeError('offline'))),
      request: new Request(JS_KEY),
    });

    expect(result.type).toBe('error');
    expect(result.status).toBe(0);
    expect(result).not.toBe(cache.entries.get(INDEX_KEY));
  });

  it('mantem caches de builds diferentes isolados durante escrita e leitura', async () => {
    const cacheStorage = new MemoryCacheStorage();
    const cacheA = createCacheName('build-a');
    const cacheB = createCacheName('build-b');

    await precacheAppShell({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: onlineFetch,
      cacheName: cacheA,
    });
    const result = await handleStaticAsset({
      appOrigin: APP_ORIGIN,
      cacheStorage,
      fetchImpl: vi.fn(() => Promise.reject(new TypeError('offline'))),
      request: new Request(JS_KEY),
      cacheName: cacheB,
    });

    expect(result.type).toBe('error');
    expect(cacheStorage.caches.get(cacheA).entries.has(JS_KEY)).toBe(true);
    expect(cacheStorage.caches.get(cacheB).entries.has(JS_KEY)).toBe(false);
  });
});
