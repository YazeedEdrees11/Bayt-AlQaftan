-- =============================================================================
-- بيت القفطان (Bayt Al-Qaftan) — Phase 4
-- Customers, sales, sale payments, customer balances, inventory deduction
-- Migration 0005
--
-- Paste into the Supabase SQL Editor and run once. Idempotent.
-- Requires 0001–0004.
--
--   customers ──< sales ──< sale_items ──> product_variants
--       │           │                            │
--       │           └──< sale_payments           └──> inventory_transactions
--       └──< customer_balance_transactions              SALE / SALE_REVERSAL
--
-- Same shape as purchasing, mirrored: stock and customer balance are both
-- derived from append-only ledgers, and every multi-step write happens inside
-- one SECURITY DEFINER function so it is a single transaction.
-- =============================================================================

-- =============================================================================
-- 1. INVENTORY LEDGER DIRECTIONS
--
-- SALE already subtracts. Reversing a sale and taking a customer return both
-- ADD stock back, so they have to join the "incoming" set — otherwise a
-- cancelled sale would subtract twice.
--
-- The generation expression cannot be edited in place, so the column is
-- rebuilt. The two views that read it are dropped and recreated around it.
-- =============================================================================

drop view if exists public.product_overview;
drop view if exists public.variant_stock;
drop index if exists public.inventory_transactions_variant_sum_idx;

alter table public.inventory_transactions drop column if exists signed_quantity;

alter table public.inventory_transactions
  add column signed_quantity integer generated always as (
    case
      when transaction_type in (
        'PURCHASE', 'RETURN', 'ADJUSTMENT_IN', 'INITIAL_STOCK',
        'SALE_REVERSAL', 'SALE_RETURN'
      )
      then quantity
      else -quantity
    end
  ) stored;

comment on column public.inventory_transactions.signed_quantity is
  'Derived direction. Incoming: PURCHASE, RETURN, ADJUSTMENT_IN, INITIAL_STOCK, SALE_REVERSAL, SALE_RETURN. Everything else subtracts.';

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check
  check (transaction_type in (
    'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'INITIAL_STOCK', 'PURCHASE_REVERSAL', 'PURCHASE_RETURN',
    'SALE_REVERSAL', 'SALE_RETURN'
  ));

create index if not exists inventory_transactions_variant_sum_idx
  on public.inventory_transactions (variant_id) include (signed_quantity);

create or replace view public.variant_stock
with (security_invoker = on) as
select
  v.id         as variant_id,
  v.product_id as product_id,
  coalesce(sum(t.signed_quantity), 0)::integer as current_stock
from public.product_variants v
left join public.inventory_transactions t on t.variant_id = v.id
group by v.id, v.product_id;

create or replace view public.product_overview
with (security_invoker = on) as
select
  p.id as product_id,
  count(v.id)::integer                                           as variants_count,
  coalesce(sum(vs.current_stock), 0)::integer                    as total_stock,
  min(v.selling_price) filter (where v.is_active)                as min_selling_price,
  coalesce(sum(vs.current_stock * v.purchase_price), 0)::numeric as stock_value
from public.products p
left join public.product_variants v on v.product_id = p.id
left join public.variant_stock vs   on vs.variant_id = v.id
group by p.id;

grant select on public.variant_stock, public.product_overview to authenticated;

-- =============================================================================
-- 2. SEQUENCES
-- =============================================================================

create sequence if not exists public.customer_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create sequence if not exists public.sale_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create or replace function public.next_customer_number()
returns text language sql volatile set search_path = '' as $$
  select 'CUS-' || lpad(nextval('public.customer_number_seq')::text, 6, '0');
$$;

create or replace function public.next_sale_number()
returns text language sql volatile set search_path = '' as $$
  select 'SAL-' || lpad(nextval('public.sale_number_seq')::text, 6, '0');
$$;

-- =============================================================================
-- 3. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id              uuid        primary key default gen_random_uuid(),
  customer_number text        not null default public.next_customer_number(),
  name            text        not null,
  phone           text        null,
  whatsapp        text        null,
  email           text        null,
  address         text        null,
  notes           text        null,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.customers is 'Named customers. Walk-in sales carry customer_id = NULL and never create a row here.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customers_name_check') then
    alter table public.customers add constraint customers_name_check
      check (char_length(btrim(name)) between 2 and 160);
  end if;
end $$;

create unique index if not exists customers_number_key   on public.customers (customer_number);
create index if not exists customers_name_idx            on public.customers (lower(name));
create index if not exists customers_phone_idx           on public.customers (phone);
create index if not exists customers_whatsapp_idx        on public.customers (whatsapp);
create index if not exists customers_is_active_idx       on public.customers (is_active);

-- ---------------------------------------------------------------------------
-- 3.2 sales
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id               uuid          primary key default gen_random_uuid(),
  sale_number      text          not null default public.next_sale_number(),
  customer_id      uuid          null references public.customers (id) on delete restrict,
  sale_date        date          not null default current_date,
  subtotal         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  total_amount     numeric(12,2) not null default 0,
  total_cost       numeric(12,2) not null default 0,
  paid_amount      numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null default 0,
  payment_status   text          not null default 'UNPAID',
  status           text          not null default 'COMPLETED',
  notes            text          null,
  cancelled_at     timestamptz   null,
  cancelled_by     uuid          null references auth.users (id) on delete set null,
  cancel_reason    text          null,
  created_by       uuid          null references auth.users (id) on delete set null,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

