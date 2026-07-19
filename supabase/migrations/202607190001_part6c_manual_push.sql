-- Parte 6C: push manual idempotente para categorias e produtos.
-- Nao implementa pull, conflitos, movimentacoes ou processamento automatico.

create table public.sync_operations (
  business_id uuid not null references public.businesses (id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 500),
  entity_type text not null check (entity_type in ('category', 'product')),
  entity_id uuid not null,
  operation text not null check (
    operation in (
      'category.created',
      'category.updated',
      'category.deleted',
      'product.created',
      'product.updated',
      'product.deleted'
    )
  ),
  payload_hash text not null,
  applied_version integer check (applied_version > 0),
  created_at timestamptz not null default now(),
  primary key (business_id, idempotency_key)
);

create index sync_operations_entity_idx
  on public.sync_operations (business_id, entity_type, entity_id, created_at);

alter table public.sync_operations enable row level security;

create policy "sync_operations_select_member"
on public.sync_operations for select
to authenticated
using (private.is_active_business_member(business_id));

create policy "sync_operations_insert_member"
on public.sync_operations for insert
to authenticated
with check (private.is_active_business_member(business_id));

create policy "sync_operations_update_member"
on public.sync_operations for update
to authenticated
using (private.is_active_business_member(business_id))
with check (private.is_active_business_member(business_id));

grant select, insert, update on public.sync_operations to authenticated;

