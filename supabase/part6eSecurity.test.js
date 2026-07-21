import { createHash } from 'node:crypto';
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
  new URL('./migrations/202607200001_part6e_stock_movement_rpc.sql', import.meta.url),
  'utf8',
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

describe('migration segura da RPC de estoque da Parte 6E', () => {
  it('preserva byte a byte as migrations das Partes 5 e 6C', () => {
    expect(sha256(part5)).toBe(
      '324ABE3B1E1C694196F79A427A0F4CDB9CFBF19AB1A788E8BBB23DF0BCEF508C',
    );
    expect(sha256(part6c)).toBe(
      '6D8C7407FEA2DC6F0CE5CF4DF311F15DE0A3810A67DB7651E5F5AAAB8935DF4E',
    );
  });

  it('cria register_stock_movement e libera movement.created no ledger', () => {
    expect(migration).toContain('function public.register_stock_movement');
    expect(migration).toContain("'movement.created'");
    expect(migration).toMatch(/entity_type in \('category', 'product', 'movement'\)/i);
  });

  it('valida usuario, membership ativa, business e produto do mesmo business', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('from public.business_members membership');
    expect(migration).toContain('membership.deleted_at is null');
    expect(migration).toMatch(/product\.business_id = p_business_id/i);
    expect(migration).toMatch(/product\.id = p_product_id/i);
    expect(migration).toContain('REMOTE_PRODUCT_DELETED');
  });

  it('bloqueia a linha do produto e nao aceita estoque negativo', () => {
    expect(migration).toMatch(/select product\.\* into v_product[\s\S]*?for update;/i);
    expect(migration).toContain('STOCK_INSUFFICIENT');
    expect(migration).toMatch(/p_quantity > v_product\.current_quantity/i);
    expect(migration).toMatch(/current_quantity = v_resulting_quantity/i);
  });

  it('compara os dois snapshots antes de inserir o movimento', () => {
    expect(migration).toContain('STOCK_PREVIOUS_QUANTITY_CONFLICT');
    expect(migration).toContain('STOCK_RESULTING_QUANTITY_CONFLICT');
    expect(migration.indexOf('STOCK_RESULTING_QUANTITY_CONFLICT')).toBeLessThan(
      migration.indexOf('insert into public.stock_movements'),
    );
  });

  it('usa sync_operations, hash e resultado persistido para idempotencia', () => {
    expect(migration).toContain('extensions.digest');
    expect(migration).toContain('on conflict (business_id, idempotency_key) do nothing');
    expect(migration).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(migration).toContain('IDEMPOTENT_RESULT_NOT_FOUND');
    expect(migration).toMatch(/return query select[\s\S]*?'duplicate'::text/i);
    expect(migration).toMatch(/set applied_version = v_product_version/i);
  });

  it('insere movimento rastreado e incrementa a versao do produto', () => {
    expect(migration).toContain('insert into public.stock_movements');
    expect(migration).toMatch(/is_legacy,[\s\S]*?false,/i);
    expect(migration).toMatch(/version = version \+ 1/i);
  });

  it('usa SECURITY INVOKER, search_path protegido e somente parametros', () => {
    const functionBody = migration.match(
      /function public\.register_stock_movement[\s\S]*?as \$\$([\s\S]*?)\$\$;/i,
    )?.[1];
    expect(migration).toMatch(/language plpgsql\s+security invoker\s+set search_path = ''/i);
    expect(migration).not.toMatch(/security definer/i);
    expect(functionBody).toBeTruthy();
    expect(functionBody).not.toMatch(/\bexecute\b/i);
    expect(migration).not.toMatch(/service_role|sb_secret_/i);
  });

  it('nao abre policy privada nem implementa pull ou automacao', () => {
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/function public\.[a-z_]*pull|setinterval|background sync/i);
    expect(migration).not.toMatch(/delete from public\./i);
  });

  it('restringe a execucao da RPC ao papel authenticated', () => {
    expect(migration).toMatch(/revoke all on function public\.register_stock_movement[\s\S]*?from public, anon;/i);
    expect(migration).toMatch(/grant execute on function public\.register_stock_movement[\s\S]*?to authenticated;/i);
  });
});
