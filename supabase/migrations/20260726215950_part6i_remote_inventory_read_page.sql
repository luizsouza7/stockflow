-- StockFlow - Parte 6I-A: leitura remota paginada, somente para inspecao.
-- O cursor e efemero, limitado a uma sessao em memoria, e nao representa pull.

create or replace function public.get_business_inventory_page(
  p_business_id uuid,
  p_cursor jsonb default null,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_watermark timestamptz;
  v_after_sort_time timestamptz;
  v_after_entity_rank integer;
  v_after_entity_id uuid;
  v_cursor_business_id uuid;
  v_cursor_version integer;
  v_items jsonb;
  v_returned_count integer;
  v_has_more boolean;
  v_last_sort_time timestamptz;
  v_last_entity_rank integer;
  v_last_entity_id uuid;
  v_next_cursor jsonb;
  v_invalid_remote_timestamp boolean;
  v_response jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 200 then
    raise exception 'INVALID_PAGE_SIZE' using errcode = '22023';
  end if;

  if p_cursor is not null
    and pg_catalog.octet_length(p_cursor::text) > 4096 then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.business_members membership
    where membership.business_id = p_business_id
      and membership.user_id = v_user_id
      and membership.deleted_at is null
  ) then
    raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.businesses business
    where business.id = p_business_id
      and business.deleted_at is null
  ) then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_cursor is null then
    v_cursor_version := 1;
    v_cursor_business_id := p_business_id;
    -- O watermark inicial sera calculado na mesma consulta que materializa
    -- os itens, considerando timestamps finitos preservados do dispositivo.
    v_watermark := null;
    v_after_sort_time := null;
    v_after_entity_rank := null;
    v_after_entity_id := null;
  else
    if jsonb_typeof(p_cursor) <> 'object'
      or (p_cursor - array['version', 'businessId', 'watermark', 'after']) <> '{}'::jsonb
      or not (p_cursor ?& array['version', 'businessId', 'watermark', 'after'])
      or jsonb_typeof(p_cursor->'version') <> 'number'
      or coalesce(p_cursor->>'version', '') !~ '^[0-9]+$'
      or jsonb_typeof(p_cursor->'businessId') <> 'string'
      or jsonb_typeof(p_cursor->'watermark') <> 'string'
      or jsonb_typeof(p_cursor->'after') <> 'object'
      or ((p_cursor->'after') - array['sortTime', 'entityRank', 'entityId']) <> '{}'::jsonb
      or not ((p_cursor->'after') ?& array['sortTime', 'entityRank', 'entityId'])
      or jsonb_typeof(p_cursor->'after'->'sortTime') <> 'string'
      or jsonb_typeof(p_cursor->'after'->'entityRank') <> 'number'
      or coalesce(p_cursor->'after'->>'entityRank', '') !~ '^[0-9]+$'
      or jsonb_typeof(p_cursor->'after'->'entityId') <> 'string' then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;

    begin
      v_cursor_version := (p_cursor->>'version')::integer;
      v_cursor_business_id := (p_cursor->>'businessId')::uuid;
      v_watermark := (p_cursor->>'watermark')::timestamptz;
      v_after_sort_time := (p_cursor->'after'->>'sortTime')::timestamptz;
      v_after_entity_rank := (p_cursor->'after'->>'entityRank')::integer;
      v_after_entity_id := (p_cursor->'after'->>'entityId')::uuid;
    exception
      -- A captura abrangente abaixo e deliberadamente restrita as seis
      -- conversoes de entrada; nenhuma mensagem nativa de cast pode escapar.
      when others then
        raise exception 'INVALID_CURSOR' using errcode = '22023';
    end;

    if v_cursor_version <> 1 then
      raise exception 'UNSUPPORTED_CURSOR_VERSION' using errcode = '22023';
    end if;

    if v_cursor_business_id <> p_business_id then
      raise exception 'CURSOR_BUSINESS_MISMATCH' using errcode = '22023';
    end if;

    if not pg_catalog.isfinite(v_watermark)
      or not pg_catalog.isfinite(v_after_sort_time)
      or v_after_sort_time > v_watermark
      or v_after_entity_rank not between 1 and 3 then
      raise exception 'INVALID_CURSOR' using errcode = '22023';
    end if;
  end if;

  with session_clock as materialized (
    select pg_catalog.clock_timestamp() as server_now
  ),
  inventory_items as (
    select
      greatest(
        category.created_at,
        category.updated_at,
        coalesce(category.deleted_at, '-infinity'::timestamptz)
      ) as sort_time,
      1 as entity_rank,
      category.id as entity_id,
      (
        not pg_catalog.isfinite(category.created_at)
        or not pg_catalog.isfinite(category.updated_at)
        or (
          category.deleted_at is not null
          and not pg_catalog.isfinite(category.deleted_at)
        )
      ) as invalid_timestamp,
      jsonb_build_object(
        'entityType', 'category',
        'entityId', category.id,
        'businessId', category.business_id,
        'version', category.version,
        'sortTime', greatest(
          category.created_at,
          category.updated_at,
          coalesce(category.deleted_at, '-infinity'::timestamptz)
        ),
        'deletedAt', category.deleted_at,
        'data', jsonb_build_object(
          'id', category.id,
          'businessId', category.business_id,
          'name', category.name,
          'version', category.version,
          'createdAt', category.created_at,
          'updatedAt', category.updated_at,
          'deletedAt', category.deleted_at
        )
      ) as item
    from public.categories category
    where category.business_id = p_business_id

    union all

    select
      greatest(
        product.created_at,
        product.updated_at,
        coalesce(product.deleted_at, '-infinity'::timestamptz)
      ) as sort_time,
      2 as entity_rank,
      product.id as entity_id,
      (
        not pg_catalog.isfinite(product.created_at)
        or not pg_catalog.isfinite(product.updated_at)
        or (
          product.deleted_at is not null
          and not pg_catalog.isfinite(product.deleted_at)
        )
      ) as invalid_timestamp,
      jsonb_build_object(
        'entityType', 'product',
        'entityId', product.id,
        'businessId', product.business_id,
        'version', product.version,
        'sortTime', greatest(
          product.created_at,
          product.updated_at,
          coalesce(product.deleted_at, '-infinity'::timestamptz)
        ),
        'deletedAt', product.deleted_at,
        'data', jsonb_build_object(
          'id', product.id,
          'businessId', product.business_id,
          'name', product.name,
          'code', product.code,
          'categoryId', product.category_id,
          'salePriceInCents', product.sale_price_in_cents,
          'currentQuantity', product.current_quantity,
          'minimumStock', product.minimum_stock,
          'version', product.version,
          'createdAt', product.created_at,
          'updatedAt', product.updated_at,
          'deletedAt', product.deleted_at
        )
      ) as item
    from public.products product
    where product.business_id = p_business_id

    union all

    select
      greatest(
        movement.created_at,
        movement.updated_at,
        coalesce(movement.deleted_at, '-infinity'::timestamptz)
      ) as sort_time,
      3 as entity_rank,
      movement.id as entity_id,
      (
        not pg_catalog.isfinite(movement.created_at)
        or not pg_catalog.isfinite(movement.updated_at)
        or (
          movement.deleted_at is not null
          and not pg_catalog.isfinite(movement.deleted_at)
        )
      ) as invalid_timestamp,
      jsonb_build_object(
        'entityType', 'movement',
        'entityId', movement.id,
        'businessId', movement.business_id,
        'version', movement.version,
        'sortTime', greatest(
          movement.created_at,
          movement.updated_at,
          coalesce(movement.deleted_at, '-infinity'::timestamptz)
        ),
        'deletedAt', movement.deleted_at,
        'data', jsonb_build_object(
          'id', movement.id,
          'businessId', movement.business_id,
          'productId', movement.product_id,
          'type', movement.movement_type,
          'quantity', movement.quantity,
          'note', movement.note,
          'movementDate', movement.movement_date,
          'previousQuantity', movement.previous_quantity,
          'resultingQuantity', movement.resulting_quantity,
          'isLegacy', movement.is_legacy,
          'version', movement.version,
          'createdAt', movement.created_at,
          'updatedAt', movement.updated_at,
          'deletedAt', movement.deleted_at
        )
      ) as item
    from public.stock_movements movement
    where movement.business_id = p_business_id
  ),
  inventory_state as (
    select
      coalesce(pg_catalog.bool_or(inventory_item.invalid_timestamp), false)
        as has_invalid_timestamp,
      max(inventory_item.sort_time) filter (
        where not inventory_item.invalid_timestamp
      ) as max_finite_sort_time
    from inventory_items inventory_item
  ),
  session_bounds as materialized (
    select
      case
        when p_cursor is null then greatest(
          session_clock.server_now,
          coalesce(inventory_state.max_finite_sort_time, session_clock.server_now)
        )
        else v_watermark
      end as watermark,
      inventory_state.has_invalid_timestamp
    from session_clock
    cross join inventory_state
  ),
  eligible_items as (
    select inventory_item.*
    from inventory_items inventory_item
    cross join session_bounds
    where not inventory_item.invalid_timestamp
      and inventory_item.sort_time <= session_bounds.watermark
      and (
        v_after_sort_time is null
        or (inventory_item.sort_time, inventory_item.entity_rank, inventory_item.entity_id)
          > (v_after_sort_time, v_after_entity_rank, v_after_entity_id)
      )
  ),
  page_window as (
    select *
    from eligible_items
    order by sort_time, entity_rank, entity_id
    limit p_page_size + 1
  ),
  returned_items as (
    select *
    from page_window
    order by sort_time, entity_rank, entity_id
    limit p_page_size
  )
  select
    coalesce(
      (select jsonb_agg(item order by sort_time, entity_rank, entity_id) from returned_items),
      '[]'::jsonb
    ),
    (select count(*)::integer from returned_items),
    (select count(*) > p_page_size from page_window),
    (select sort_time from returned_items order by sort_time desc, entity_rank desc, entity_id desc limit 1),
    (select entity_rank from returned_items order by sort_time desc, entity_rank desc, entity_id desc limit 1),
    (select entity_id from returned_items order by sort_time desc, entity_rank desc, entity_id desc limit 1),
    (select watermark from session_bounds),
    (select has_invalid_timestamp from session_bounds)
  into
    v_items,
    v_returned_count,
    v_has_more,
    v_last_sort_time,
    v_last_entity_rank,
    v_last_entity_id,
    v_watermark,
    v_invalid_remote_timestamp;

  if v_invalid_remote_timestamp then
    raise exception 'INVALID_REMOTE_INVENTORY_TIMESTAMP' using errcode = '22023';
  end if;

  if v_has_more then
    v_next_cursor := jsonb_build_object(
      'version', 1,
      'businessId', p_business_id,
      'watermark', v_watermark,
      'after', jsonb_build_object(
        'sortTime', v_last_sort_time,
        'entityRank', v_last_entity_rank,
        'entityId', v_last_entity_id
      )
    );
  else
    v_next_cursor := null;
  end if;

  v_response := jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more,
    'watermark', v_watermark,
    'pageSize', p_page_size,
    'returnedCount', v_returned_count
  );

  -- 5 MiB por pagina, medidos no JSON completo em bytes UTF-8.
  if pg_catalog.octet_length(v_response::text) > 5242880 then
    raise exception 'REMOTE_PAGE_TOO_LARGE' using errcode = '22023';
  end if;

  return v_response;
end;
$$;

alter function public.get_business_inventory_page(uuid, jsonb, integer)
owner to postgres;

revoke all on function public.get_business_inventory_page(uuid, jsonb, integer)
from public, anon, service_role;

grant execute on function public.get_business_inventory_page(uuid, jsonb, integer)
to authenticated;
