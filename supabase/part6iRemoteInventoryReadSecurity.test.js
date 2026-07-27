import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./migrations/20260726215950_part6i_remote_inventory_read_page.sql', import.meta.url),
  'utf8',
);
const manualPushMigration = readFileSync(
  new URL('./migrations/202607190001_part6c_manual_push.sql', import.meta.url),
  'utf8',
);
const bootstrapMigration = readFileSync(
  new URL('./migrations/202607250001_part6h_initial_cloud_load.sql', import.meta.url),
  'utf8',
);
const baseSchemaMigration = readFileSync(
  new URL('./migrations/202607170001_part5_auth_rls.sql', import.meta.url),
  'utf8',
);
const definition =
  migration.match(
    /create or replace function public\.get_business_inventory_page[\s\S]*?\$\$;/i,
  )?.[0] ?? '';
const body = definition.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? '';
const inventoryCte =
  body.match(/inventory_items as \(([\s\S]*?)\),\s*inventory_state as/i)?.[1] ?? '';
const pageCtes =
  body.match(/eligible_items as \(([\s\S]*?)\)\s*select\s+coalesce/i)?.[1] ?? '';
const cursorConversionBlock =
  body.match(
    /begin\s+v_cursor_version := \(p_cursor->>'version'\)::integer;[\s\S]*?exception[\s\S]*?end;/i,
  )?.[0] ?? '';

