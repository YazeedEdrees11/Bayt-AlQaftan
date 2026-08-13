-- =============================================================================
-- بيت القفطان (Bayt Al-Qaftan) — Phase 2
-- Catalog (categories, products, variants, images), suppliers, inventory ledger
-- Migration 0002
--
-- Paste into the Supabase SQL Editor and run once. Idempotent.
-- Requires 0001_auth_foundation.sql (reuses set_updated_at() and
-- current_user_role()).
--
-- Core model:
--   products ──< product_variants ──< inventory_transactions
--                       │
--                       └── the sellable unit; stock lives here
--
-- Stock is NEVER a mutable column. It is derived from the append-only
-- inventory_transactions ledger via the variant_stock view.
-- =============================================================================

-- =============================================================================
-- 1. HELPERS
-- =============================================================================

-- Catalog writes are limited to ADMIN and MANAGER. SECURITY DEFINER + empty
-- search_path for the same reasons as the helpers in 0001.
create or replace function public.can_manage_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false);
$$;

revoke all on function public.can_manage_catalog() from public;
grant execute on function public.can_manage_catalog() to authenticated, service_role;

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text        null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categories is 'Product categories (ثوب, قفطان, بشت, ...). Data-driven, never hardcoded in the app.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_name_check') then
    alter table public.categories add constraint categories_name_check
      check (char_length(btrim(name)) between 1 and 120);
  end if;
end $$;

create unique index if not exists categories_name_key on public.categories (lower(btrim(name)));
create index if not exists categories_is_active_idx on public.categories (is_active);

-- ---------------------------------------------------------------------------
-- 2.2 suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  phone      text        null,
  whatsapp   text        null,
  email      text        null,
  address    text        null,
  notes      text        null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.suppliers is 'Sources of goods. Soft-deleted via is_active so future purchase history keeps resolving.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_name_check') then
    alter table public.suppliers add constraint suppliers_name_check
      check (char_length(btrim(name)) between 2 and 160);
  end if;
end $$;

create index if not exists suppliers_name_idx      on public.suppliers (lower(name));
create index if not exists suppliers_is_active_idx on public.suppliers (is_active);

-- ---------------------------------------------------------------------------
-- 2.3 products  (the template / model)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                  uuid           primary key default gen_random_uuid(),
  name                text           not null,
  description         text           null,
  category_id         uuid           not null references public.categories (id) on delete restrict,
  brand               text           null,
  base_selling_price  numeric(12,2)  null,
  is_active           boolean        not null default true,
  created_at          timestamptz    not null default now(),
  updated_at          timestamptz    not null default now()
);

comment on table public.products is 'Product template (e.g. "ثوب كلاسيك"). Not sellable on its own — see product_variants.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_name_check') then
    alter table public.products add constraint products_name_check
      check (char_length(btrim(name)) between 2 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_base_price_check') then
    alter table public.products add constraint products_base_price_check
      check (base_selling_price is null or base_selling_price >= 0);
  end if;
end $$;

create index if not exists products_name_idx        on public.products (lower(name));
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_is_active_idx   on public.products (is_active);
create index if not exists products_brand_idx       on public.products (lower(brand));
create index if not exists products_created_at_idx  on public.products (created_at desc);

-- ---------------------------------------------------------------------------
-- 2.4 product_variants  (the sellable unit — inventory lives here)
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id             uuid           primary key default gen_random_uuid(),
  product_id     uuid           not null references public.products (id)  on delete cascade,
  supplier_id    uuid           null     references public.suppliers (id) on delete set null,
  sku            text           not null,
  barcode        text           null,
  color          text           null,
  size           text           null,
  purchase_price numeric(12,2)  not null default 0,
  selling_price  numeric(12,2)  not null default 0,
  is_active      boolean        not null default true,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);

