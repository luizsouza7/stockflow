import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOCAL_MUTATION_FILES = [
  '../categoryService.ts',
  '../productService.ts',
  '../stockMovementService.ts',
  '../outboxService.ts',
  '../../repositories/outboxRepository.ts',
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

const SYNC_FOUNDATION_SOURCE = readFileSync(new URL('./syncService.ts', import.meta.url), 'utf8');
const APP_BOOT_SOURCE = [
  '../../main.tsx',
  '../../App.tsx',
  '../../components/Layout.tsx',
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')).join('\n');
const AUTH_SOURCE = [
  '../authService.ts',
  '../../hooks/useAuthSession.ts',
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')).join('\n');
const CONNECTIVITY_SOURCE = [
  '../../hooks/useOnlineStatus.ts',
  '../../components/Layout.tsx',
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')).join('\n');
const SERVICE_WORKER_SOURCE = readFileSync(
  new URL('../../../public/sw.js', import.meta.url),
  'utf8',
);
const MANUAL_PUSH_SOURCE = [
  './manualPushService.ts',
  './syncRemoteGateway.ts',
  '../../components/ManualCloudPushPanel.tsx',
].map((relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')).join('\n');

describe('limites da fundacao local de sync', () => {
  it('nao acessa Supabase, fetch ou tabelas remotas nas mutacoes locais', () => {
    const source = LOCAL_MUTATION_FILES.join('\n');
    expect(source).not.toMatch(/supabase|\.from\s*\(|fetch\s*\(/i);
  });

  it('nao implementa push, pull, timer ou retry automatico', () => {
    expect(SYNC_FOUNDATION_SOURCE).not.toMatch(
      /supabase|fetch\s*\(|setInterval\s*\(|push\s*\(|pull\s*\(|onAuthStateChange/i,
    );
    expect(SYNC_FOUNDATION_SOURCE).toContain('getLocalSyncPreparationStatus');
  });

  it('processador local nao importa Supabase nem usa APIs de rede', () => {
    expect(SYNC_FOUNDATION_SOURCE).not.toMatch(
      /supabase|fetch\s*\(|XMLHttpRequest|\.from\s*\(/i,
    );
  });

  it('app nao chama o processador automaticamente no boot', () => {
    expect(APP_BOOT_SOURCE).not.toMatch(/processOutboxBatch|resetStaleProcessing/);
  });

  it('login e mudancas de sessao nao disparam processamento', () => {
    expect(AUTH_SOURCE).not.toMatch(/processOutboxBatch|resetStaleProcessing/);
  });

  it('eventos online e offline nao disparam processamento', () => {
    expect(CONNECTIVITY_SOURCE).not.toMatch(/processOutboxBatch|resetStaleProcessing/);
  });

  it('nao cria setInterval para sincronizacao', () => {
    expect(`${SYNC_FOUNDATION_SOURCE}\n${APP_BOOT_SOURCE}`).not.toMatch(/setInterval\s*\(/);
  });

  it('service worker nao registra background sync', () => {
    expect(SERVICE_WORKER_SOURCE).not.toMatch(
      /addEventListener\s*\(\s*['"](?:sync|periodicsync)['"]/i,
    );
  });

  it('push remoto nao possui timer, listener de Auth ou listener de conectividade', () => {
    expect(MANUAL_PUSH_SOURCE).not.toMatch(
      /setInterval\s*\(|onAuthStateChange|addEventListener\s*\(\s*['"]online['"]/i,
    );
  });

  it('push manual nao implementa pull nem leitura direta de tabelas remotas', () => {
    expect(MANUAL_PUSH_SOURCE).not.toMatch(
      /function\s+[a-z_]*pull|\.from\s*\(|pullRemote|remotePull/i,
    );
  });

  it('boot, Auth e conectividade nao chamam push manual', () => {
    expect(`${APP_BOOT_SOURCE}\n${AUTH_SOURCE}\n${CONNECTIVITY_SOURCE}`).not.toMatch(
      /manualPushService\.push|processOutboxBatch|pushCompatibleEvents/,
    );
  });
});