comment on table public.sales is 'A sale. customer_id NULL means a walk-in. total_cost is the summed item cost, so profit needs no recomputation from live prices.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_status_check') then
    alter table public.sales add constraint sales_status_check
      check (status in ('DRAFT', 'COMPLETED', 'CANCELLED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_payment_status_check') then
    alter table public.sales add constraint sales_payment_status_check
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_amounts_check') then
    alter table public.sales add constraint sales_amounts_check
      check (
        subtotal >= 0 and discount >= 0 and discount <= subtotal
        and total_amount >= 0 and total_cost >= 0
        and paid_amount >= 0 and paid_amount <= total_amount
        and remaining_amount >= 0
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_draft_unpaid_check') then
    alter table public.sales add constraint sales_draft_unpaid_check
      check (status <> 'DRAFT' or (paid_amount = 0 and payment_status = 'UNPAID'));
  end if;
end $$;

create unique index if not exists sales_number_key      on public.sales (sale_number);
create index if not exists sales_customer_id_idx        on public.sales (customer_id);
create index if not exists sales_sale_date_idx          on public.sales (sale_date desc);
create index if not exists sales_payment_status_idx     on public.sales (payment_status);
create index if not exists sales_status_idx             on public.sales (status);
create index if not exists sales_created_at_idx         on public.sales (created_at desc);

-- ---------------------------------------------------------------------------
-- 3.3 sale_items
--
-- unit_cost is captured at sale time. Later purchases change the variant's
-- cost but must never rewrite the profit of a sale that already happened.
-- ---------------------------------------------------------------------------
create table if not exists public.sale_items (
  id                    uuid          primary key default gen_random_uuid(),
  sale_id               uuid          not null references public.sales (id)            on delete cascade,
  variant_id            uuid          not null references public.product_variants (id) on delete restrict,
  quantity              integer       not null,
  unit_price            numeric(12,2) not null,
  unit_cost             numeric(12,2) not null,
  total_price           numeric(12,2) not null,
  total_cost            numeric(12,2) not null,
  product_name_snapshot text          not null,
  variant_sku_snapshot  text          not null,
  color_snapshot        text          null,
  size_snapshot         text          null,
  created_at            timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sale_items_quantity_check') then
    alter table public.sale_items add constraint sale_items_quantity_check check (quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_items_money_check') then
    alter table public.sale_items add constraint sale_items_money_check
      check (unit_price >= 0 and unit_cost >= 0 and total_price >= 0 and total_cost >= 0);
  end if;
  -- One row per variant per sale: quantities are merged, never duplicated.
  if not exists (select 1 from pg_constraint where conname = 'sale_items_unique_variant') then
    alter table public.sale_items add constraint sale_items_unique_variant
      unique (sale_id, variant_id);
  end if;
end $$;

create index if not exists sale_items_sale_id_idx    on public.sale_items (sale_id);
create index if not exists sale_items_variant_id_idx on public.sale_items (variant_id);

-- ---------------------------------------------------------------------------
-- 3.4 sale_payments
-- ---------------------------------------------------------------------------
create table if not exists public.sale_payments (
  id                 uuid          primary key default gen_random_uuid(),
  sale_id            uuid          not null references public.sales (id) on delete cascade,
  payment_method     text          not null,
  amount             numeric(12,2) not null,
  payment_date       date          not null default current_date,
  bank_name          text          null,
  transfer_reference text          null,
  receipt_image_path text          null,
  notes              text          null,
  created_by         uuid          null references auth.users (id) on delete set null,
  created_at         timestamptz   not null default now()
);

comment on table public.sale_payments is 'Money received from a customer against a sale. Cash and bank transfer only.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sale_payments_method_check') then
    alter table public.sale_payments add constraint sale_payments_method_check
      check (payment_method in ('CASH', 'BANK_TRANSFER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_payments_amount_check') then
    alter table public.sale_payments add constraint sale_payments_amount_check check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_payments_bank_fields_check') then
    alter table public.sale_payments add constraint sale_payments_bank_fields_check
      check (
        payment_method <> 'BANK_TRANSFER'
        or (
          bank_name is not null and btrim(bank_name) <> ''
          and transfer_reference is not null and btrim(transfer_reference) <> ''
        )
      );
  end if;
end $$;

create index if not exists sale_payments_sale_id_idx      on public.sale_payments (sale_id);
create index if not exists sale_payments_payment_date_idx on public.sale_payments (payment_date desc);
create index if not exists sale_payments_method_idx       on public.sale_payments (payment_method);

-- ---------------------------------------------------------------------------
-- 3.5 customer_balance_transactions
--
-- Positive balance = the customer owes the shop.
-- ---------------------------------------------------------------------------
create table if not exists public.customer_balance_transactions (
  id               uuid          primary key default gen_random_uuid(),
  customer_id      uuid          not null references public.customers (id) on delete restrict,
  transaction_type text          not null,
  amount           numeric(12,2) not null,
  reference_type   text          null,
  reference_id     uuid          null,
  description      text          null,
  created_by       uuid          null references auth.users (id) on delete set null,
  created_at       timestamptz   not null default now(),

  signed_amount    numeric(12,2) generated always as (
    case transaction_type
      when 'SALE'        then amount
      when 'PAYMENT'     then -amount
      when 'SALE_RETURN' then -amount
      else amount
    end
  ) stored
);

comment on table public.customer_balance_transactions is 'Append-only customer account ledger. Positive balance = owed by the customer.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'customer_balance_type_check') then
    alter table public.customer_balance_transactions add constraint customer_balance_type_check
      check (transaction_type in ('SALE', 'PAYMENT', 'SALE_RETURN', 'ADJUSTMENT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_balance_amount_check') then
    alter table public.customer_balance_transactions add constraint customer_balance_amount_check
      check (
        (transaction_type = 'ADJUSTMENT' and amount <> 0)
        or (transaction_type <> 'ADJUSTMENT' and amount > 0)
      );
  end if;
end $$;

create index if not exists customer_balance_customer_id_idx on public.customer_balance_transactions (customer_id);
create index if not exists customer_balance_created_at_idx  on public.customer_balance_transactions (created_at desc);
create index if not exists customer_balance_reference_idx   on public.customer_balance_transactions (reference_type, reference_id);

-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['customers', 'sales'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

create or replace function public.prevent_customer_balance_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'customer_balance_transactions is append-only; post a correcting entry instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists customer_balance_immutable on public.customer_balance_transactions;
create trigger customer_balance_immutable
  before update on public.customer_balance_transactions
  for each row execute function public.prevent_customer_balance_mutation();

-- A customer that has ever traded must be deactivated, never deleted.
create or replace function public.prevent_customer_delete_with_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  select count(*) into v_count from public.sales where customer_id = old.id;
  if v_count > 0 then
    raise exception 'customer_has_history: deactivate instead of deleting (% sales)', v_count
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists customers_prevent_delete_with_history on public.customers;
create trigger customers_prevent_delete_with_history
  before delete on public.customers
  for each row execute function public.prevent_customer_delete_with_history();

-- =============================================================================
-- 5. VIEWS
-- =============================================================================

create or replace view public.customer_balance
with (security_invoker = on) as
select
  c.id as customer_id,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'SALE'), 0)::numeric        as total_sales,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'PAYMENT'), 0)::numeric     as total_paid,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'SALE_RETURN'), 0)::numeric as total_returns,
  coalesce(sum(t.signed_amount), 0)::numeric                                            as balance