comment on table public.product_variants is 'A concrete sellable variation (colour + size). Stock is derived from inventory_transactions.';
comment on column public.product_variants.supplier_id is 'Default/typical supplier — informational only. Future purchases store their own supplier on the purchase record.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_sku_check') then
    alter table public.product_variants add constraint product_variants_sku_check
      check (char_length(btrim(sku)) between 1 and 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_variants_prices_check') then
    alter table public.product_variants add constraint product_variants_prices_check
      check (purchase_price >= 0 and selling_price >= 0);
  end if;
end $$;

-- SKU is unique case-insensitively; barcode is unique only when provided.
create unique index if not exists product_variants_sku_key
  on public.product_variants (upper(btrim(sku)));
create unique index if not exists product_variants_barcode_key
  on public.product_variants (btrim(barcode))
  where barcode is not null and btrim(barcode) <> '';

create index if not exists product_variants_product_id_idx  on public.product_variants (product_id);
create index if not exists product_variants_supplier_id_idx on public.product_variants (supplier_id);
create index if not exists product_variants_is_active_idx   on public.product_variants (is_active);

-- ---------------------------------------------------------------------------
-- 2.5 product_images  (metadata only — bytes live in Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.product_images (
  id           uuid        primary key default gen_random_uuid(),
  product_id   uuid        not null references public.products (id)         on delete cascade,
  variant_id   uuid        null     references public.product_variants (id) on delete set null,
  storage_path text        not null,
  public_url   text        null,
  alt_text     text        null,
  is_primary   boolean     not null default false,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);

comment on table public.product_images is 'Image metadata. Bytes live in the private product-images bucket; the app serves signed URLs.';
comment on column public.product_images.public_url is 'Only populated if the bucket is ever made public. Null while the bucket is private.';

create unique index if not exists product_images_storage_path_key on public.product_images (storage_path);
create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists product_images_variant_id_idx on public.product_images (variant_id);
create index if not exists product_images_sort_idx       on public.product_images (product_id, sort_order);

-- At most one primary image per product.
create unique index if not exists product_images_one_primary_per_product
  on public.product_images (product_id) where is_primary;

-- ---------------------------------------------------------------------------
-- 2.6 inventory_transactions  (append-only stock ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_transactions (
  id               uuid        primary key default gen_random_uuid(),
  variant_id       uuid        not null references public.product_variants (id) on delete cascade,
  transaction_type text        not null,
  quantity         integer     not null,
  reference_type   text        null,
  reference_id     uuid        null,
  notes            text        null,
  created_by       uuid        null references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  -- Direction is derived from the type, so an ADJUSTMENT_OUT can never be
  -- recorded as an increase. Generated + stored so it can be summed cheaply.
  signed_quantity  integer generated always as (
    case
      when transaction_type in ('PURCHASE', 'RETURN', 'ADJUSTMENT_IN', 'INITIAL_STOCK')
      then quantity
      else -quantity
    end
  ) stored
);

comment on table public.inventory_transactions is 'Append-only stock ledger. The single source of truth for inventory.';
comment on column public.inventory_transactions.quantity is 'Always positive. Direction comes from transaction_type via signed_quantity.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_transactions_type_check') then
    alter table public.inventory_transactions add constraint inventory_transactions_type_check
      check (transaction_type in (
        'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'INITIAL_STOCK'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_transactions_quantity_check') then
    alter table public.inventory_transactions add constraint inventory_transactions_quantity_check
      check (quantity > 0);
  end if;
end $$;

create index if not exists inventory_transactions_variant_id_idx  on public.inventory_transactions (variant_id);
create index if not exists inventory_transactions_created_at_idx  on public.inventory_transactions (created_at desc);
create index if not exists inventory_transactions_type_idx        on public.inventory_transactions (transaction_type);
create index if not exists inventory_transactions_reference_idx   on public.inventory_transactions (reference_type, reference_id);
create index if not exists inventory_transactions_variant_sum_idx on public.inventory_transactions (variant_id) include (signed_quantity);

-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================

-- 3.1 updated_at (reuses public.set_updated_at from 0001)
do $$
declare t text;
begin
  foreach t in array array['categories', 'suppliers', 'products', 'product_variants'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3.2 Stock may never go negative (RULE 9)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_non_negative_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current    integer;
  v_direction  integer;
begin
  v_direction := case
    when new.transaction_type in ('PURCHASE', 'RETURN', 'ADJUSTMENT_IN', 'INITIAL_STOCK')
    then 1 else -1
  end;

  if v_direction > 0 then
    return new;   -- increases can never drive the balance below zero
  end if;

  -- Lock the variant row so two concurrent withdrawals cannot both pass.
  perform 1 from public.product_variants where id = new.variant_id for update;

  select coalesce(sum(t.signed_quantity), 0)
    into v_current
    from public.inventory_transactions t
   where t.variant_id = new.variant_id;

  if v_current - new.quantity < 0 then
    raise exception 'insufficient_stock: current %, requested %', v_current, new.quantity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_transactions_no_negative_stock on public.inventory_transactions;
create trigger inventory_transactions_no_negative_stock
  before insert on public.inventory_transactions
  for each row
  execute function public.enforce_non_negative_stock();

-- ---------------------------------------------------------------------------
-- 3.3 The ledger is append-only
-- ---------------------------------------------------------------------------
create or replace function public.prevent_inventory_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'inventory_transactions is append-only; record a correcting adjustment instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists inventory_transactions_immutable on public.inventory_transactions;
create trigger inventory_transactions_immutable
  before update on public.inventory_transactions
  for each row
  execute function public.prevent_inventory_mutation();

-- ---------------------------------------------------------------------------
-- 3.4 Products/variants with stock history cannot be hard-deleted (RULE 8)
-- ---------------------------------------------------------------------------
create or replace function public.prevent_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if tg_table_name = 'products' then
    select count(*) into v_count
      from public.inventory_transactions t
      join public.product_variants v on v.id = t.variant_id
     where v.product_id = old.id;
  else
    select count(*) into v_count
      from public.inventory_transactions t
     where t.variant_id = old.id;
  end if;

  if v_count > 0 then
    raise exception 'has_inventory_history: deactivate instead of deleting (% transactions)', v_count
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists products_prevent_delete_with_history on public.products;
create trigger products_prevent_delete_with_history
  before delete on public.products
  for each row execute function public.prevent_delete_with_history();

drop trigger if exists variants_prevent_delete_with_history on public.product_variants;
create trigger variants_prevent_delete_with_history
  before delete on public.product_variants
  for each row execute function public.prevent_delete_with_history();

-- ---------------------------------------------------------------------------
-- 3.5 Keep the primary-image flag coherent
-- ---------------------------------------------------------------------------
create or replace function public.sync_primary_product_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_primary then
    update public.product_images
       set is_primary = false
     where product_id = new.product_id
       and id <> new.id
       and is_primary;
  end if;
  return new;
end;
$$;

-- BEFORE, not AFTER: the partial unique index below rejects a second primary
-- row the moment it is written, so the previous primary has to be cleared
-- first. The nested UPDATE sets is_primary = false, so its own WHEN clause is
-- false and this cannot recurse.
drop trigger if exists product_images_sync_primary on public.product_images;
create trigger product_images_sync_primary
  before insert or update of is_primary on public.product_images
  for each row when (new.is_primary)
  execute function public.sync_primary_product_image();

-- The first image of a product becomes its primary automatically.
create or replace function public.default_primary_product_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.product_images where product_id = new.product_id) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists product_images_default_primary on public.product_images;
create trigger product_images_default_primary
  before insert on public.product_images
  for each row execute function public.default_primary_product_image();

-- =============================================================================
-- 4. DERIVED VIEWS
--
-- security_invoker = on so RLS on the base tables still applies to whoever
-- queries the view.
-- =============================================================================

create or replace view public.variant_stock
with (security_invoker = on) as
select
  v.id          as variant_id,
  v.product_id  as product_id,
  coalesce(sum(t.signed_quantity), 0)::integer as current_stock
from public.product_variants v
left join public.inventory_transactions t on t.variant_id = v.id
group by v.id, v.product_id;

comment on view public.variant_stock is 'Authoritative current stock per variant, derived from the ledger.';

create or replace view public.product_overview
with (security_invoker = on) as
select
  p.id as product_id,
  count(v.id)::integer                                            as variants_count,
  coalesce(sum(vs.current_stock), 0)::integer                     as total_stock,
  min(v.selling_price) filter (where v.is_active)                 as min_selling_price,
  coalesce(sum(vs.current_stock * v.purchase_price), 0)::numeric  as stock_value
from public.products p
left join public.product_variants v on v.product_id = p.id
left join public.variant_stock vs   on vs.variant_id = v.id
group by p.id;

comment on view public.product_overview is 'Per-product rollup: variant count, total stock, entry price, stock value.';

grant select on public.variant_stock, public.product_overview to authenticated;

-- =============================================================================
-- 5. SEARCH / REPORTING FUNCTIONS
--
-- Filtering, sorting and pagination happen in the database — the browser never
-- receives more than one page of rows. SECURITY INVOKER (the default), so RLS
-- still governs every row these return.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 Product list
-- ---------------------------------------------------------------------------
drop function if exists public.search_products(text, uuid, text, text, text, numeric, numeric, text, integer, integer, integer);
create or replace function public.search_products(
  p_search       text    default null,
  p_category_id  uuid    default null,
  p_brand        text    default null,
  p_status       text    default 'ALL',      -- ALL | ACTIVE | INACTIVE
  p_stock_status text    default 'ALL',      -- ALL | IN_STOCK | LOW_STOCK | OUT_OF_STOCK
  p_min_price    numeric default null,
  p_max_price    numeric default null,
  p_sort         text    default 'created_desc',
  p_low_stock_threshold integer default 5,
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  id                 uuid,
  name               text,
  description        text,
  brand              text,
  base_selling_price numeric,
  is_active          boolean,
  created_at         timestamptz,
  category_id        uuid,
  category_name      text,
  variants_count     integer,
  total_stock        integer,
  min_selling_price  numeric,
  stock_value        numeric,
  primary_image_path text,
  total_count        bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      p.id, p.name, p.description, p.brand, p.base_selling_price,
      p.is_active, p.created_at, p.category_id,
      c.name as category_name,
      coalesce(o.variants_count, 0) as variants_count,
      coalesce(o.total_stock, 0)    as total_stock,
      o.min_selling_price,
      coalesce(o.stock_value, 0)    as stock_value,
      (
        select i.storage_path from public.product_images i
        where i.product_id = p.id
        order by i.is_primary desc, i.sort_order, i.created_at
        limit 1
      ) as primary_image_path
    from public.products p
    join public.categories c      on c.id = p.category_id
    left join public.product_overview o on o.product_id = p.id
    where
      (p_category_id is null or p.category_id = p_category_id)
      and (p_brand is null or btrim(p_brand) = '' or lower(p.brand) = lower(btrim(p_brand)))
      and (p_status = 'ALL' or (p_status = 'ACTIVE' and p.is_active) or (p_status = 'INACTIVE' and not p.is_active))
      and (
        p_search is null or btrim(p_search) = ''
        or p.name ilike '%' || btrim(p_search) || '%'
        or coalesce(p.brand, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.product_variants v
          where v.product_id = p.id
            and (v.sku ilike '%' || btrim(p_search) || '%'
              or coalesce(v.barcode, '') ilike '%' || btrim(p_search) || '%')
        )
      )
      and (
        p_stock_status = 'ALL'
        or (p_stock_status = 'OUT_OF_STOCK' and coalesce(o.total_stock, 0) = 0)
        or (p_stock_status = 'LOW_STOCK'    and coalesce(o.total_stock, 0) > 0
                                           and coalesce(o.total_stock, 0) <= p_low_stock_threshold)
        or (p_stock_status = 'IN_STOCK'     and coalesce(o.total_stock, 0) > p_low_stock_threshold)
      )
      and (p_min_price is null or coalesce(o.min_selling_price, p.base_selling_price, 0) >= p_min_price)
      and (p_max_price is null or coalesce(o.min_selling_price, p.base_selling_price, 0) <= p_max_price)
  )
  select
    f.*,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'name_asc'    then f.name end asc,
    case when p_sort = 'name_desc'   then f.name end desc,
    case when p_sort = 'stock_asc'   then f.total_stock end asc,
    case when p_sort = 'stock_desc'  then f.total_stock end desc,
    case when p_sort = 'price_asc'   then f.min_selling_price end asc,
    case when p_sort = 'price_desc'  then f.min_selling_price end desc,
    case when p_sort = 'created_asc' then f.created_at end asc,
    f.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 5.2 Inventory list (variant level)
-- ---------------------------------------------------------------------------
drop function if exists public.search_inventory(text, uuid, uuid, text, text, text, integer, integer, integer);
create or replace function public.search_inventory(
  p_search       text    default null,
  p_category_id  uuid    default null,
  p_supplier_id  uuid    default null,
  p_color        text    default null,
  p_size         text    default null,
  p_stock_status text    default 'ALL',
  p_low_stock_threshold integer default 5,
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  variant_id         uuid,
  product_id         uuid,
  product_name       text,
  category_name      text,
  sku                text,
  barcode            text,
  color              text,
  size               text,
  supplier_id        uuid,
  supplier_name      text,
  purchase_price     numeric,
  selling_price      numeric,
  current_stock      integer,
  is_active          boolean,
  primary_image_path text,
  total_count        bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      v.id as variant_id, p.id as product_id, p.name as product_name,
      c.name as category_name, v.sku, v.barcode, v.color, v.size,
      v.supplier_id, s.name as supplier_name,
      v.purchase_price, v.selling_price,
      coalesce(vs.current_stock, 0) as current_stock,
      v.is_active,
      (
        select i.storage_path from public.product_images i
        where i.product_id = p.id
        order by (i.variant_id = v.id) desc, i.is_primary desc, i.sort_order
        limit 1
      ) as primary_image_path
    from public.product_variants v
    join public.products p            on p.id = v.product_id
    join public.categories c          on c.id = p.category_id
    left join public.suppliers s      on s.id = v.supplier_id
    left join public.variant_stock vs on vs.variant_id = v.id
    where
      (p_category_id is null or p.category_id = p_category_id)
      and (p_supplier_id is null or v.supplier_id = p_supplier_id)
      and (p_color is null or btrim(p_color) = '' or lower(v.color) = lower(btrim(p_color)))
      and (p_size  is null or btrim(p_size)  = '' or lower(v.size)  = lower(btrim(p_size)))
      and (
        p_search is null or btrim(p_search) = ''
        or p.name ilike '%' || btrim(p_search) || '%'
        or v.sku ilike '%' || btrim(p_search) || '%'
        or coalesce(v.barcode, '') ilike '%' || btrim(p_search) || '%'
      )
      and (
        p_stock_status = 'ALL'
        or (p_stock_status = 'OUT_OF_STOCK' and coalesce(vs.current_stock, 0) = 0)
        or (p_stock_status = 'LOW_STOCK'    and coalesce(vs.current_stock, 0) > 0
                                           and coalesce(vs.current_stock, 0) <= p_low_stock_threshold)
        or (p_stock_status = 'IN_STOCK'     and coalesce(vs.current_stock, 0) > p_low_stock_threshold)
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.current_stock asc, f.product_name asc, f.sku asc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 5.3 Inventory KPI summary
-- ---------------------------------------------------------------------------
drop function if exists public.inventory_summary(integer);
create or replace function public.inventory_summary(p_low_stock_threshold integer default 5)
returns table (
  total_products  integer,
  total_variants  integer,
  total_units     integer,
  stock_value     numeric,
  low_stock_count integer,
  out_of_stock_count integer
)
language sql
stable
set search_path = public
as $$
  with v as (
    select
      pv.id, pv.product_id, pv.purchase_price,
      coalesce(vs.current_stock, 0) as current_stock
    from public.product_variants pv
    left join public.variant_stock vs on vs.variant_id = pv.id
  )
  select
    (select count(*) from public.products)::integer,
    (select count(*) from v)::integer,
    coalesce(sum(v.current_stock), 0)::integer,
    coalesce(sum(v.current_stock * v.purchase_price), 0)::numeric,
    count(*) filter (where v.current_stock > 0 and v.current_stock <= p_low_stock_threshold)::integer,
    count(*) filter (where v.current_stock = 0)::integer
  from v;
$$;

-- ---------------------------------------------------------------------------
-- 5.4 Transactional writers
--
-- A product, its variants and their opening stock must all land together or
-- not at all. PostgREST gives each call its own transaction, so the multi-step
-- writes live here instead. SECURITY INVOKER (default) keeps RLS in force.
-- ---------------------------------------------------------------------------
create or replace function public.create_product_with_variants(
  p_product  jsonb,
  p_variants jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_product_id uuid;
  v_variant    jsonb;
  v_variant_id uuid;
  v_initial    integer;
begin
  insert into public.products (name, description, category_id, brand, base_selling_price, is_active)
  values (
    p_product ->> 'name',
    nullif(p_product ->> 'description', ''),
    (p_product ->> 'category_id')::uuid,
    nullif(p_product ->> 'brand', ''),
    nullif(p_product ->> 'base_selling_price', '')::numeric,
    coalesce((p_product ->> 'is_active')::boolean, true)
  )
  returning id into v_product_id;

  for v_variant in select * from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) loop
    insert into public.product_variants (
      product_id, supplier_id, sku, barcode, color, size,
      purchase_price, selling_price, is_active
    )
    values (
      v_product_id,
      nullif(v_variant ->> 'supplier_id', '')::uuid,
      v_variant ->> 'sku',
      nullif(v_variant ->> 'barcode', ''),
      nullif(v_variant ->> 'color', ''),
      nullif(v_variant ->> 'size', ''),
      coalesce((v_variant ->> 'purchase_price')::numeric, 0),
      coalesce((v_variant ->> 'selling_price')::numeric, 0),
      coalesce((v_variant ->> 'is_active')::boolean, true)
    )
    returning id into v_variant_id;

    v_initial := coalesce((v_variant ->> 'initial_stock')::integer, 0);
    if v_initial > 0 then
      insert into public.inventory_transactions (
        variant_id, transaction_type, quantity, notes, created_by
      )
      values (
        v_variant_id, 'INITIAL_STOCK', v_initial,
        'رصيد ابتدائي عند إنشاء المنتج', auth.uid()
      );
    end if;
  end loop;

  return v_product_id;
end;
$$;

create or replace function public.create_variant_with_stock(p_variant jsonb)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_variant_id uuid;
  v_initial    integer;
begin
  insert into public.product_variants (
    product_id, supplier_id, sku, barcode, color, size,
    purchase_price, selling_price, is_active
  )
  values (
    (p_variant ->> 'product_id')::uuid,
    nullif(p_variant ->> 'supplier_id', '')::uuid,
    p_variant ->> 'sku',
    nullif(p_variant ->> 'barcode', ''),
    nullif(p_variant ->> 'color', ''),
    nullif(p_variant ->> 'size', ''),
    coalesce((p_variant ->> 'purchase_price')::numeric, 0),
    coalesce((p_variant ->> 'selling_price')::numeric, 0),
    coalesce((p_variant ->> 'is_active')::boolean, true)
  )
  returning id into v_variant_id;

  v_initial := coalesce((p_variant ->> 'initial_stock')::integer, 0);
  if v_initial > 0 then
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, notes, created_by
    )
    values (
      v_variant_id, 'INITIAL_STOCK', v_initial,
      'رصيد ابتدائي عند إنشاء الموديل', auth.uid()
    );
  end if;

  return v_variant_id;
end;
$$;

grant execute on function public.create_product_with_variants(jsonb, jsonb) to authenticated;
grant execute on function public.create_variant_with_stock(jsonb) to authenticated;

grant execute on function public.search_products(text, uuid, text, text, text, numeric, numeric, text, integer, integer, integer) to authenticated;
grant execute on function public.search_inventory(text, uuid, uuid, text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.inventory_summary(integer) to authenticated;

-- =============================================================================
-- 6. ROW LEVEL SECURITY
--
-- Read: any signed-in, active user (the shop floor needs the catalogue,
--       including the supplier name shown against each variant).
-- Write: ADMIN + MANAGER only. Hard deletes: ADMIN only.
-- =============================================================================

alter table public.categories            enable row level security;
alter table public.suppliers             enable row level security;
alter table public.products              enable row level security;
alter table public.product_variants      enable row level security;
alter table public.product_images        enable row level security;
alter table public.inventory_transactions enable row level security;

-- 6.1 categories -------------------------------------------------------------
drop policy if exists categories_select     on public.categories;
drop policy if exists categories_write      on public.categories;
drop policy if exists categories_update     on public.categories;
drop policy if exists categories_delete     on public.categories;

create policy categories_select on public.categories
  for select to authenticated using ((select public.is_active_user()));
create policy categories_write on public.categories
  for insert to authenticated with check ((select public.can_manage_catalog()));
create policy categories_update on public.categories
  for update to authenticated using ((select public.can_manage_catalog())) with check ((select public.can_manage_catalog()));
create policy categories_delete on public.categories
  for delete to authenticated using ((select public.is_admin()));

-- 6.2 suppliers --------------------------------------------------------------
drop policy if exists suppliers_select on public.suppliers;
drop policy if exists suppliers_write  on public.suppliers;
drop policy if exists suppliers_update on public.suppliers;
drop policy if exists suppliers_delete on public.suppliers;

-- Any active user may read supplier names: the inventory table shows the
-- supplier of each variant, and the shop floor can see inventory. Managing
-- suppliers (and the /suppliers screen itself) stays with ADMIN + MANAGER.
create policy suppliers_select on public.suppliers
  for select to authenticated using ((select public.is_active_user()));
create policy suppliers_write on public.suppliers
  for insert to authenticated with check ((select public.can_manage_catalog()));
create policy suppliers_update on public.suppliers
  for update to authenticated using ((select public.can_manage_catalog())) with check ((select public.can_manage_catalog()));
create policy suppliers_delete on public.suppliers
  for delete to authenticated using ((select public.is_admin()));

-- 6.3 products ---------------------------------------------------------------
drop policy if exists products_select on public.products;
drop policy if exists products_write  on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;

create policy products_select on public.products
  for select to authenticated using ((select public.is_active_user()));
create policy products_write on public.products
  for insert to authenticated with check ((select public.can_manage_catalog()));
create policy products_update on public.products
  for update to authenticated using ((select public.can_manage_catalog())) with check ((select public.can_manage_catalog()));
create policy products_delete on public.products
  for delete to authenticated using ((select public.is_admin()));

-- 6.4 product_variants -------------------------------------------------------
drop policy if exists product_variants_select on public.product_variants;
drop policy if exists product_variants_write  on public.product_variants;
drop policy if exists product_variants_update on public.product_variants;
drop policy if exists product_variants_delete on public.product_variants;

create policy product_variants_select on public.product_variants
  for select to authenticated using ((select public.is_active_user()));
create policy product_variants_write on public.product_variants
  for insert to authenticated with check ((select public.can_manage_catalog()));
create policy product_variants_update on public.product_variants
  for update to authenticated using ((select public.can_manage_catalog())) with check ((select public.can_manage_catalog()));
create policy product_variants_delete on public.product_variants
  for delete to authenticated using ((select public.is_admin()));

-- 6.5 product_images ---------------------------------------------------------
drop policy if exists product_images_select on public.product_images;
drop policy if exists product_images_write  on public.product_images;
drop policy if exists product_images_update on public.product_images;
drop policy if exists product_images_delete on public.product_images;

create policy product_images_select on public.product_images
  for select to authenticated using ((select public.is_active_user()));
create policy product_images_write on public.product_images
  for insert to authenticated with check ((select public.can_manage_catalog()));
create policy product_images_update on public.product_images
  for update to authenticated using ((select public.can_manage_catalog())) with check ((select public.can_manage_catalog()));
create policy product_images_delete on public.product_images
  for delete to authenticated using ((select public.can_manage_catalog()));

-- 6.6 inventory_transactions -------------------------------------------------
drop policy if exists inventory_transactions_select on public.inventory_transactions;
drop policy if exists inventory_transactions_write  on public.inventory_transactions;

create policy inventory_transactions_select on public.inventory_transactions
  for select to authenticated using ((select public.is_active_user()));
-- Only catalogue managers move stock, and only under their own identity.
create policy inventory_transactions_write on public.inventory_transactions
  for insert to authenticated
  with check ((select public.can_manage_catalog()) and created_by = (select auth.uid()));

-- No UPDATE/DELETE policies: the ledger is append-only.

-- =============================================================================
-- 7. GRANTS
-- =============================================================================

revoke all on public.categories, public.suppliers, public.products,
              public.product_variants, public.product_images,
              public.inventory_transactions
  from authenticated, anon;

grant select, insert, update, delete on public.categories       to authenticated;
grant select, insert, update, delete on public.suppliers        to authenticated;
grant select, insert, update, delete on public.products         to authenticated;
grant select, insert, update, delete on public.product_variants to authenticated;
grant select, insert, update, delete on public.product_images   to authenticated;
grant select, insert                 on public.inventory_transactions to authenticated;

-- =============================================================================
-- 8. STORAGE
--
-- product-images becomes PRIVATE. The app serves time-limited signed URLs, so
-- product photography is not readable by anyone holding a guessed URL.
-- =============================================================================

update storage.buckets
   set public = false,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'product-images';

do $$
begin
  drop policy if exists product_images_read   on storage.objects;
  drop policy if exists product_images_write  on storage.objects;
  drop policy if exists product_images_update on storage.objects;
  drop policy if exists product_images_delete on storage.objects;

  -- Any active signed-in user may view product photography.
  create policy product_images_read
    on storage.objects for select
    to authenticated
    using (bucket_id = 'product-images' and (select public.is_active_user()));

  -- Only ADMIN/MANAGER may upload, replace or remove it.
  create policy product_images_write
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'product-images' and (select public.can_manage_catalog()));

  create policy product_images_update
    on storage.objects for update
    to authenticated
    using (bucket_id = 'product-images' and (select public.can_manage_catalog()))
    with check (bucket_id = 'product-images' and (select public.can_manage_catalog()));

  create policy product_images_delete
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'product-images' and (select public.can_manage_catalog()));
exception
  when insufficient_privilege then
    raise notice 'Skipped storage.objects policies: insufficient privilege. Create them from the Supabase dashboard.';
  when duplicate_object then
    raise notice 'Storage policies already present.';
end;
$$;

-- =============================================================================
-- 9. SEED CATEGORIES
--
-- Starting values only — categories are data, fully editable from the UI.
-- =============================================================================

insert into public.categories (name, description)
values
  ('ثوب',        'الأثواب الرجالية بمختلف أنواعها'),
  ('قفطان',      'القفاطين والعبايات الرجالية'),
  ('بشت',        'البشوت والمشالح'),
  ('شماغ',       'الشماغ والغتر'),
  ('عقال',       'العقل بأنواعها'),
  ('إكسسوارات',  'الإكسسوارات والمستلزمات المكمّلة')
on conflict do nothing;