create or replace function public.push_category_outbox_event(
  p_business_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_entity_id uuid,
  p_name text,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_expected_version integer
)
returns table (applied_version integer, was_duplicate boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload_hash text;
  v_inserted integer;
  v_version integer;
  v_existing public.sync_operations%rowtype;
begin
  if not private.is_active_business_member(p_business_id) then
    raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  if p_operation not in ('category.created', 'category.updated', 'category.deleted') then
    raise exception 'INVALID_CATEGORY_OPERATION' using errcode = '22023';
  end if;

  v_payload_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'business_id', p_business_id,
        'operation', p_operation,
        'entity_id', p_entity_id,
        'name', p_name,
        'created_at', p_created_at,
        'updated_at', p_updated_at,
        'deleted_at', p_deleted_at,
        'expected_version', p_expected_version
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.sync_operations (
    business_id,
    idempotency_key,
    entity_type,
    entity_id,
    operation,
    payload_hash
  ) values (
    p_business_id,
    p_idempotency_key,
    'category',
    p_entity_id,
    p_operation,
    v_payload_hash
  )
  on conflict (business_id, idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing
    from public.sync_operations operation_record
    where operation_record.business_id = p_business_id
      and operation_record.idempotency_key = p_idempotency_key;

    if v_existing.entity_type <> 'category'
      or v_existing.entity_id <> p_entity_id
      or v_existing.operation <> p_operation
      or v_existing.payload_hash <> v_payload_hash
      or v_existing.applied_version is null then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return query select v_existing.applied_version, true;
    return;
  end if;

  if p_operation = 'category.created' then
    insert into public.categories (
      id,
      business_id,
      name,
      created_at,
      updated_at,
      deleted_at,
      version
    ) values (
      p_entity_id,
      p_business_id,
      p_name,
      p_created_at,
      p_updated_at,
      p_deleted_at,
      1
    )
    returning version into v_version;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception 'BASE_VERSION_REQUIRED' using errcode = '22023';
    end if;

    update public.categories
    set name = p_name,
        deleted_at = p_deleted_at,
        version = version + 1
    where id = p_entity_id
      and business_id = p_business_id
      and version = p_expected_version
    returning version into v_version;

    if v_version is null then
      if exists (
        select 1 from public.categories
        where id = p_entity_id and business_id = p_business_id
      ) then
        raise exception 'REMOTE_VERSION_CONFLICT' using errcode = '40001';
      end if;
      raise exception 'REMOTE_ENTITY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  update public.sync_operations
  set applied_version = v_version
  where business_id = p_business_id and idempotency_key = p_idempotency_key;

  return query select v_version, false;
end;
$$;

create or replace function public.push_product_outbox_event(
  p_business_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_entity_id uuid,
  p_name text,
  p_code text,
  p_category_id uuid,
  p_sale_price_in_cents bigint,
  p_initial_quantity bigint,
  p_minimum_stock bigint,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_deleted_at timestamptz,
  p_expected_version integer
)
returns table (applied_version integer, was_duplicate boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload_hash text;
  v_inserted integer;
  v_version integer;
  v_existing public.sync_operations%rowtype;
begin
  if not private.is_active_business_member(p_business_id) then
    raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  if p_operation not in ('product.created', 'product.updated', 'product.deleted') then
    raise exception 'INVALID_PRODUCT_OPERATION' using errcode = '22023';
  end if;

  v_payload_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'business_id', p_business_id,
        'operation', p_operation,
        'entity_id', p_entity_id,
        'name', p_name,
        'code', p_code,
        'category_id', p_category_id,
        'sale_price_in_cents', p_sale_price_in_cents,
        'initial_quantity', p_initial_quantity,
        'minimum_stock', p_minimum_stock,
        'created_at', p_created_at,
        'updated_at', p_updated_at,
        'deleted_at', p_deleted_at,
        'expected_version', p_expected_version
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.sync_operations (
    business_id,
    idempotency_key,
    entity_type,
    entity_id,
    operation,
    payload_hash
  ) values (
    p_business_id,
    p_idempotency_key,
    'product',
    p_entity_id,
    p_operation,
    v_payload_hash
  )
  on conflict (business_id, idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing
    from public.sync_operations operation_record
    where operation_record.business_id = p_business_id
      and operation_record.idempotency_key = p_idempotency_key;

    if v_existing.entity_type <> 'product'
      or v_existing.entity_id <> p_entity_id
      or v_existing.operation <> p_operation
      or v_existing.payload_hash <> v_payload_hash
      or v_existing.applied_version is null then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    return query select v_existing.applied_version, true;
    return;
  end if;

  if p_operation = 'product.created' then
    insert into public.products (
      id,
      business_id,
      name,
      code,
      category_id,
      sale_price_in_cents,
      current_quantity,
      minimum_stock,
      created_at,
      updated_at,
      deleted_at,
      version
    ) values (
      p_entity_id,
      p_business_id,
      p_name,
      p_code,
      p_category_id,
      p_sale_price_in_cents,
      p_initial_quantity,
      p_minimum_stock,
      p_created_at,
      p_updated_at,
      p_deleted_at,
      1
    )
    returning version into v_version;
  else
    if p_expected_version is null or p_expected_version < 1 then
      raise exception 'BASE_VERSION_REQUIRED' using errcode = '22023';
    end if;

    update public.products
    set name = p_name,
        code = p_code,
        category_id = p_category_id,
        sale_price_in_cents = p_sale_price_in_cents,
        minimum_stock = p_minimum_stock,
        deleted_at = p_deleted_at,
        version = version + 1
    where id = p_entity_id
      and business_id = p_business_id
      and version = p_expected_version
    returning version into v_version;

    if v_version is null then
      if exists (
        select 1 from public.products
        where id = p_entity_id and business_id = p_business_id
      ) then
        raise exception 'REMOTE_VERSION_CONFLICT' using errcode = '40001';
      end if;
      raise exception 'REMOTE_ENTITY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  update public.sync_operations
  set applied_version = v_version
  where business_id = p_business_id and idempotency_key = p_idempotency_key;

  return query select v_version, false;
end;
$$;

revoke all on function public.push_category_outbox_event(
  uuid, text, text, uuid, text, timestamptz, timestamptz, timestamptz, integer
) from public, anon;
grant execute on function public.push_category_outbox_event(
  uuid, text, text, uuid, text, timestamptz, timestamptz, timestamptz, integer
) to authenticated;

revoke all on function public.push_product_outbox_event(
  uuid, text, text, uuid, text, text, uuid, bigint, bigint, bigint,
  timestamptz, timestamptz, timestamptz, integer
) from public, anon;
grant execute on function public.push_product_outbox_event(
  uuid, text, text, uuid, text, text, uuid, bigint, bigint, bigint,
  timestamptz, timestamptz, timestamptz, integer
) to authenticated;
