-- StockFlow - Parte 5: base PostgreSQL/Auth/RLS para sincronizacao futura.
-- Esta migration nao le, envia ou altera dados do IndexedDB.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0)
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (business_id, user_id)
);

create table public.categories (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (business_id, id)
);

create table public.products (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  code text not null default '',
  category_id uuid,
  sale_price_in_cents bigint not null check (sale_price_in_cents >= 0),
  current_quantity bigint not null check (current_quantity >= 0),
  minimum_stock bigint not null check (minimum_stock >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  unique (business_id, id),
  foreign key (business_id, category_id)
    references public.categories (business_id, id)
    on delete restrict
);

create table public.stock_movements (
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete restrict,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('entrada', 'saida')),
  quantity bigint not null check (quantity > 0),
  note text not null default '',
  movement_date timestamptz not null,
  previous_quantity bigint,
  resulting_quantity bigint,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1 check (version > 0),
  foreign key (business_id, product_id)
    references public.products (business_id, id)
    on delete restrict,
  check (
    (is_legacy and previous_quantity is null and resulting_quantity is null)
    or
    (
      not is_legacy
      and previous_quantity is not null
      and previous_quantity >= 0
      and resulting_quantity is not null
      and resulting_quantity >= 0
    )
  )
);

create index businesses_owner_id_idx on public.businesses (owner_id);
create index businesses_updated_at_idx on public.businesses (updated_at);
create index business_members_user_id_idx on public.business_members (user_id);
create index categories_business_id_idx on public.categories (business_id);
create index categories_updated_at_idx on public.categories (business_id, updated_at);
create index categories_deleted_at_idx on public.categories (business_id, deleted_at);
create index products_business_id_idx on public.products (business_id);
create index products_category_id_idx on public.products (business_id, category_id);
create index products_updated_at_idx on public.products (business_id, updated_at);
create index products_deleted_at_idx on public.products (business_id, deleted_at);
create unique index products_active_code_unique_idx
  on public.products (business_id, lower(btrim(code)))
  where deleted_at is null and btrim(code) <> '';
create index stock_movements_business_id_idx on public.stock_movements (business_id);
create index stock_movements_product_id_idx on public.stock_movements (business_id, product_id);
create index stock_movements_updated_at_idx on public.stock_movements (business_id, updated_at);
create index stock_movements_deleted_at_idx on public.stock_movements (business_id, deleted_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function private.set_updated_at();
create trigger business_members_set_updated_at
before update on public.business_members
for each row execute function private.set_updated_at();
create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();
create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();
create trigger stock_movements_set_updated_at
before update on public.stock_movements
for each row execute function private.set_updated_at();

create or replace function private.add_business_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger businesses_add_owner_membership
after insert on public.businesses
for each row execute function private.add_business_owner_membership();

create or replace function private.is_active_business_member(
  target_business_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members membership
    where membership.business_id = target_business_id
      and membership.user_id = (select auth.uid())
      and membership.deleted_at is null
  );
$$;

revoke all on function private.is_active_business_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_business_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "businesses_select_member"
on public.businesses for select
to authenticated
using (private.is_active_business_member(id));

create policy "businesses_insert_owner"
on public.businesses for insert
to authenticated
with check (owner_id = auth.uid());

create policy "businesses_update_owner"
on public.businesses for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "business_members_select_member"
on public.business_members for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_active_business_member(business_id)
);

create policy "business_members_insert_owner"
on public.business_members for insert
to authenticated
with check (
  exists (
    select 1 from public.businesses business
    where business.id = business_id and business.owner_id = auth.uid()
  )
);

create policy "business_members_update_owner"
on public.business_members for update
to authenticated
using (
  exists (
    select 1 from public.businesses business
    where business.id = business_id and business.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.businesses business
    where business.id = business_id and business.owner_id = auth.uid()
  )
);

create policy "categories_select_member"
on public.categories for select
to authenticated
using (private.is_active_business_member(business_id));
create policy "categories_insert_member"
on public.categories for insert
to authenticated
with check (private.is_active_business_member(business_id));
create policy "categories_update_member"
on public.categories for update
to authenticated
using (private.is_active_business_member(business_id))
with check (private.is_active_business_member(business_id));

create policy "products_select_member"
on public.products for select
to authenticated
using (private.is_active_business_member(business_id));
create policy "products_insert_member"
on public.products for insert
to authenticated
with check (private.is_active_business_member(business_id));
create policy "products_update_member"
on public.products for update
to authenticated
using (private.is_active_business_member(business_id))
with check (private.is_active_business_member(business_id));

create policy "stock_movements_select_member"
on public.stock_movements for select
to authenticated
using (private.is_active_business_member(business_id));
create policy "stock_movements_insert_member"
on public.stock_movements for insert
to authenticated
with check (private.is_active_business_member(business_id));
create policy "stock_movements_update_member"
on public.stock_movements for update
to authenticated
using (private.is_active_business_member(business_id))
with check (private.is_active_business_member(business_id));

-- DELETE fisico nao recebe policy: a aplicacao deve usar deleted_at para soft delete.
-- A Parte 6 definira o protocolo de sincronizacao; esta migration nao transfere dados.
