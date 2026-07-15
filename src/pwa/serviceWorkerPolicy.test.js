import { describe, expect, it } from 'vitest';
import {
  CACHE_PREFIX,
  createAbsoluteCacheKey,
  createCacheName,
  extractShellAssetUrls,
  getObsoleteStockFlowCaches,
  isAppNavigation,
  isCacheableResponse,
  isStaticAssetRequest,
} from '../../public/sw-policy.js';

const APP_ORIGIN = 'https://stockflow.example';

function request(overrides = {}) {
  return {
    destination: '',
    method: 'GET',
    mode: 'cors',
    url: `${APP_ORIGIN}/recurso`,
    ...overrides,
  };
}

function response(overrides = {}) {
  const headers = new Headers(overrides.headers);
  return {
    headers,
    ok: true,
    type: 'basic',
    ...overrides,
    headers,
  };
}

describe('politica do service worker', () => {
  it('reconhece somente navegacao GET da propria aplicacao', () => {
    expect(
      isAppNavigation(request({ mode: 'navigate', url: `${APP_ORIGIN}/produtos` }), APP_ORIGIN),
    ).toBe(true);
    expect(isAppNavigation(request({ method: 'POST', mode: 'navigate' }), APP_ORIGIN)).toBe(false);
    expect(
      isAppNavigation(
        request({ mode: 'navigate', url: 'https://external.example/pagina' }),
        APP_ORIGIN,
      ),
    ).toBe(false);
  });

  it('aceita somente caminhos estaticos conhecidos da aplicacao', () => {
    expect(
      isStaticAssetRequest(
        request({ url: `${APP_ORIGIN}/assets/app.js` }),
        APP_ORIGIN,
      ),
    ).toBe(true);
    expect(
      isStaticAssetRequest(request({ url: `${APP_ORIGIN}/assets/app.css` }), APP_ORIGIN),
    ).toBe(true);
    expect(
      isStaticAssetRequest(request({ url: `${APP_ORIGIN}/manifest.webmanifest` }), APP_ORIGIN),
    ).toBe(true);
    expect(
      isStaticAssetRequest(request({ url: `${APP_ORIGIN}/pwa-icon.svg` }), APP_ORIGIN),
    ).toBe(true);
  });

  it('rejeita API, JSON generico, origem externa e metodos mutaveis', () => {
    expect(
      isStaticAssetRequest(
        request({ destination: 'script', url: `${APP_ORIGIN}/api/private.js` }),
        APP_ORIGIN,
      ),
    ).toBe(false);
    expect(
      isStaticAssetRequest(
        request({ method: 'POST', url: `${APP_ORIGIN}/assets/app.js` }),
        APP_ORIGIN,
      ),
    ).toBe(false);
  });

  it('rejeita rotas privadas mesmo quando o navegador informa destino de asset', () => {
    expect(
      isStaticAssetRequest(
        request({ destination: 'image', url: `${APP_ORIGIN}/private/avatar` }),
        APP_ORIGIN,
      ),
    ).toBe(false);
    expect(
      isStaticAssetRequest(
        request({ destination: 'style', url: `${APP_ORIGIN}/private/theme.css` }),
        APP_ORIGIN,
      ),
    ).toBe(false);
    expect(
      isStaticAssetRequest(request({ url: `${APP_ORIGIN}/dados.json` }), APP_ORIGIN),
    ).toBe(false);
    expect(
      isStaticAssetRequest(
        request({ destination: 'image', url: 'https://external.example/image.png' }),
        APP_ORIGIN,
      ),
    ).toBe(false);
  });

  it('rejeita respostas com erro, privadas, no-store ou de tipo externo', () => {
    expect(isCacheableResponse(response())).toBe(true);
    expect(isCacheableResponse(response({ ok: false }))).toBe(false);
    expect(isCacheableResponse(response({ type: 'cors' }))).toBe(false);
    expect(isCacheableResponse(response({ headers: { 'cache-control': 'private' } }))).toBe(false);
    expect(isCacheableResponse(response({ headers: { 'cache-control': 'no-store' } }))).toBe(false);
  });

  it('valida HTML antes de armazenar o fallback de navegacao', () => {
    expect(
      isCacheableResponse(response({ headers: { 'content-type': 'text/html; charset=utf-8' } }), 'text/html'),
    ).toBe(true);
    expect(
      isCacheableResponse(response({ headers: { 'content-type': 'application/json' } }), 'text/html'),
    ).toBe(false);
  });

  it('descobre somente assets da propria origem no HTML do shell', () => {
    const html = `
      <link rel="stylesheet" href="/assets/app.css">
      <script src="/assets/app.js"></script>
      <img src="https://external.example/logo.png">
      <a href="/api/private">API</a>
      <a href="/produtos">Produtos</a>
    `;

    expect(extractShellAssetUrls(html, APP_ORIGIN)).toEqual([
      '/assets/app.css',
      '/assets/app.js',
    ]);
  });

  it('canoniza URLs relativas e Requests absolutas para a mesma chave exata', () => {
    const relativeKey = createAbsoluteCacheKey('/assets/app.js?v=1', APP_ORIGIN);
    const requestKey = createAbsoluteCacheKey(
      new Request(`${APP_ORIGIN}/assets/app.js?v=1`),
      APP_ORIGIN,
    );

    expect(relativeKey).toBe(`${APP_ORIGIN}/assets/app.js?v=1`);
    expect(requestKey).toBe(relativeKey);
  });

  it('produz caches distintos para builds distintos sob o prefixo do StockFlow', () => {
    const cacheA = createCacheName('build-a');
    const cacheB = createCacheName('build-b');

    expect(cacheA).not.toBe(cacheB);
    expect(cacheA.startsWith(CACHE_PREFIX)).toBe(true);
    expect(cacheB.startsWith(CACHE_PREFIX)).toBe(true);
  });

  it('seleciona somente caches antigos do StockFlow para limpeza', () => {
    const currentCache = createCacheName('build-b');

    expect(
      getObsoleteStockFlowCaches(
        [createCacheName('build-a'), currentCache, 'outra-aplicacao-cache', 'stockflow-cache-v1'],
        currentCache,
      ),
    ).toEqual([createCacheName('build-a'), 'stockflow-cache-v1']);
  });
});
