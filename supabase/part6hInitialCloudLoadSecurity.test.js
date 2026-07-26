import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const part5 = readFileSync(
  new URL('./migrations/202607170001_part5_auth_rls.sql', import.meta.url),
  'utf8',
);
const part6c = readFileSync(
  new URL('./migrations/202607190001_part6c_manual_push.sql', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('./migrations/202607250001_part6h_initial_cloud_load.sql', import.meta.url),
  'utf8',
);

const initializeDefinition = migration.match(
  /create or replace function public\.initialize_business_inventory[\s\S]*?\$\$;/i,
)?.[0] ?? '';
const initializeBody = initializeDefinition.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? '';
const finiteTimestampDefinition = migration.match(
  /create or replace function private\.is_finite_timestamptz_text[\s\S]*?\$\$;/i,
)?.[0] ?? '';
const finiteTimestampBody =
  finiteTimestampDefinition.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? '';
const ledgerSection = migration.slice(
  migration.indexOf('create table private.inventory_bootstrap_operations'),
  migration.indexOf('create or replace function public.get_business_inventory_initialization_state'),
);

describe('migration segura da carga inicial da Parte 6H-D', () => {
  it('nao concede acesso direto no ledger privado', () => {
    expect(ledgerSection).toMatch(
      /revoke all on private\.inventory_bootstrap_operations from public, anon, authenticated;/i,
    );
    expect(ledgerSection).not.toMatch(
      /grant\s+[^;]*on private\.inventory_bootstrap_operations[^;]*to authenticated/i,
    );
    expect(ledgerSection).not.toMatch(
      /on private\.inventory_bootstrap_operations for (?:insert|update|delete|all)/i,
    );
  });

  it('limita SECURITY DEFINER as RPCs do ledger e fixa owners/search_path', () => {
    expect(initializeDefinition).toMatch(
      /language plpgsql\s+security definer\s+set search_path = ''/i,
    );
    expect(migration).toMatch(
      /alter function public\.initialize_business_inventory\(uuid, text, text, text\)\s+owner to postgres;/i,
    );
    const previewDefinition = migration.match(
      /create or replace function public\.get_business_inventory_initialization_state[\s\S]*?\$\$;/i,
    )?.[0] ?? '';
    expect(previewDefinition).toMatch(
      /language plpgsql\s+security definer\s+set search_path = ''/i,
    );
    expect(migration).toMatch(
      /alter function public\.get_business_inventory_initialization_state\(uuid\)\s+owner to postgres;/i,
    );
    expect(migration.match(/create or replace function public\./gi)).toHaveLength(2);
  });

  it('valida auth e membership antes de adquirir o lock', () => {
    const auth = initializeBody.indexOf('v_user_id := auth.uid()');
    const membership = initializeBody.indexOf('from public.business_members membership');
    const lock = initializeBody.indexOf('for update;');
    const preliminaryMembership = initializeBody.slice(membership, lock);
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(membership).toBeGreaterThan(auth);
    expect(preliminaryMembership).toMatch(/membership\.business_id = p_business_id/i);
    expect(preliminaryMembership).toMatch(/membership\.user_id = v_user_id/i);
    expect(preliminaryMembership).toMatch(/membership\.deleted_at is null/i);
    expect(preliminaryMembership).toMatch(/ACTIVE_MEMBERSHIP_REQUIRED/i);
    expect(lock).toBeGreaterThan(membership);
  });

  it('revalida e bloqueia a membership depois do business e antes da idempotencia', () => {
    const lock = initializeBody.indexOf('for update;');
    const retry = initializeBody.indexOf('select * into v_existing');
    const protectedWindow = initializeBody.slice(lock + 'for update;'.length, retry);
    expect(protectedWindow).toMatch(
      /from public\.business_members membership[\s\S]*?membership\.business_id = p_business_id[\s\S]*?membership\.user_id = v_user_id[\s\S]*?membership\.deleted_at is null[\s\S]*?for share;/i,
    );
    expect(protectedWindow).toMatch(
      /for share;[\s\S]*?if not found then[\s\S]*?ACTIVE_MEMBERSHIP_REQUIRED/i,
    );
  });

  it('bloqueia a linha do business antes da idempotencia e da prova de vazio', () => {
    const lock = initializeBody.indexOf('for update;');
    const retry = initializeBody.indexOf('select * into v_existing');
    const emptyInventory = initializeBody.indexOf('REMOTE_INVENTORY_NOT_EMPTY');
    const emptySync = initializeBody.indexOf('REMOTE_SYNC_HISTORY_EXISTS');
    expect(initializeBody).toMatch(
      /from public\.businesses business[\s\S]*?business\.id = p_business_id[\s\S]*?for update;/i,
    );
    expect(lock).toBeGreaterThan(0);
    expect(retry).toBeGreaterThan(lock);
    expect(emptyInventory).toBeGreaterThan(retry);
    expect(emptySync).toBeGreaterThan(emptyInventory);
  });

  it('rejeita timestamps invalidos e nao finitos em todos os campos do snapshot', () => {
    expect(finiteTimestampDefinition).toMatch(
      /language plpgsql\s+stable\s+security invoker\s+set search_path = ''/i,
    );
    expect(finiteTimestampBody).toMatch(
      /v_timestamp := p_value::timestamptz;[\s\S]*?exception when others then[\s\S]*?return false;/i,
    );
    expect(finiteTimestampBody).toMatch(
      /return pg_catalog\.isfinite\(v_timestamp\);/i,
    );

    for (const field of ['createdAt', 'updatedAt']) {
      expect(
        initializeBody.match(
          new RegExp(
            `not private\\.is_finite_timestamptz_text\\(item->>'${field}'\\)`,
            'g',
          ),
        ),
      ).toHaveLength(2);
    }
    expect(
      initializeBody.match(
        /jsonb_typeof\(item->'deletedAt'\) = 'string'[\s\S]{0,120}?not private\.is_finite_timestamptz_text\(item->>'deletedAt'\)/g,
      ),
    ).toHaveLength(2);
    expect(migration).toMatch(
      /revoke all on function private\.is_finite_timestamptz_text\(text\)\s+from public, anon, authenticated;/i,
    );
  });

  it('limita bytes e quantidades antes dos loops pesados do payload', () => {
    const byteLimit = initializeBody.indexOf(
      'pg_catalog.octet_length(p_payload_text) > 5242880',
    );
    const jsonCast = initializeBody.indexOf(
      'v_payload := p_payload_text::jsonb',
    );
    const digest = initializeBody.indexOf('extensions.digest');
    const categoryLimit = initializeBody.indexOf(
      'v_category_count > 5000',
    );
    const productLimit = initializeBody.indexOf(
      'v_product_count > 20000',
    );
    const firstCategoryLoop = initializeBody.indexOf(
      'from jsonb_array_elements(v_categories) item',
    );
    const firstProductLoop = initializeBody.indexOf(
      'from jsonb_array_elements(v_products) item',
    );

    expect(byteLimit).toBeGreaterThan(0);
    expect(byteLimit).toBeLessThan(digest);
    expect(byteLimit).toBeLessThan(jsonCast);
    expect(initializeBody.slice(byteLimit, jsonCast)).toMatch(
      /PAYLOAD_TOO_LARGE/i,
    );
    expect(categoryLimit).toBeGreaterThan(jsonCast);
    expect(productLimit).toBeGreaterThan(categoryLimit);
    expect(categoryLimit).toBeLessThan(firstCategoryLoop);
    expect(productLimit).toBeLessThan(firstProductLoop);
    expect(initializeBody.slice(categoryLimit, firstCategoryLoop)).toMatch(
      /TOO_MANY_CATEGORIES/i,
    );
    expect(initializeBody.slice(productLimit, firstProductLoop)).toMatch(
      /TOO_MANY_PRODUCTS/i,
    );
  });

  it('coordena escritores filhos pelas FKs que conflitam com FOR UPDATE', () => {
    expect(part5).toMatch(
      /create table public\.categories[\s\S]*?business_id uuid not null references public\.businesses \(id\)/i,
    );
    expect(part5).toMatch(
      /create table public\.products[\s\S]*?business_id uuid not null references public\.businesses \(id\)/i,
    );
    expect(part5).toMatch(
      /create table public\.stock_movements[\s\S]*?business_id uuid not null references public\.businesses \(id\)/i,
    );
    expect(part6c).toMatch(
      /create table public\.sync_operations[\s\S]*?business_id uuid not null references public\.businesses \(id\)/i,
    );
    expect(migration).not.toMatch(
      /drop constraint[\s\S]*?(?:categories|products|stock_movements|sync_operations).*business/i,
    );
  });

  it('preserva idempotencia antes de rejeitar business ja preenchido', () => {
    const retryLookup = initializeBody.indexOf('select * into v_existing');
    const sameHashReturn = initializeBody.indexOf(
      'select v_existing.category_count, v_existing.product_count, true',
    );
    const reused = initializeBody.indexOf('IDEMPOTENCY_KEY_REUSED');
    const alreadyCompleted = initializeBody.indexOf('BOOTSTRAP_ALREADY_COMPLETED');
    const notEmpty = initializeBody.indexOf('REMOTE_INVENTORY_NOT_EMPTY');
    expect(retryLookup).toBeGreaterThan(0);
    expect(reused).toBeGreaterThan(retryLookup);
    expect(sameHashReturn).toBeGreaterThan(reused);
    expect(alreadyCompleted).toBeGreaterThan(sameHashReturn);
    expect(notEmpty).toBeGreaterThan(alreadyCompleted);
  });

  it('valida hash e insere categorias antes de produtos e ledger', () => {
    const categoryInsert = initializeBody.indexOf('insert into public.categories');
    const productInsert = initializeBody.indexOf('insert into public.products');
    const ledgerInsert = initializeBody.indexOf(
      'insert into private.inventory_bootstrap_operations',
    );
    expect(initializeBody).toContain('extensions.digest');
    expect(initializeBody).toContain('PAYLOAD_HASH_MISMATCH');
    expect(categoryInsert).toBeGreaterThan(0);
    expect(productInsert).toBeGreaterThan(categoryInsert);
    expect(ledgerInsert).toBeGreaterThan(productInsert);
    expect(initializeBody).toMatch(/insert into public\.categories[\s\S]*?,\s*1\s+from/i);
    expect(initializeBody).toMatch(/insert into public\.products[\s\S]*?,\s*1\s+from/i);
  });

  it('insere saldo diretamente sem movimento, upsert, DELETE ou escrita em outro business', () => {
    expect(initializeBody).toMatch(
      /current_quantity[\s\S]*?\(item->>'currentQuantity'\)::bigint/i,
    );
    expect(initializeBody).not.toMatch(/insert into public\.stock_movements/i);
    expect(initializeBody).not.toMatch(/register_stock_movement/i);
    expect(initializeBody).not.toMatch(/\bon conflict\b|\bupsert\b/i);
    expect(initializeBody).not.toMatch(/\bdelete\s+from\b/i);
    expect(initializeBody).not.toMatch(
      /\bupdate\s+public\.(categories|products|stock_movements)/i,
    );
    expect(initializeBody).toMatch(
      /insert into public\.categories[\s\S]*?p_business_id/i,
    );
    expect(initializeBody).toMatch(
      /insert into public\.products[\s\S]*?p_business_id/i,
    );
  });

  it('nao usa service_role nem SQL dinamico', () => {
    expect(migration).not.toMatch(/service_role|sb_secret_/i);
    expect(initializeBody).not.toMatch(/\bexecute\b/i);
  });

  it('revoga public/anon e concede somente EXECUTE a authenticated', () => {
    for (const signature of [
      'get_business_inventory_initialization_state\\(uuid\\)',
      'initialize_business_inventory\\(uuid, text, text, text\\)',
    ]) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon;`, 'i'),
      );
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${signature}\\s+to authenticated;`, 'i'),
      );
    }
  });
});
