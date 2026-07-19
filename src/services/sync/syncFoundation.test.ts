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
});
