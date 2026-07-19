import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./migrations/202607190001_part6c_manual_push.sql', import.meta.url),
  'utf8',
);

describe('migration segura do push manual da Parte 6C', () => {
  it('cria ledger idempotente isolado por business', () => {
    expect(migration).toContain('create table public.sync_operations');
    expect(migration).toMatch(/primary key \(business_id, idempotency_key\)/i);
    expect(migration).toContain('payload_hash text not null');
    expect(migration).toContain('applied_version integer');
  });

  it('mantem RLS e membership ativa no ledger e nas RPCs', () => {
    expect(migration).toContain('alter table public.sync_operations enable row level security');
    expect((migration.match(/private\.is_active_business_member/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it('possui RPCs separadas para categorias e produtos', () => {
    expect(migration).toContain('function public.push_category_outbox_event');
    expect(migration).toContain('function public.push_product_outbox_event');
    expect(migration).toContain("'category.created'");
    expect(migration).toContain("'product.deleted'");
  });

  it('exige versao base para update e detecta divergencia', () => {
    expect((migration.match(/BASE_VERSION_REQUIRED/g) ?? []).length).toBe(2);
    expect((migration.match(/REMOTE_VERSION_CONFLICT/g) ?? []).length).toBe(2);
    expect(migration).toMatch(/and version = p_expected_version/g);
  });

  it('produto atualizado nao altera current_quantity sem movimentacao atomica', () => {
    const updateBlock = migration.match(
      /update public\.products([\s\S]*?)returning version into v_version;/i,
    )?.[1];
    expect(updateBlock).toBeTruthy();
    expect(updateBlock).not.toContain('current_quantity');
  });

  it('usa current_quantity somente como saldo inicial na criacao', () => {
    expect(migration).toMatch(/current_quantity,[\s\S]*?p_initial_quantity,/i);
  });

  it('nao cria RPC nem escrita de stock_movements', () => {
    expect(migration).not.toMatch(/register_stock_movement|push_movement|insert into public\.stock_movements/i);
  });

  it('nao implementa pull, DELETE fisico ou credencial privilegiada', () => {
    expect(migration).not.toMatch(/function public\.[a-z_]*pull|delete from public\./i);
    expect(migration).not.toMatch(/service_role|sb_secret_/i);
  });

  it('restringe execucao das RPCs a authenticated', () => {
    expect((migration.match(/revoke all on function/g) ?? []).length).toBe(2);
    expect(
      (migration.match(/grant execute on function[\s\S]*?to authenticated;/g) ?? []).length,
    ).toBe(2);
  });
});
