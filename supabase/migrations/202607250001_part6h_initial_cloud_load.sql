-- Parte 6H-D: carga inicial remota por snapshot de categorias e produtos.
-- Nao envia movimentos, nao faz upsert, nao executa DELETE e nao libera pull.

create table private.inventory_bootstrap_operations (
  business_id uuid not null references public.businesses (id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 500),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  category_count integer not null check (category_count >= 0),
  product_count integer not null check (product_count >= 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (business_id, idempotency_key),
  unique (business_id)
);

alter table private.inventory_bootstrap_operations enable row level security;
revoke all on private.inventory_bootstrap_operations from public, anon, authenticated;

create or replace function private.is_finite_timestamptz_text(
  p_value text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timestamp timestamptz;
begin
  if p_value is null or pg_catalog.btrim(p_value) = '' then
    return false;
  end if;

  begin
    v_timestamp := p_value::timestamptz;
  exception when others then
    return false;
  end;

  return pg_catalog.isfinite(v_timestamp);
end;
$$;

alter function private.is_finite_timestamptz_text(text)
owner to postgres;

revoke all on function private.is_finite_timestamptz_text(text)
from public, anon, authenticated;

create or replace function public.get_business_inventory_initialization_state(
  p_business_id uuid
)
returns table (
  category_count bigint,
  product_count bigint,
  movement_count bigint,
  sync_operation_count bigint,
  bootstrap_completed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
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

  return query
  select
    (select count(*) from public.categories category where category.business_id = p_business_id),
    (select count(*) from public.products product where product.business_id = p_business_id),
    (select count(*) from public.stock_movements movement where movement.business_id = p_business_id),
    (select count(*) from public.sync_operations operation_record where operation_record.business_id = p_business_id),
    exists (
      select 1
      from private.inventory_bootstrap_operations bootstrap
      where bootstrap.business_id = p_business_id
    );
end;
$$;

alter function public.get_business_inventory_initialization_state(uuid)
owner to postgres;

create or replace function public.initialize_business_inventory(
  p_business_id uuid,
  p_idempotency_key text,
  p_payload_text text,
  p_payload_hash text
)
returns table (
  category_count integer,
  product_count integer,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_payload jsonb;
  v_categories jsonb;
  v_products jsonb;
  v_category_count integer;
  v_product_count integer;
  v_existing private.inventory_bootstrap_operations%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 500 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_payload_text is null then
    raise exception 'PAYLOAD_HASH_MISMATCH' using errcode = '22023';
  end if;

  -- Limite generoso para pequenos comercios: 5 MiB de JSON UTF-8.
  if pg_catalog.octet_length(p_payload_text) > 5242880 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  if p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or encode(extensions.digest(convert_to(p_payload_text, 'UTF8'), 'sha256'), 'hex') <> p_payload_hash then
    raise exception 'PAYLOAD_HASH_MISMATCH' using errcode = '22023';
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

  -- SECURITY DEFINER e necessario somente para manter o ledger privado sem
  -- privilegio de escrita do cliente. Auth e membership sao verificadas
  -- explicitamente antes do lock. FOR UPDATE conflita com o lock de chave
  -- adquirido pelas FKs business_id de categories, products, stock_movements
  -- e sync_operations, coordenando RPCs e inserts diretos concorrentes.
  perform 1
  from public.businesses business
  where business.id = p_business_id
    and business.deleted_at is null
  for update;

  if not found then
    raise exception 'BUSINESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Revalida a membership depois do lock do business e mantem a linha
  -- protegida contra update/delete ate o fim desta transacao.
  perform 1
  from public.business_members membership
  where membership.business_id = p_business_id
    and membership.user_id = v_user_id
    and membership.deleted_at is null
  for share;

  if not found then
    raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  select * into v_existing
  from private.inventory_bootstrap_operations bootstrap
  where bootstrap.business_id = p_business_id
    and bootstrap.idempotency_key = p_idempotency_key;

  if v_existing.business_id is not null then
    if v_existing.payload_hash <> p_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return query
    select v_existing.category_count, v_existing.product_count, true;
    return;
  end if;

  if exists (
    select 1
    from private.inventory_bootstrap_operations bootstrap
    where bootstrap.business_id = p_business_id
  ) then
    raise exception 'BOOTSTRAP_ALREADY_COMPLETED' using errcode = '22023';
  end if;

  if exists (select 1 from public.categories category where category.business_id = p_business_id)
    or exists (select 1 from public.products product where product.business_id = p_business_id)
    or exists (select 1 from public.stock_movements movement where movement.business_id = p_business_id) then
    raise exception 'REMOTE_INVENTORY_NOT_EMPTY' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.sync_operations operation_record
    where operation_record.business_id = p_business_id
  ) then
    raise exception 'REMOTE_SYNC_HISTORY_EXISTS' using errcode = '22023';
  end if;

  begin
    v_payload := p_payload_text::jsonb;
  exception when others then
    raise exception 'INVALID_BOOTSTRAP_PAYLOAD' using errcode = '22023';
  end;

  if jsonb_typeof(v_payload) <> 'object'
    or (v_payload - array['categories', 'products']) <> '{}'::jsonb
    or jsonb_typeof(v_payload->'categories') <> 'array'
    or jsonb_typeof(v_payload->'products') <> 'array' then
    raise exception 'INVALID_BOOTSTRAP_PAYLOAD' using errcode = '22023';
  end if;

  v_categories := v_payload->'categories';
  v_products := v_payload->'products';
  v_category_count := jsonb_array_length(v_categories);
  v_product_count := jsonb_array_length(v_products);

  if v_category_count > 5000 then
    raise exception 'TOO_MANY_CATEGORIES' using errcode = '22023';
  end if;

  if v_product_count > 20000 then
    raise exception 'TOO_MANY_PRODUCTS' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_categories) item
    where jsonb_typeof(item) <> 'object'
      or not (item ?& array['id', 'name', 'createdAt', 'updatedAt', 'deletedAt'])
      or (item - array['id', 'name', 'createdAt', 'updatedAt', 'deletedAt']) <> '{}'::jsonb
      or coalesce(item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(btrim(coalesce(item->>'name', ''))) not between 1 and 120
      or coalesce(item->>'createdAt', '') = ''
      or coalesce(item->>'updatedAt', '') = ''
      or not private.is_finite_timestamptz_text(item->>'createdAt')
      or not private.is_finite_timestamptz_text(item->>'updatedAt')
      or (
        jsonb_typeof(item->'deletedAt') not in ('string', 'null')
      )
      or (
        jsonb_typeof(item->'deletedAt') = 'string'
        and not private.is_finite_timestamptz_text(item->>'deletedAt')
      )
  ) then
    raise exception 'INVALID_CATEGORY_PAYLOAD' using errcode = '22023';
  end if;

  if (
    select count(*)
    from (
      select item->>'id'
      from jsonb_array_elements(v_categories) item
      group by item->>'id'
      having count(*) > 1
    ) duplicates
  ) > 0 then
    raise exception 'INVALID_CATEGORY_PAYLOAD' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_products) item
    where jsonb_typeof(item) <> 'object'
      or not (
        item ?& array[
          'id', 'name', 'code', 'categoryId', 'salePriceInCents',
          'currentQuantity', 'minimumStock', 'createdAt', 'updatedAt', 'deletedAt'
        ]
      )
      or (
        item - array[
          'id', 'name', 'code', 'categoryId', 'salePriceInCents',
          'currentQuantity', 'minimumStock', 'createdAt', 'updatedAt', 'deletedAt'
        ]
      ) <> '{}'::jsonb
      or coalesce(item->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(btrim(coalesce(item->>'name', ''))) not between 1 and 200
      or jsonb_typeof(item->'code') <> 'string'
      or jsonb_typeof(item->'categoryId') not in ('string', 'null')
      or coalesce(item->>'salePriceInCents', '') !~ '^(0|[1-9][0-9]*)$'
      or length(coalesce(item->>'salePriceInCents', '')) > 19
      or coalesce(item->>'currentQuantity', '') !~ '^(0|[1-9][0-9]*)$'
      or length(coalesce(item->>'currentQuantity', '')) > 19
      or coalesce(item->>'minimumStock', '') !~ '^(0|[1-9][0-9]*)$'
      or length(coalesce(item->>'minimumStock', '')) > 19
      or coalesce(item->>'createdAt', '') = ''
      or coalesce(item->>'updatedAt', '') = ''
      or not private.is_finite_timestamptz_text(item->>'createdAt')
      or not private.is_finite_timestamptz_text(item->>'updatedAt')
      or jsonb_typeof(item->'deletedAt') not in ('string', 'null')
      or (
        jsonb_typeof(item->'deletedAt') = 'string'
        and not private.is_finite_timestamptz_text(item->>'deletedAt')
      )
  ) then
    raise exception 'INVALID_PRODUCT_PAYLOAD' using errcode = '22023';
  end if;

  if (
    select count(*)
    from (
      select item->>'id'
      from jsonb_array_elements(v_products) item
      group by item->>'id'
      having count(*) > 1
    ) duplicates
  ) > 0 then
    raise exception 'INVALID_PRODUCT_PAYLOAD' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_products) product
    where jsonb_typeof(product->'categoryId') = 'string'
      and not exists (
        select 1
        from jsonb_array_elements(v_categories) category
        where category->>'id' = product->>'categoryId'
          and (
            jsonb_typeof(category->'deletedAt') = 'null'
            or jsonb_typeof(product->'deletedAt') = 'string'
          )
      )
  ) then
    raise exception 'INVALID_PRODUCT_CATEGORY' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select lower(btrim(item->>'code')) normalized_code
      from jsonb_array_elements(v_products) item
      where jsonb_typeof(item->'deletedAt') = 'null'
        and btrim(item->>'code') <> ''
      group by lower(btrim(item->>'code'))
      having count(*) > 1
    ) duplicate_codes
  ) then
    raise exception 'DUPLICATE_ACTIVE_PRODUCT_CODE' using errcode = '22023';
  end if;

  -- Categorias sao inseridas antes dos produtos para preservar as FKs.
  insert into public.categories (
    id, business_id, name, created_at, updated_at, deleted_at, version
  )
  select
    (item->>'id')::uuid,
    p_business_id,
    btrim(item->>'name'),
    (item->>'createdAt')::timestamptz,
    (item->>'updatedAt')::timestamptz,
    case when jsonb_typeof(item->'deletedAt') = 'string'
      then (item->>'deletedAt')::timestamptz else null end,
    1
  from jsonb_array_elements(v_categories) item;

  insert into public.products (
    id, business_id, name, code, category_id, sale_price_in_cents,
    current_quantity, minimum_stock, created_at, updated_at, deleted_at, version
  )
  select
    (item->>'id')::uuid,
    p_business_id,
    btrim(item->>'name'),
    item->>'code',
    case when jsonb_typeof(item->'categoryId') = 'string'
      then (item->>'categoryId')::uuid else null end,
    (item->>'salePriceInCents')::bigint,
    (item->>'currentQuantity')::bigint,
    (item->>'minimumStock')::bigint,
    (item->>'createdAt')::timestamptz,
    (item->>'updatedAt')::timestamptz,
    case when jsonb_typeof(item->'deletedAt') = 'string'
      then (item->>'deletedAt')::timestamptz else null end,
    1
  from jsonb_array_elements(v_products) item;

  insert into private.inventory_bootstrap_operations (
    business_id,
    idempotency_key,
    payload_hash,
    category_count,
    product_count,
    created_by
  ) values (
    p_business_id,
    p_idempotency_key,
    p_payload_hash,
    v_category_count,
    v_product_count,
    v_user_id
  );

  return query select v_category_count, v_product_count, false;
end;
$$;

alter function public.initialize_business_inventory(uuid, text, text, text)
owner to postgres;

revoke all on function public.get_business_inventory_initialization_state(uuid)
from public, anon;
grant execute on function public.get_business_inventory_initialization_state(uuid)
to authenticated;

revoke all on function public.initialize_business_inventory(uuid, text, text, text)
from public, anon;
grant execute on function public.initialize_business_inventory(uuid, text, text, text)
to authenticated;