from public.customers c
left join public.customer_balance_transactions t on t.customer_id = c.id
group by c.id;

comment on view public.customer_balance is 'Per-customer totals. balance > 0 = owed to the shop.';

create or replace view public.sale_overview
with (security_invoker = on) as
select
  s.id as sale_id,
  count(i.id)::integer                     as item_count,
  coalesce(sum(i.quantity), 0)::integer    as total_quantity,
  -- Net revenue is the discounted total, so profit reflects what the customer
  -- actually paid rather than the pre-discount list value.
  (s.total_amount - s.total_cost)::numeric as gross_profit,
  case when s.total_amount > 0
    then round(((s.total_amount - s.total_cost) / s.total_amount) * 100, 2)
    else 0
  end::numeric                             as gross_margin
from public.sales s
left join public.sale_items i on i.sale_id = s.id
group by s.id, s.total_amount, s.total_cost;

-- Per-customer trading summary for the customers list.
create or replace view public.customer_overview
with (security_invoker = on) as
select
  c.id as customer_id,
  count(s.id) filter (where s.status = 'COMPLETED')::integer                          as sales_count,
  coalesce(sum(s.total_amount) filter (where s.status = 'COMPLETED'), 0)::numeric     as total_purchases,
  max(s.sale_date) filter (where s.status = 'COMPLETED')                              as last_sale_date
from public.customers c
left join public.sales s on s.customer_id = c.id
group by c.id;

grant select on public.customer_balance, public.sale_overview, public.customer_overview to authenticated;

-- =============================================================================
-- 6. SEARCH & REPORTING FUNCTIONS
-- =============================================================================

