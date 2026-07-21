-- Parte 6E: RPC atomica e idempotente para movement.created.
-- O fluxo permanece manual e nao implementa pull ou resolucao de conflitos.

alter table public.sync_operations
  drop constraint sync_operations_entity_type_check;

alter table public.sync_operations
  add constraint sync_operations_entity_type_check
  check (entity_type in ('category', 'product', 'movement'));

alter table public.sync_operations
  drop constraint sync_operations_operation_check;

alter table public.sync_operations
  add constraint sync_operations_operation_check
  check (
    operation in (
      'category.created',
      'category.updated',
      'category.deleted',
      'product.created',
      'product.updated',
      'product.deleted',
      'movement.created'
    )
  );

create or replace function public.register_stock_movement(
  p_business_id uuid,
  p_idempotency_key text,
  p_movement_id uuid,
  p_product_id uuid,
  p_type text,
  p_quantity bigint,
  p_note text,
  p_occurred_at timestamptz,
  p_previous_quantity bigint,
  p_resulting_quantity bigint,
  p_client_created_at timestamptz
)
returns table (
  movement_id uuid,
  product_id uuid,
  previous_quantity bigint,
  resulting_quantity bigint,
  product_version integer,
  applied_version integer,
  status text,
  was_duplicate boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_payload_hash text;
  v_inserted integer;
  v_existing public.sync_operations%rowtype;
  v_remote_movement public.stock_movements%rowtype;
  v_product public.products%rowtype;
  v_resulting_quantity bigint;
  v_product_version integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
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

  if p_business_id is null or p_movement_id is null or p_product_id is null then
    raise exception 'INVALID_MOVEMENT_IDENTIFIERS' using errcode = '22023';
  end if;

  if p_idempotency_key is null
    or length(p_idempotency_key) < 1
    or length(p_idempotency_key) > 500 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_type not in ('entrada', 'saida') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_MOVEMENT_QUANTITY' using errcode = '22023';
  end if;

  if p_previous_quantity is null
    or p_previous_quantity < 0
    or p_resulting_quantity is null
    or p_resulting_quantity < 0 then
    raise exception 'SAFE_STOCK_SNAPSHOTS_REQUIRED' using errcode = '22023';
  end if;

  if p_occurred_at is null or p_client_created_at is null then
    raise exception 'INVALID_MOVEMENT_TIMESTAMPS' using errcode = '22023';
  end if;

  v_payload_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'business_id', p_business_id,
        'movement_id', p_movement_id,
        'product_id', p_product_id,
        'type', p_type,
        'quantity', p_quantity,
        'note', coalesce(p_note, ''),
        'occurred_at', p_occurred_at,
        'previous_quantity', p_previous_quantity,
        'resulting_quantity', p_resulting_quantity,
        'client_created_at', p_client_created_at
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
    'movement',
    p_movement_id,
    'movement.created',
    v_payload_hash
  )
  on conflict (business_id, idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing
    from public.sync_operations operation_record
    where operation_record.business_id = p_business_id
      and operation_record.idempotency_key = p_idempotency_key;

    if v_existing.entity_type <> 'movement'
      or v_existing.entity_id <> p_movement_id
      or v_existing.operation <> 'movement.created'
      or v_existing.payload_hash <> v_payload_hash
      or v_existing.applied_version is null then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;

    select * into v_remote_movement
    from public.stock_movements remote_movement
    where remote_movement.business_id = p_business_id
      and remote_movement.id = p_movement_id
      and remote_movement.product_id = p_product_id
      and remote_movement.deleted_at is null;

    if v_remote_movement.id is null then
      raise exception 'IDEMPOTENT_RESULT_NOT_FOUND' using errcode = 'P0002';
    end if;

    return query select
      v_remote_movement.id,
      v_remote_movement.product_id,
      v_remote_movement.previous_quantity,
      v_remote_movement.resulting_quantity,
      v_existing.applied_version,
      v_existing.applied_version,
      'duplicate'::text,
      true;
    return;
  end if;

  select product.* into v_product
  from public.products product
  where product.business_id = p_business_id
    and product.id = p_product_id
  for update;

  if v_product.id is null then
    raise exception 'REMOTE_PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_product.deleted_at is not null then
    raise exception 'REMOTE_PRODUCT_DELETED' using errcode = '22023';
  end if;

  if v_product.current_quantity <> p_previous_quantity then
    raise exception 'STOCK_PREVIOUS_QUANTITY_CONFLICT' using errcode = '40001';
  end if;

  if p_type = 'saida' then
    if p_quantity > v_product.current_quantity then
      raise exception 'STOCK_INSUFFICIENT' using errcode = '22023';
    end if;
    v_resulting_quantity := v_product.current_quantity - p_quantity;
  else
    if v_product.current_quantity > 9223372036854775807 - p_quantity then
      raise exception 'STOCK_QUANTITY_OVERFLOW' using errcode = '22003';
    end if;
    v_resulting_quantity := v_product.current_quantity + p_quantity;
  end if;

  if v_resulting_quantity <> p_resulting_quantity then
    raise exception 'STOCK_RESULTING_QUANTITY_CONFLICT' using errcode = '40001';
  end if;

  insert into public.stock_movements (
    id,
    business_id,
    product_id,
    movement_type,
    quantity,
    note,
    movement_date,
    previous_quantity,
    resulting_quantity,
    is_legacy,
    created_at,
    updated_at,
    version
  ) values (
    p_movement_id,
    p_business_id,
    p_product_id,
    p_type,
    p_quantity,
    coalesce(p_note, ''),
    p_occurred_at,
    p_previous_quantity,
    v_resulting_quantity,
    false,
    p_client_created_at,
    p_client_created_at,
    1
  );

  update public.products
  set current_quantity = v_resulting_quantity,
      version = version + 1
  where business_id = p_business_id
    and id = p_product_id
  returning version into v_product_version;

  update public.sync_operations
  set applied_version = v_product_version
  where business_id = p_business_id
    and idempotency_key = p_idempotency_key;

  return query select
    p_movement_id,
    p_product_id,
    p_previous_quantity,
    v_resulting_quantity,
    v_product_version,
    v_product_version,
    'applied'::text,
    false;
end;
$$;

revoke all on function public.register_stock_movement(
  uuid, text, uuid, uuid, text, bigint, text, timestamptz, bigint, bigint, timestamptz
) from public, anon;

grant execute on function public.register_stock_movement(
  uuid, text, uuid, uuid, text, bigint, text, timestamptz, bigint, bigint, timestamptz
) to authenticated;