describe('migration da leitura remota paginada da Parte 6I-A', () => {
  it.each(['categoria', 'produto'])(
    'reproduz a omissao antiga de %s existente com timestamp futuro do dispositivo',
    (entityType) => {
      const serverNow = '2026-07-26T22:00:00Z';
      const preservedDeviceTimestamp = '2026-07-27T10:00:00Z';
      const wasEligibleWithClockOnly =
        Date.parse(preservedDeviceTimestamp) <= Date.parse(serverNow);

      expect(wasEligibleWithClockOnly).toBe(false);
      expect(manualPushMigration).toMatch(
        entityType === 'categoria'
          ? /insert into public\.categories[\s\S]*?p_created_at[\s\S]*?p_updated_at/i
          : /insert into public\.products[\s\S]*?p_created_at[\s\S]*?p_updated_at/i,
      );
      expect(bootstrapMigration).toMatch(
        entityType === 'categoria'
          ? /insert into public\.categories[\s\S]*?\(item->>'createdAt'\)::timestamptz[\s\S]*?\(item->>'updatedAt'\)::timestamptz/i
          : /insert into public\.products[\s\S]*?\(item->>'createdAt'\)::timestamptz[\s\S]*?\(item->>'updatedAt'\)::timestamptz/i,
      );
      expect(Date.parse(preservedDeviceTimestamp)).toBeGreaterThan(Date.parse(serverNow));
    },
  );

  it('define a assinatura, owner, SECURITY INVOKER e search_path vazio', () => {
    expect(definition).toMatch(
      /public\.get_business_inventory_page\(\s*p_business_id uuid,\s*p_cursor jsonb default null,\s*p_page_size integer default 50\s*\)/i,
    );
    expect(definition).toMatch(/language plpgsql\s+security invoker\s+set search_path = ''/i);
    expect(migration).toMatch(
      /alter function public\.get_business_inventory_page\(uuid, jsonb, integer\)\s+owner to postgres;/i,
    );
  });

  it('exige auth, membership ativa e business nao excluido no corpo da funcao', () => {
    expect(body).toMatch(/v_user_id := auth\.uid\(\)/i);
    expect(body).toMatch(/v_user_id is null[\s\S]*?AUTHENTICATION_REQUIRED/i);
    expect(body).toMatch(
      /from public\.business_members membership[\s\S]*?membership\.business_id = p_business_id[\s\S]*?membership\.user_id = v_user_id[\s\S]*?membership\.deleted_at is null[\s\S]*?ACTIVE_MEMBERSHIP_REQUIRED/i,
    );
    expect(body).toMatch(
      /from public\.businesses business[\s\S]*?business\.id = p_business_id[\s\S]*?business\.deleted_at is null[\s\S]*?BUSINESS_NOT_FOUND/i,
    );
  });

  it('concede EXECUTE somente a authenticated', () => {
    expect(migration).toMatch(
      /revoke all on function public\.get_business_inventory_page\(uuid, jsonb, integer\)\s+from public, anon, service_role;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_business_inventory_page\(uuid, jsonb, integer\)\s+to authenticated;/i,
    );
    expect(migration).not.toMatch(/grant execute[\s\S]*?to (?:public|anon|service_role)/i);
  });

  it('e somente leitura e nao usa SQL dinamico nem ledger como fonte', () => {
    expect(body).not.toMatch(/\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\bupsert\b/i);
    expect(body).not.toMatch(/\bexecute\b|\bformat\s*\(/i);
    expect(inventoryCte).not.toMatch(/sync_operations|inventory_bootstrap_operations|private\./i);
  });

  it('consulta as tres projecoes autoritativas e inclui seus soft deletes', () => {
    expect(inventoryCte).toMatch(/from public\.categories category/i);
    expect(inventoryCte).toMatch(/from public\.products product/i);
    expect(inventoryCte).toMatch(/from public\.stock_movements movement/i);
    expect(inventoryCte.match(/'deletedAt', (?:category|product|movement)\.deleted_at/gi))
      .toHaveLength(6);
    expect(inventoryCte).not.toMatch(/deleted_at is null/i);
  });

  it('limita pageSize e o cursor no servidor', () => {
    expect(body).toMatch(/p_page_size is null or p_page_size < 1 or p_page_size > 200/i);
    expect(body).toMatch(/INVALID_PAGE_SIZE/i);
    expect(body).toMatch(/pg_catalog\.octet_length\(p_cursor::text\) > 4096/i);
    expect(body).toMatch(/INVALID_CURSOR/i);
  });

  it('valida versao, business, watermark e chave completa do cursor', () => {
    expect(body).toMatch(/p_cursor - array\['version', 'businessId', 'watermark', 'after'\]/i);
    expect(body).toMatch(
      /\(p_cursor->'after'\) - array\['sortTime', 'entityRank', 'entityId'\]/i,
    );
    expect(body).toMatch(/v_cursor_version <> 1[\s\S]*?UNSUPPORTED_CURSOR_VERSION/i);
    expect(body).toMatch(/v_cursor_business_id <> p_business_id[\s\S]*?CURSOR_BUSINESS_MISMATCH/i);
    expect(body).toMatch(/v_after_sort_time > v_watermark/i);
    expect(body).toMatch(/v_after_entity_rank not between 1 and 3/i);
  });

  it('sanitiza qualquer falha nas conversoes de entrada do cursor', () => {
    for (const conversion of [
      /v_cursor_version := \(p_cursor->>'version'\)::integer/i,
      /v_cursor_business_id := \(p_cursor->>'businessId'\)::uuid/i,
      /v_watermark := \(p_cursor->>'watermark'\)::timestamptz/i,
      /v_after_sort_time := \(p_cursor->'after'->>'sortTime'\)::timestamptz/i,
      /v_after_entity_rank := \(p_cursor->'after'->>'entityRank'\)::integer/i,
      /v_after_entity_id := \(p_cursor->'after'->>'entityId'\)::uuid/i,
    ]) {
      expect(cursorConversionBlock).toMatch(conversion);
    }
    expect(cursorConversionBlock).toMatch(
      /exception\s+[\s\S]*?when others then\s+raise exception 'INVALID_CURSOR' using errcode = '22023';/i,
    );
    expect(body.match(/\bwhen others\b/gi)).toHaveLength(1);
  });

  it.each([
    ['watermark textual invalido', /v_watermark := .*::timestamptz/i],
    ['sortTime textual invalido', /v_after_sort_time := .*::timestamptz/i],
    ['data impossivel', /when others then/i],
    ['UUID invalido', /v_cursor_business_id := .*::uuid/i],
    ['inteiro fora do intervalo', /v_cursor_version := .*::integer/i],
  ])('%s segue pela conversao protegida e retorna INVALID_CURSOR', (_case, conversion) => {
    expect(cursorConversionBlock).toMatch(conversion);
    expect(cursorConversionBlock).toMatch(
      /raise exception 'INVALID_CURSOR' using errcode = '22023'/i,
    );
  });

  it.each(['infinity', '-infinity'])(
    '%s e recusado pela validacao finita com erro estavel',
    () => {
      expect(body).toMatch(
        /not pg_catalog\.isfinite\(v_watermark\)[\s\S]*?not pg_catalog\.isfinite\(v_after_sort_time\)[\s\S]*?raise exception 'INVALID_CURSOR' using errcode = '22023'/i,
      );
    },
  );

  it('calcula server_now uma vez e inclui o maior sortTime finito visivel', () => {
    expect(body).toMatch(
      /session_clock as materialized \(\s*select pg_catalog\.clock_timestamp\(\) as server_now\s*\)/i,
    );
    expect(body).toMatch(
      /max\(inventory_item\.sort_time\) filter \(\s*where not inventory_item\.invalid_timestamp\s*\) as max_finite_sort_time/i,
    );
    expect(body).toMatch(
      /when p_cursor is null then greatest\(\s*session_clock\.server_now,\s*coalesce\(inventory_state\.max_finite_sort_time, session_clock\.server_now\)\s*\)/i,
    );
    expect(body).toMatch(/inventory_item\.sort_time <= session_bounds\.watermark/i);
  });

  it('reutiliza exatamente o watermark do cursor nas paginas seguintes', () => {
    expect(body).toMatch(
      /else[\s\S]*?v_watermark := \(p_cursor->>'watermark'\)::timestamptz/i,
    );
    expect(body).toMatch(/else v_watermark\s+end as watermark/i);
    expect(body).toMatch(/'watermark', v_watermark/i);
  });

  it.each([
    ['inventario vazio', null, '2026-07-26T22:00:00Z'],
    ['maior sortTime anterior', '2026-07-26T20:00:00Z', '2026-07-26T22:00:00Z'],
    ['maior sortTime posterior', '2026-07-27T10:00:00Z', '2026-07-27T10:00:00Z'],
  ])('%s escolhe o limite superior correto', (_case, maxSortTime, expected) => {
    const serverNow = '2026-07-26T22:00:00Z';
    const watermark =
      maxSortTime === null || Date.parse(maxSortTime) < Date.parse(serverNow)
        ? serverNow
        : maxSortTime;
    expect(watermark).toBe(expected);
  });

  it.each([
    ['categoria futura', '2026-07-27T10:00:00Z'],
    ['produto futuro', '2026-07-27T11:00:00Z'],
    ['soft delete futuro finito', '2026-07-27T12:00:00Z'],
  ])('%s fica elegivel pelo novo watermark', (_case, sortTime) => {
    const serverNow = '2026-07-26T22:00:00Z';
    const watermark =
      Date.parse(sortTime) > Date.parse(serverNow) ? sortTime : serverNow;
    expect(Date.parse(sortTime) <= Date.parse(watermark)).toBe(true);
    expect(body).toMatch(
      /greatest\(\s*session_clock\.server_now,\s*coalesce\(inventory_state\.max_finite_sort_time, session_clock\.server_now\)\s*\)/i,
    );
  });

  it.each(['category', 'product', 'movement'])(
    'bloqueia timestamps nao finitos de %s antes de retornar pagina',
    (entity) => {
      expect(inventoryCte).toMatch(
        new RegExp(
          `not pg_catalog\\.isfinite\\(${entity}\\.created_at\\)[\\s\\S]*?` +
          `not pg_catalog\\.isfinite\\(${entity}\\.updated_at\\)[\\s\\S]*?` +
          `${entity}\\.deleted_at is not null[\\s\\S]*?` +
          `not pg_catalog\\.isfinite\\(${entity}\\.deleted_at\\)`,
          'i',
        ),
      );
      expect(body).toMatch(
        /if v_invalid_remote_timestamp then\s+raise exception 'INVALID_REMOTE_INVENTORY_TIMESTAMP' using errcode = '22023'/i,
      );
    },
  );

  it('nao oculta timestamps invalidos pelo filtro do watermark', () => {
    const invalidCheck = body.indexOf('if v_invalid_remote_timestamp then');
    const response = body.indexOf('v_response := jsonb_build_object');
    expect(invalidCheck).toBeGreaterThan(0);
    expect(invalidCheck).toBeLessThan(response);
    expect(body).toMatch(/where not inventory_item\.invalid_timestamp/i);
  });

  it('usa sortTime real, ranks fixos e ordenacao global deterministica', () => {
    for (const entity of ['category', 'product', 'movement']) {
      expect(inventoryCte).toMatch(
        new RegExp(
          `greatest\\(\\s*${entity}\\.created_at,\\s*${entity}\\.updated_at,\\s*coalesce\\(${entity}\\.deleted_at`,
          'i',
        ),
      );
    }
    expect(inventoryCte).toMatch(/1 as entity_rank[\s\S]*?2 as entity_rank[\s\S]*?3 as entity_rank/i);
    expect(pageCtes).toMatch(
      /\(inventory_item\.sort_time, inventory_item\.entity_rank, inventory_item\.entity_id\)\s*>\s*\(v_after_sort_time, v_after_entity_rank, v_after_entity_id\)/i,
    );
    expect(pageCtes.match(/order by sort_time, entity_rank, entity_id/gi)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it('usa limite+1, calcula hasMore e deriva nextCursor do ultimo item retornado', () => {
    expect(pageCtes).toMatch(/limit p_page_size \+ 1/i);
    expect(pageCtes).toMatch(/limit p_page_size/i);
    expect(body).toMatch(/count\(\*\) > p_page_size from page_window/i);
    expect(body).toMatch(
      /select sort_time from returned_items order by sort_time desc, entity_rank desc, entity_id desc limit 1/i,
    );
    expect(body).toMatch(
      /'sortTime', v_last_sort_time[\s\S]*?'entityRank', v_last_entity_rank[\s\S]*?'entityId', v_last_entity_id/i,
    );
  });

  it('preserva centavos, saldos e todos os snapshots autoritativos de movimento', () => {
    expect(inventoryCte).toMatch(/'salePriceInCents', product\.sale_price_in_cents/i);
    expect(inventoryCte).toMatch(/'currentQuantity', product\.current_quantity/i);
    expect(inventoryCte).toMatch(/'movementDate', movement\.movement_date/i);
    expect(inventoryCte).toMatch(/'previousQuantity', movement\.previous_quantity/i);
    expect(inventoryCte).toMatch(/'resultingQuantity', movement\.resulting_quantity/i);
    expect(inventoryCte).toMatch(/'isLegacy', movement\.is_legacy/i);
    expect(inventoryCte).toMatch(/'note', movement\.note/i);
  });

  it('limita o JSON completo da pagina a 5 MiB antes do RETURN', () => {
    const responseBuild = body.indexOf('v_response := jsonb_build_object');
    const byteCheck = body.indexOf('pg_catalog.octet_length(v_response::text) > 5242880');
    const returned = body.indexOf('return v_response');
    expect(responseBuild).toBeGreaterThan(0);
    expect(byteCheck).toBeGreaterThan(responseBuild);
    expect(returned).toBeGreaterThan(byteCheck);
    expect(body.slice(byteCheck, returned)).toMatch(
      /REMOTE_PAGE_TOO_LARGE[\s\S]*?errcode = '22023'/i,
    );
  });

  it.each([
    ['pagina pequena', 1024, false],
    ['pagina exatamente no limite', 5242880, false],
    ['pagina um byte acima', 5242881, true],
  ])('%s respeita a fronteira em bytes', (_case, bytes, rejected) => {
    expect(bytes > 5242880).toBe(rejected);
  });

  it('audita textos sem confiar em trim e aplica o limite sem truncagem', () => {
    expect(baseSchemaMigration).toMatch(
      /create table public\.categories[\s\S]*?name text not null check \(length\(btrim\(name\)\) between 1 and 120\)/i,
    );
    expect(baseSchemaMigration).toMatch(
      /create table public\.products[\s\S]*?name text not null check \(length\(btrim\(name\)\) between 1 and 200\)[\s\S]*?code text not null default ''/i,
    );
    expect(baseSchemaMigration).toMatch(
      /create table public\.stock_movements[\s\S]*?note text not null default ''/i,
    );
    expect(body).toMatch(/'code', product\.code/i);
    expect(body).toMatch(/'note', movement\.note/i);
    expect(body).not.toMatch(/\bsubstring\b|\bleft\s*\(|\bright\s*\(/i);
    expect(body).toMatch(/pg_catalog\.octet_length\(v_response::text\) > 5242880/i);
  });

  it.each([
    'pageSize 1 com note gigante',
    'code gigante',
    'nome com espacos externos gigantes',
  ])('%s e recusado pelo limite total sem resposta parcial', () => {
    expect(body).toMatch(
      /if pg_catalog\.octet_length\(v_response::text\) > 5242880 then\s+raise exception 'REMOTE_PAGE_TOO_LARGE'/i,
    );
    expect(body).not.toMatch(/return v_response[\s\S]*?REMOTE_PAGE_TOO_LARGE/i);
  });
});