drop function if exists public.search_customers(text, text, integer, integer);
create or replace function public.search_customers(
  p_search text    default null,
  p_status text    default 'ALL',
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  id              uuid,
  customer_number text,
  name            text,
  phone           text,
  whatsapp        text,
  email           text,
  is_active       boolean,
  sales_count     integer,
  total_purchases numeric,
  last_sale_date  date,
  created_at      timestamptz,
  total_count     bigint
)
language sql stable set search_path = public as $$
  with filtered as (
    select
      c.id, c.customer_number, c.name, c.phone, c.whatsapp, c.email, c.is_active,
      coalesce(o.sales_count, 0) as sales_count,
      coalesce(o.total_purchases, 0) as total_purchases,
      o.last_sale_date, c.created_at
    from public.customers c
    left join public.customer_overview o on o.customer_id = c.id
    where
      (p_status = 'ALL' or (p_status = 'ACTIVE' and c.is_active) or (p_status = 'INACTIVE' and not c.is_active))
      and (
        p_search is null or btrim(p_search) = ''
        or c.name ilike '%' || btrim(p_search) || '%'
        or c.customer_number ilike '%' || btrim(p_search) || '%'
        or coalesce(c.phone, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(c.whatsapp, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(c.email, '') ilike '%' || btrim(p_search) || '%'
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

drop function if exists public.search_sales(text, uuid, text, text, date, date, numeric, numeric, text, uuid, integer, integer);
create or replace function public.search_sales(
  p_search         text    default null,
  p_customer_id    uuid    default null,
  p_payment_status text    default 'ALL',
  p_status         text    default 'ALL',
  p_date_from      date    default null,
  p_date_to        date    default null,
  p_min_amount     numeric default null,
  p_max_amount     numeric default null,
  p_payment_method text    default 'ALL',
  p_category_id    uuid    default null,
  p_limit          integer default 20,
  p_offset         integer default 0
)
returns table (
  id               uuid,
  sale_number      text,
  customer_id      uuid,
  customer_name    text,
  sale_date        date,
  subtotal         numeric,
  discount         numeric,
  total_amount     numeric,
  total_cost       numeric,
  paid_amount      numeric,
  remaining_amount numeric,
  payment_status   text,
  status           text,
  item_count       integer,
  total_quantity   integer,
  gross_profit     numeric,
  created_at       timestamptz,
  total_count      bigint
)
language sql stable set search_path = public as $$
  with filtered as (
    select
      s.id, s.sale_number, s.customer_id, c.name as customer_name,
      s.sale_date, s.subtotal, s.discount, s.total_amount, s.total_cost,
      s.paid_amount, s.remaining_amount, s.payment_status, s.status,
      coalesce(o.item_count, 0)     as item_count,
      coalesce(o.total_quantity, 0) as total_quantity,
      coalesce(o.gross_profit, 0)   as gross_profit,
      s.created_at
    from public.sales s
    left join public.customers c     on c.id = s.customer_id
    left join public.sale_overview o on o.sale_id = s.id
    where
      (p_customer_id is null or s.customer_id = p_customer_id)
      and (p_payment_status = 'ALL' or s.payment_status = p_payment_status)
      and (p_status = 'ALL' or s.status = p_status)
      and (p_date_from is null or s.sale_date >= p_date_from)
      and (p_date_to   is null or s.sale_date <= p_date_to)
      and (p_min_amount is null or s.total_amount >= p_min_amount)
      and (p_max_amount is null or s.total_amount <= p_max_amount)
      and (
        p_payment_method = 'ALL'
        or exists (select 1 from public.sale_payments sp
                   where sp.sale_id = s.id and sp.payment_method = p_payment_method)
      )
      and (
        p_category_id is null
        or exists (
          select 1 from public.sale_items si
          join public.product_variants v on v.id = si.variant_id
          join public.products p on p.id = v.product_id
          where si.sale_id = s.id and p.category_id = p_category_id
        )
      )
      and (
        p_search is null or btrim(p_search) = ''
        or s.sale_number ilike '%' || btrim(p_search) || '%'
        or coalesce(c.name, '')  ilike '%' || btrim(p_search) || '%'
        or coalesce(c.phone, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.sale_items si
          where si.sale_id = s.id
            and (
              si.product_name_snapshot ilike '%' || btrim(p_search) || '%'
              or si.variant_sku_snapshot ilike '%' || btrim(p_search) || '%'
              or exists (select 1 from public.product_variants v
                         where v.id = si.variant_id
                           and coalesce(v.barcode, '') ilike '%' || btrim(p_search) || '%')
            )
        )
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.sale_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Dashboard figures for a date range. Cancelled sales are excluded throughout.
drop function if exists public.sales_summary(date, date);
create or replace function public.sales_summary(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  sales_count      integer,
  gross_sales      numeric,
  total_discount   numeric,
  net_sales        numeric,
  total_cost       numeric,
  gross_profit     numeric,
  gross_margin     numeric,
  units_sold       integer,
  total_paid       numeric,
  total_outstanding numeric,
  cash_collected   numeric,
  bank_collected   numeric
)
language sql stable set search_path = public as $$
  with s as (
    select * from public.sales
    where status = 'COMPLETED'
      and (p_date_from is null or sale_date >= p_date_from)
      and (p_date_to   is null or sale_date <= p_date_to)
  ),
  pay as (
    select sp.payment_method, sp.amount
    from public.sale_payments sp
    join s on s.id = sp.sale_id
  )
  select
    (select count(*) from s)::integer,
    coalesce((select sum(subtotal) from s), 0)::numeric,
    coalesce((select sum(discount) from s), 0)::numeric,
    coalesce((select sum(total_amount) from s), 0)::numeric,
    coalesce((select sum(total_cost) from s), 0)::numeric,
    coalesce((select sum(total_amount - total_cost) from s), 0)::numeric,
    case when coalesce((select sum(total_amount) from s), 0) > 0
      then round((coalesce((select sum(total_amount - total_cost) from s), 0)
                  / (select sum(total_amount) from s)) * 100, 2)
      else 0 end::numeric,
    coalesce((select sum(i.quantity) from public.sale_items i join s on s.id = i.sale_id), 0)::integer,
    coalesce((select sum(paid_amount) from s), 0)::numeric,
    coalesce((select sum(remaining_amount) from s), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'CASH'), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'BANK_TRANSFER'), 0)::numeric;
$$;

-- Reporting foundation: top products and top customers for a period.
drop function if exists public.top_selling_products(date, date, integer);
create or replace function public.top_selling_products(
  p_date_from date default null,
  p_date_to   date default null,
  p_limit     integer default 10
)
returns table (
  variant_id   uuid,
  product_name text,
  sku          text,
  units_sold   integer,
  revenue      numeric,
  profit       numeric
)
language sql stable set search_path = public as $$
  select
    i.variant_id,
    max(i.product_name_snapshot),
    max(i.variant_sku_snapshot),
    sum(i.quantity)::integer,
    sum(i.total_price)::numeric,
    sum(i.total_price - i.total_cost)::numeric
  from public.sale_items i
  join public.sales s on s.id = i.sale_id
  where s.status = 'COMPLETED'
    and (p_date_from is null or s.sale_date >= p_date_from)
    and (p_date_to   is null or s.sale_date <= p_date_to)
  group by i.variant_id
  order by sum(i.quantity) desc
  limit greatest(p_limit, 1);
$$;

drop function if exists public.top_customers(date, date, integer);
create or replace function public.top_customers(
  p_date_from date default null,
  p_date_to   date default null,
  p_limit     integer default 10
)
returns table (
  customer_id     uuid,
  customer_number text,
  name            text,
  sales_count     integer,
  total_amount    numeric
)
language sql stable set search_path = public as $$
  select c.id, c.customer_number, c.name,
         count(s.id)::integer, sum(s.total_amount)::numeric
  from public.sales s
  join public.customers c on c.id = s.customer_id
  where s.status = 'COMPLETED'
    and (p_date_from is null or s.sale_date >= p_date_from)
    and (p_date_to   is null or s.sale_date <= p_date_to)
  group by c.id, c.customer_number, c.name
  order by sum(s.total_amount) desc
  limit greatest(p_limit, 1);
$$;

drop function if exists public.customer_ledger(uuid, integer);
create or replace function public.customer_ledger(
  p_customer_id uuid,
  p_limit       integer default 200
)
returns table (
  id               uuid,
  transaction_type text,
  amount           numeric,
  signed_amount    numeric,
  reference_type   text,
  reference_id     uuid,
  description      text,
  created_at       timestamptz,
  running_balance  numeric
)
language sql stable set search_path = public as $$
  select t.id, t.transaction_type, t.amount, t.signed_amount,
         t.reference_type, t.reference_id, t.description, t.created_at,
         sum(t.signed_amount) over (
           order by t.created_at, t.id
           rows between unbounded preceding and current row
         ) as running_balance
  from public.customer_balance_transactions t
  where t.customer_id = p_customer_id
  order by t.created_at desc, t.id desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.search_customers(text, text, integer, integer) to authenticated;
grant execute on function public.search_sales(text, uuid, text, text, date, date, numeric, numeric, text, uuid, integer, integer) to authenticated;
grant execute on function public.sales_summary(date, date) to authenticated;
grant execute on function public.top_selling_products(date, date, integer) to authenticated;
grant execute on function public.top_customers(date, date, integer) to authenticated;
grant execute on function public.customer_ledger(uuid, integer) to authenticated;

-- =============================================================================
-- 7. WRITE OPERATIONS (atomic, SECURITY DEFINER)
-- =============================================================================

create or replace function public.can_sell()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER', 'STAFF'), false)
     and public.is_active_user();
$$;

create or replace function public.can_manage_sales()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false);
$$;

revoke all on function public.can_sell()         from public;
revoke all on function public.can_manage_sales() from public;
grant execute on function public.can_sell()         to authenticated, service_role;
grant execute on function public.can_manage_sales() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7.1 Shared completion: deduct stock, take payment, charge the customer
-- ---------------------------------------------------------------------------
create or replace function public.apply_sale_completion(
  p_sale_id uuid,
  p_payments jsonb,
  p_actor   uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_sale    record;
  v_item    record;
  v_stock   integer;
  v_short   text := null;
  v_payment jsonb;
  v_paid    numeric(12,2) := 0;
  v_amount  numeric(12,2);
  v_method  text;
  v_status  text;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;

  -- Validate the WHOLE basket before touching anything: a sale is never
  -- partially fulfilled. The row lock serialises concurrent sales of the same
  -- variant, which is what makes overselling impossible.
  for v_item in
    select i.variant_id, i.quantity, i.variant_sku_snapshot
      from public.sale_items i where i.sale_id = p_sale_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t where t.variant_id = v_item.variant_id;

    if v_stock < v_item.quantity then
      v_short := coalesce(v_short || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_short is not null then
    raise exception 'insufficient_stock: %', v_short using errcode = '22023';
  end if;

  for v_item in
    select i.variant_id, i.quantity from public.sale_items i where i.sale_id = p_sale_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'SALE', v_item.quantity, 'SALE', p_sale_id,
      'بيع ' || v_sale.sale_number, p_actor
    );
  end loop;

  -- A sale may be settled with several payments at once (cash + transfer).
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_payment in select * from jsonb_array_elements(p_payments) loop
      v_amount := coalesce(nullif(v_payment ->> 'amount', '')::numeric, 0);
      v_method := coalesce(v_payment ->> 'payment_method', 'CASH');
      if v_amount <= 0 then continue; end if;

      if v_method = 'BANK_TRANSFER'
         and (coalesce(btrim(v_payment ->> 'bank_name'), '') = ''
              or coalesce(btrim(v_payment ->> 'transfer_reference'), '') = '') then
        raise exception 'bank_details_required' using errcode = '22023';
      end if;

      insert into public.sale_payments (
        sale_id, payment_method, amount, payment_date,
        bank_name, transfer_reference, receipt_image_path, notes, created_by
      )
      values (
        p_sale_id, v_method, v_amount,
        coalesce(nullif(v_payment ->> 'payment_date', '')::date, current_date),
        nullif(btrim(v_payment ->> 'bank_name'), ''),
        nullif(btrim(v_payment ->> 'transfer_reference'), ''),
        nullif(btrim(v_payment ->> 'receipt_image_path'), ''),
        nullif(btrim(v_payment ->> 'notes'), ''),
        p_actor
      );

      v_paid := v_paid + v_amount;
    end loop;
  end if;

  if v_paid > v_sale.total_amount then
    raise exception 'overpayment' using errcode = '22023';
  end if;

  v_status := case
    when v_paid = 0 then 'UNPAID'
    when v_paid >= v_sale.total_amount then 'PAID'
    else 'PARTIALLY_PAID'
  end;

  update public.sales
     set status           = 'COMPLETED',
         paid_amount      = v_paid,
         remaining_amount = round(v_sale.total_amount - v_paid, 2),
         payment_status   = v_status
   where id = p_sale_id;

  -- Walk-in sales have no account to post to.
  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'SALE', v_sale.total_amount, 'SALE', p_sale_id,
            'بيع ' || v_sale.sale_number, p_actor);

    if v_paid > 0 then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_sale.customer_id, 'PAYMENT', v_paid, 'SALE', p_sale_id,
              'دفعة عند البيع ' || v_sale.sale_number, p_actor);
    end if;
  end if;

  return jsonb_build_object(
    'id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'status', 'COMPLETED',
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount,
    'total_amount', v_sale.total_amount,
    'total_cost', v_sale.total_cost,
    'gross_profit', round(v_sale.total_amount - v_sale.total_cost, 2),
    'paid_amount', v_paid,
    'remaining_amount', round(v_sale.total_amount - v_paid, 2),
    'payment_status', v_status
  );
end;
$$;

revoke all on function public.apply_sale_completion(uuid, jsonb, uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7.2 create_sale
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_customer_id uuid := nullif(p_payload ->> 'customer_id', '')::uuid;
  v_status      text := upper(coalesce(nullif(p_payload ->> 'status', ''), 'COMPLETED'));
  v_sale_id     uuid;
  v_sale_no     text;
  v_item        jsonb;
  v_variant     record;
  v_qty         integer;
  v_price       numeric(12,2);
  v_cost        numeric(12,2);
  v_subtotal    numeric(12,2) := 0;
  v_costtotal   numeric(12,2) := 0;
  v_discount    numeric(12,2) := coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0);
  v_total       numeric(12,2);
  v_count       integer := 0;
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to create sales' using errcode = '42501';
  end if;
  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id = v_customer_id and is_active;
    if not found then
      raise exception 'customer_not_found' using errcode = 'P0002';
    end if;
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  insert into public.sales (customer_id, sale_date, notes, status, created_by)
  values (
    v_customer_id,
    coalesce(nullif(p_payload ->> 'sale_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
    'DRAFT',
    v_actor
  )
  returning id, sale_number into v_sale_id, v_sale_no;

  -- Duplicate lines for the same variant are merged rather than stored twice.
  for v_item in
    select jsonb_build_object(
             'variant_id', value ->> 'variant_id',
             'quantity', sum((value ->> 'quantity')::integer),
             'unit_price', max((value ->> 'unit_price')::numeric)
           )
    from jsonb_array_elements(p_payload -> 'items')
    group by value ->> 'variant_id'
  loop
    select v.id, v.sku, v.color, v.size, v.is_active, v.selling_price, v.purchase_price,
           p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid;

    if not found then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
    if not v_variant.is_active then
      raise exception 'variant_inactive: %', v_variant.sku using errcode = 'P0002';
    end if;

    v_qty   := (v_item ->> 'quantity')::integer;
    v_price := coalesce((v_item ->> 'unit_price')::numeric, v_variant.selling_price);
    -- Cost basis is frozen here; later purchases never rewrite this sale.
    v_cost  := v_variant.purchase_price;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'invalid_unit_price' using errcode = '22023';
    end if;

    insert into public.sale_items (
      sale_id, variant_id, quantity, unit_price, unit_cost, total_price, total_cost,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot
    )
    values (
      v_sale_id, v_variant.id, v_qty, v_price, v_cost,
      round(v_qty * v_price, 2), round(v_qty * v_cost, 2),
      v_variant.product_name, v_variant.sku, v_variant.color, v_variant.size
    );

    v_subtotal  := v_subtotal + round(v_qty * v_price, 2);
    v_costtotal := v_costtotal + round(v_qty * v_cost, 2);
    v_count     := v_count + 1;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  update public.sales
     set subtotal = v_subtotal, discount = v_discount, total_amount = v_total,
         total_cost = v_costtotal, paid_amount = 0, remaining_amount = v_total,
         payment_status = 'UNPAID'
   where id = v_sale_id;

  if v_status = 'DRAFT' then
    return jsonb_build_object(
      'id', v_sale_id, 'sale_number', v_sale_no, 'status', 'DRAFT',
      'subtotal', v_subtotal, 'discount', v_discount, 'total_amount', v_total,
      'total_cost', v_costtotal,
      'gross_profit', round(v_total - v_costtotal, 2),
      'paid_amount', 0, 'remaining_amount', v_total,
      'payment_status', 'UNPAID', 'item_count', v_count
    );
  end if;

  return public.apply_sale_completion(v_sale_id, p_payload -> 'payments', v_actor)
         || jsonb_build_object('item_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.3 complete_sale (promote a draft)
-- ---------------------------------------------------------------------------
create or replace function public.complete_sale(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_sale_id uuid := (p_payload ->> 'sale_id')::uuid;
  v_status  text;
  v_count   integer;
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to complete sales' using errcode = '42501';
  end if;

  select status into v_status from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_status <> 'DRAFT' then raise exception 'sale_not_draft' using errcode = '22023'; end if;

  select count(*) into v_count from public.sale_items where sale_id = v_sale_id;
  if v_count = 0 then raise exception 'no_items' using errcode = '22023'; end if;

  return public.apply_sale_completion(v_sale_id, p_payload -> 'payments', v_actor)
         || jsonb_build_object('item_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.4 add_sale_payment — a later payment against a sale
-- ---------------------------------------------------------------------------
create or replace function public.add_sale_payment(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_sale_id  uuid := (p_payload ->> 'sale_id')::uuid;
  v_amount   numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_method   text := coalesce(p_payload ->> 'payment_method', 'CASH');
  v_sale     record;
  v_new_paid numeric(12,2);
  v_status   text;
begin
  if not public.can_manage_sales() then
    raise exception 'forbidden: insufficient permission to record customer payments'
      using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_payable' using errcode = '22023';
  end if;
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_amount > v_sale.remaining_amount then
    raise exception 'payment_exceeds_outstanding' using errcode = '22023';
  end if;
  if v_method = 'BANK_TRANSFER'
     and (coalesce(btrim(p_payload ->> 'bank_name'), '') = ''
          or coalesce(btrim(p_payload ->> 'transfer_reference'), '') = '') then
    raise exception 'bank_details_required' using errcode = '22023';
  end if;

  insert into public.sale_payments (
    sale_id, payment_method, amount, payment_date,
    bank_name, transfer_reference, receipt_image_path, notes, created_by
  )
  values (
    v_sale_id, v_method, v_amount,
    coalesce(nullif(p_payload ->> 'payment_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'bank_name'), ''),
    nullif(btrim(p_payload ->> 'transfer_reference'), ''),
    nullif(btrim(p_payload ->> 'receipt_image_path'), ''),
    nullif(btrim(p_payload ->> 'notes'), ''),
    v_actor
  );

  v_new_paid := round(v_sale.paid_amount + v_amount, 2);
  v_status := case
    when v_new_paid = 0 then 'UNPAID'
    when v_new_paid >= v_sale.total_amount then 'PAID'
    else 'PARTIALLY_PAID' end;

  update public.sales
     set paid_amount = v_new_paid,
         remaining_amount = round(v_sale.total_amount - v_new_paid, 2),
         payment_status = v_status
   where id = v_sale_id;

  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'PAYMENT', v_amount, 'SALE', v_sale_id,
            'دفعة على البيع ' || v_sale.sale_number, v_actor);
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'paid_amount', v_new_paid,
    'remaining_amount', round(v_sale.total_amount - v_new_paid, 2),
    'payment_status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.5 cancel_sale
-- ---------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale  record;
  v_item  record;
begin
  if not public.can_manage_sales() then
    raise exception 'forbidden: insufficient permission to cancel sales' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_cancellable' using errcode = '22023';
  end if;

  -- Returning goods to the shelf can never make stock invalid, so unlike a
  -- purchase cancellation there is nothing to refuse here.
  for v_item in select i.variant_id, i.quantity from public.sale_items i where i.sale_id = p_sale_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'SALE_REVERSAL', v_item.quantity, 'SALE_CANCELLATION', p_sale_id,
      'إلغاء بيع ' || v_sale.sale_number, v_actor
    );
  end loop;

  -- Reverse the charge. Payments already taken stay on the ledger, so any
  -- money the customer handed over shows as a credit until it is refunded.
  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'ADJUSTMENT', -v_sale.total_amount,
            'SALE_CANCELLATION', p_sale_id,
            'إلغاء بيع ' || v_sale.sale_number, v_actor);
  end if;

  update public.sales
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_sale_id;

  return jsonb_build_object(
    'id', p_sale_id, 'sale_number', v_sale.sale_number,
    'reversed_amount', v_sale.total_amount,
    'paid_amount', v_sale.paid_amount,
    'customer_credit', v_sale.paid_amount
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.6 delete_draft_sale
-- ---------------------------------------------------------------------------
create or replace function public.delete_draft_sale(p_sale_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_sale record;
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to delete drafts' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status <> 'DRAFT' then raise exception 'sale_not_draft' using errcode = '22023'; end if;

  perform 1 from public.inventory_transactions where reference_id = p_sale_id;
  if found then raise exception 'draft_has_side_effects' using errcode = '22023'; end if;

  delete from public.sale_items where sale_id = p_sale_id;
  delete from public.sales where id = p_sale_id;

  return jsonb_build_object('id', p_sale_id, 'sale_number', v_sale.sale_number);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.7 create_customer — atomic so the number sequence is never skipped on error
-- ---------------------------------------------------------------------------
create or replace function public.create_customer(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid; v_number text;
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to create customers' using errcode = '42501';
  end if;

  insert into public.customers (name, phone, whatsapp, email, address, notes, is_active)
  values (
    btrim(p_payload ->> 'name'),
    nullif(btrim(p_payload ->> 'phone'), ''),
    nullif(btrim(p_payload ->> 'whatsapp'), ''),
    nullif(btrim(p_payload ->> 'email'), ''),
    nullif(btrim(p_payload ->> 'address'), ''),
    nullif(btrim(p_payload ->> 'notes'), ''),
    coalesce((p_payload ->> 'is_active')::boolean, true)
  )
  returning id, customer_number into v_id, v_number;

  return jsonb_build_object('id', v_id, 'customer_number', v_number);
end;
$$;

revoke all on function public.create_sale(jsonb)          from public;
revoke all on function public.complete_sale(jsonb)        from public;
revoke all on function public.add_sale_payment(jsonb)     from public;
revoke all on function public.cancel_sale(uuid, text)     from public;
revoke all on function public.delete_draft_sale(uuid)     from public;
revoke all on function public.create_customer(jsonb)      from public;

grant execute on function public.create_sale(jsonb)       to authenticated;
grant execute on function public.complete_sale(jsonb)     to authenticated;
grant execute on function public.add_sale_payment(jsonb)  to authenticated;
grant execute on function public.cancel_sale(uuid, text)  to authenticated;
grant execute on function public.delete_draft_sale(uuid)  to authenticated;
grant execute on function public.create_customer(jsonb)   to authenticated;

-- =============================================================================
-- 8. ROW LEVEL SECURITY
--
-- Customers and sales are readable by every active user — the shop floor sells.
-- Customer *balances* are ADMIN/MANAGER only. All writes go through the
-- SECURITY DEFINER functions above, which authorize first.
-- =============================================================================

alter table public.customers                    enable row level security;
alter table public.sales                        enable row level security;
alter table public.sale_items                   enable row level security;
alter table public.sale_payments                enable row level security;
alter table public.customer_balance_transactions enable row level security;

drop policy if exists customers_select on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
drop policy if exists sales_select on public.sales;
drop policy if exists sale_items_select on public.sale_items;
drop policy if exists sale_payments_select on public.sale_payments;
drop policy if exists customer_balance_select on public.customer_balance_transactions;

create policy customers_select on public.customers
  for select to authenticated using ((select public.is_active_user()));
create policy customers_update on public.customers
  for update to authenticated
  using ((select public.can_manage_sales())) with check ((select public.can_manage_sales()));
create policy customers_delete on public.customers
  for delete to authenticated using ((select public.is_admin()));

create policy sales_select on public.sales
  for select to authenticated using ((select public.is_active_user()));
create policy sale_items_select on public.sale_items
  for select to authenticated using ((select public.is_active_user()));
create policy sale_payments_select on public.sale_payments
  for select to authenticated using ((select public.is_active_user()));

-- Balances are financial data: managers and up only.
create policy customer_balance_select on public.customer_balance_transactions
  for select to authenticated using ((select public.can_manage_sales()));

revoke all on public.customers, public.sales, public.sale_items,
              public.sale_payments, public.customer_balance_transactions
  from authenticated, anon;

grant select         on public.sales                        to authenticated;
grant select         on public.sale_items                   to authenticated;
grant select         on public.sale_payments                to authenticated;
grant select         on public.customer_balance_transactions to authenticated;
grant select, update, delete on public.customers            to authenticated;

grant usage, select on sequence public.customer_number_seq to authenticated;
grant usage, select on sequence public.sale_number_seq     to authenticated;

-- =============================================================================
-- 9. STORAGE — sale payment receipts
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sale-payment-receipts', 'sale-payment-receipts', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

do $$
begin
  drop policy if exists sale_receipts_read   on storage.objects;
  drop policy if exists sale_receipts_write  on storage.objects;
  drop policy if exists sale_receipts_update on storage.objects;
  drop policy if exists sale_receipts_delete on storage.objects;

  -- Anyone who can ring up a sale can attach and view its receipt.
  create policy sale_receipts_read
    on storage.objects for select to authenticated
    using (bucket_id = 'sale-payment-receipts' and (select public.can_sell()));

  create policy sale_receipts_write
    on storage.objects for insert to authenticated
    with check (bucket_id = 'sale-payment-receipts' and (select public.can_sell()));

  -- Replacing or removing a receipt is a manager action.
  create policy sale_receipts_update
    on storage.objects for update to authenticated
    using (bucket_id = 'sale-payment-receipts' and (select public.can_manage_sales()))
    with check (bucket_id = 'sale-payment-receipts' and (select public.can_manage_sales()));

  create policy sale_receipts_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'sale-payment-receipts' and (select public.can_manage_sales()));
exception
  when insufficient_privilege then
    raise notice 'Skipped sale-payment-receipts storage policies: insufficient privilege.';
end;
$$;
