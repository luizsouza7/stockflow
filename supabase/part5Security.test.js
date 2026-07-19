import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./migrations/202607170001_part5_auth_rls.sql', import.meta.url),
  'utf8',
);
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

describe('migration PostgreSQL e RLS da Parte 5', () => {
  it.each(['categories', 'products', 'stock_movements'])(
    'habilita RLS para %s',
    (table) => {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      );
    },
  );

  it.each(['categories', 'products', 'stock_movements'])(
    'isola %s por business_id',
    (table) => {
      const tableDefinition = migration.match(
        new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'),
      )?.[1];
      expect(tableDefinition).toContain('business_id uuid not null');
    },
  );

  it('usa auth.uid em policies e nunca libera dados privados com using true', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it('possui memberships ativas para separar estabelecimentos por usuario', () => {
    expect(migration).toContain('create table public.business_members');
    expect(migration).toContain('private.is_active_business_member');
    expect(migration).toContain('membership.user_id = (select auth.uid())');
    expect(migration).toContain('membership.deleted_at is null');
  });

  it('preserva campos essenciais de produtos em tipos inteiros', () => {
    expect(migration).toMatch(/sale_price_in_cents bigint not null/i);
    expect(migration).toMatch(/current_quantity bigint not null/i);
    expect(migration).toMatch(/minimum_stock bigint not null/i);
    expect(migration).toContain('category_id uuid');
  });

  it('modela snapshots e movimentos legados sem inventar quantidades', () => {
    expect(migration).toContain('previous_quantity bigint');
    expect(migration).toContain('resulting_quantity bigint');
    expect(migration).toContain('is_legacy boolean not null');
    expect(migration).toMatch(/is_legacy and previous_quantity is null and resulting_quantity is null/i);
  });

  it('mantem deleted_at e version nas tabelas sincronizaveis', () => {
    expect((migration.match(/deleted_at timestamptz/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((migration.match(/version integer/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('usa trigger PostgreSQL para updated_at', () => {
    expect(migration).toContain('function private.set_updated_at()');
    expect(migration).toContain('new.updated_at = now()');
    expect(migration).toContain('products_set_updated_at');
  });

  it('nao concede DELETE fisico nas tabelas de negocio', () => {
    expect(migration).not.toMatch(/on public\.(categories|products|stock_movements) for delete/i);
  });
});

describe('arquivos de configuracao seguros', () => {
  it('env example usa nomes corretos e somente placeholders', () => {
    expect(envExample).toContain('VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
    expect(envExample).toContain('VITE_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable');
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(envExample).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
  });

  it('migration nao contem credencial administrativa', () => {
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
