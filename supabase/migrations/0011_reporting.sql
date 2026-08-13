-- بيت القفطان (Bayt Al-Qaftan) — Phase 7
-- Reporting, analytics and the daily closing.
--
-- Depends on 0001–0010. Idempotent: safe to re-run.
--
-- PRINCIPLE
--
-- Reports read the existing records; they do not copy them. There is no
-- reporting table shadowing sales or inventory, and no second definition of a
-- KPI. Where Phase 6 already defined a figure — net sales, COGS, gross profit,
-- operating profit — the reports here reuse the same arithmetic so two screens
-- can never disagree about what the shop earned (§75).
--
-- Two small tables are genuinely new, because the data does not exist anywhere
-- yet: the record of a counted till (`cash_closings`), and the thresholds the
-- alerts compare against (`report_settings`), which §59 requires be
-- configurable rather than baked into queries.
-- =============================================================================

-- =============================================================================
-- 1. MINIMUM STOCK
-- =============================================================================
-- §16 says to use the existing per-variant configuration and §110 says not to
-- duplicate thresholds — but no per-variant threshold existed. Phase 2 had a
-- single global constant (5) used by the inventory screens. Adding the column
-- here creates the single source those sections assume, defaulted to the old
-- global so nothing changes meaning on the day it lands.

alter table public.product_variants
  add column if not exists minimum_stock integer not null default 5;

alter table public.product_variants drop constraint if exists product_variants_minimum_stock_check;
alter table public.product_variants add constraint product_variants_minimum_stock_check
  check (minimum_stock >= 0);

comment on column public.product_variants.minimum_stock is
  'Reorder point for this variant. The single source for low-stock reporting; defaults to the global 5 that preceded it.';

create index if not exists product_variants_minimum_stock_idx
  on public.product_variants (minimum_stock);

-- =============================================================================
-- 2. REPORT SETTINGS
-- =============================================================================
-- One row. Thresholds live here rather than inside queries so the owner can
-- change what counts as "high debt" without a migration (§59, §106–§109).

create table if not exists public.report_settings (
  id                       boolean       primary key default true,
  dead_stock_days          integer       not null default 90,
  high_return_rate_percent numeric(5,2)  not null default 20,
  customer_debt_threshold  numeric(12,2) not null default 500,
  supplier_debt_threshold  numeric(12,2) not null default 1000,
  expense_growth_percent   numeric(5,2)  not null default 25,
  updated_at               timestamptz   not null default now(),

  -- Exactly one row, enforced rather than assumed.
  constraint report_settings_singleton check (id)
);

alter table public.report_settings drop constraint if exists report_settings_ranges_check;
alter table public.report_settings add constraint report_settings_ranges_check
  check (
    dead_stock_days > 0
    and high_return_rate_percent >= 0 and high_return_rate_percent <= 100
    and customer_debt_threshold >= 0
    and supplier_debt_threshold >= 0
    and expense_growth_percent >= 0
  );

insert into public.report_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists report_settings_set_updated_at on public.report_settings;
create trigger report_settings_set_updated_at
  before update on public.report_settings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. CASH CLOSINGS
-- =============================================================================

create sequence if not exists public.closing_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create or replace function public.next_closing_number()
returns text language sql volatile set search_path = '' as $$
  select 'CLS-' || lpad(nextval('public.closing_number_seq')::text, 6, '0');
$$;

create table if not exists public.cash_closings (
  id                   uuid          primary key default gen_random_uuid(),
  closing_number       text          not null default public.next_closing_number(),
  closing_date         date          not null default current_date,
  financial_account_id uuid          not null references public.financial_accounts (id) on delete restrict,
  expected_balance     numeric(12,2) not null,
  actual_balance       numeric(12,2) not null,
  difference           numeric(12,2) not null,
  notes                text          null,
  status               text          not null default 'CLOSED',
  closed_by            uuid          null references auth.users (id) on delete set null,
  closed_at            timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cash_closings_number_key') then
    alter table public.cash_closings add constraint cash_closings_number_key unique (closing_number);
  end if;
end $$;

alter table public.cash_closings drop constraint if exists cash_closings_status_check;
alter table public.cash_closings add constraint cash_closings_status_check
  check (status in ('CLOSED', 'REOPENED'));

-- The difference is arithmetic, not an opinion: it must equal what was counted
-- less what the ledger expected.
alter table public.cash_closings drop constraint if exists cash_closings_difference_check;
alter table public.cash_closings add constraint cash_closings_difference_check
  check (difference = actual_balance - expected_balance);

-- One closing per account per day; re-counting replaces nothing silently.
create unique index if not exists cash_closings_account_date_idx
  on public.cash_closings (financial_account_id, closing_date);
create index if not exists cash_closings_date_idx on public.cash_closings (closing_date desc);

comment on table public.cash_closings is
  'A counted till against what the ledger expected. Recording a difference does NOT move money — §45 requires an explicit adjustment for that.';

-- =============================================================================
-- 4. REPORTING INDEXES (§79)
-- =============================================================================
-- Only the ones that do not already exist; the earlier phases indexed most
-- foreign keys and dates already.

create index if not exists sales_date_status_idx        on public.sales (sale_date, status);
create index if not exists sales_customer_date_idx      on public.sales (customer_id, sale_date desc);
create index if not exists sale_items_variant_idx       on public.sale_items (variant_id);
create index if not exists sale_payments_date_idx       on public.sale_payments (payment_date desc);
create index if not exists purchases_date_status_idx    on public.purchases (purchase_date, status);
create index if not exists purchases_supplier_date_idx  on public.purchases (supplier_id, purchase_date desc);
create index if not exists purchase_items_variant_idx   on public.purchase_items (variant_id);
create index if not exists purchase_payments_date_idx   on public.purchase_payments (payment_date desc);
create index if not exists sales_returns_date_status_idx on public.sales_returns (return_date, status);
create index if not exists sales_return_items_variant_idx on public.sales_return_items (variant_id);
create index if not exists inventory_transactions_variant_date_idx
  on public.inventory_transactions (variant_id, created_at desc);
create index if not exists products_category_idx        on public.products (category_id);
create index if not exists product_variants_product_idx on public.product_variants (product_id);
create index if not exists product_variants_supplier_idx on public.product_variants (supplier_id);

-- =============================================================================
-- 5. REPORTING VIEWS
-- =============================================================================

-- Per-variant trading performance, all time. Date-bounded reporting uses the
-- RPC below; this view is what the "which products earn" screens read.
create or replace view public.product_performance
with (security_invoker = on) as
select
  v.id                                  as variant_id,
  v.product_id,
  p.name                                as product_name,
  v.sku,
  v.color,
  v.size,
  p.brand,
  p.category_id,
  c.name                                as category_name,
  v.supplier_id,
  v.purchase_price,
  v.selling_price,
  v.minimum_stock,
  coalesce(s.qty, 0)::integer           as sold_quantity,
  coalesce(r.qty, 0)::integer           as returned_quantity,
  (coalesce(s.qty, 0) - coalesce(r.qty, 0))::integer as net_quantity,
  coalesce(s.revenue, 0)::numeric       as gross_revenue,
  coalesce(r.refunded, 0)::numeric      as returned_value,
  (coalesce(s.revenue, 0) - coalesce(r.refunded, 0))::numeric as net_revenue,
  (coalesce(s.cost, 0) - coalesce(r.cost, 0))::numeric        as net_cost,
  ((coalesce(s.revenue, 0) - coalesce(r.refunded, 0))
   - (coalesce(s.cost, 0) - coalesce(r.cost, 0)))::numeric    as gross_profit,
  s.last_sale_date,
  pu.last_purchase_date
from public.product_variants v
join public.products p    on p.id = v.product_id
left join public.categories c on c.id = p.category_id
left join lateral (
  select sum(si.quantity) as qty,
         sum(si.total_price) as revenue,
         sum(si.total_cost) as cost,
         max(sa.sale_date) as last_sale_date
  from public.sale_items si
  join public.sales sa on sa.id = si.sale_id
  where si.variant_id = v.id and sa.status = 'COMPLETED'
) s on true
left join lateral (
  select sum(ri.quantity) as qty,
         sum(ri.total_amount) as refunded,
         sum(ri.total_cost) as cost
  from public.sales_return_items ri
  join public.sales_returns sr on sr.id = ri.return_id
  where ri.variant_id = v.id and sr.status <> 'CANCELLED'
) r on true
left join lateral (
  select max(pur.purchase_date) as last_purchase_date
  from public.purchase_items pi
  join public.purchases pur on pur.id = pi.purchase_id
  where pi.variant_id = v.id and pur.status = 'COMPLETED'
) pu on true;

comment on view public.product_performance is
  'Per-variant trading totals, all time. Returns are netted off both revenue and cost so profit reflects what was kept.';

-- What the shelves are worth. Cost is the variant purchase price, never the
-- selling price (§19).
create or replace view public.inventory_valuation
with (security_invoker = on) as
select
  v.id                                    as variant_id,
  v.product_id,
  p.name                                  as product_name,
  v.sku,
  v.color,
  v.size,
  p.brand,
  p.category_id,
  c.name                                  as category_name,
  v.supplier_id,
  su.name                                 as supplier_name,
  v.is_active,
  v.minimum_stock,
  vs.current_stock,
  vs.damaged_quantity,
  v.purchase_price,
  v.selling_price,
  (vs.current_stock * v.purchase_price)::numeric  as stock_cost,
  (vs.current_stock * v.selling_price)::numeric   as stock_retail,
  (vs.current_stock * (v.selling_price - v.purchase_price))::numeric as potential_profit
from public.product_variants v
join public.products p        on p.id = v.product_id
left join public.categories c on c.id = p.category_id
left join public.suppliers su on su.id = v.supplier_id
join public.variant_stock vs  on vs.variant_id = v.id;

-- Per-customer trading, built on the Phase 4 balance ledger rather than a
-- second summation of the same rows.
create or replace view public.customer_performance
with (security_invoker = on) as
select
  c.id                                    as customer_id,
  c.customer_number,
  c.name,
  c.phone,
  c.is_active,
  coalesce(o.sales_count, 0)::integer     as sales_count,
  coalesce(o.net_sales, 0)::numeric       as total_purchased,
  coalesce(b.total_paid, 0)::numeric      as total_paid,
  coalesce(b.total_returns, 0)::numeric   as total_returns,
  coalesce(b.balance, 0)::numeric         as outstanding,
  case when coalesce(o.sales_count, 0) > 0
    then round(coalesce(o.net_sales, 0) / o.sales_count, 2)
    else 0 end::numeric                   as average_order_value,
  o.last_sale_date,
  pay.last_payment_date
from public.customers c
left join public.customer_balance b on b.customer_id = c.id
left join lateral (
  select count(*) as sales_count,
         sum(s.total_amount) as net_sales,
         max(s.sale_date) as last_sale_date
  from public.sales s
  where s.customer_id = c.id and s.status = 'COMPLETED'
) o on true
left join lateral (
  select max(sp.payment_date) as last_payment_date
  from public.sale_payments sp
  join public.sales s2 on s2.id = sp.sale_id
  where s2.customer_id = c.id
) pay on true;

-- Per-supplier, likewise on the Phase 3 ledger.
create or replace view public.supplier_performance
with (security_invoker = on) as
select
  s.id                                     as supplier_id,
  s.name,
  s.phone,
  s.is_active,
  coalesce(o.purchase_count, 0)::integer   as purchase_count,
  coalesce(b.total_purchases, 0)::numeric  as total_purchases,
  coalesce(b.total_paid, 0)::numeric       as total_paid,
  coalesce(b.total_returns, 0)::numeric    as total_returns,
  coalesce(b.balance, 0)::numeric          as outstanding,
  o.last_purchase_date,
  pay.last_payment_date
from public.suppliers s
left join public.supplier_balance b on b.supplier_id = s.id
left join lateral (
  select count(*) as purchase_count, max(p.purchase_date) as last_purchase_date
  from public.purchases p
  where p.supplier_id = s.id and p.status = 'COMPLETED'
) o on true
left join lateral (
  select max(pp.payment_date) as last_payment_date
  from public.purchase_payments pp
  join public.purchases p2 on p2.id = pp.purchase_id
  where p2.supplier_id = s.id
) pay on true;

grant select on public.product_performance, public.inventory_valuation,
                public.customer_performance, public.supplier_performance
  to authenticated;

-- =============================================================================
-- 6. ROLE GATES
-- =============================================================================

create or replace function public.can_view_reports()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false)
     and public.is_active_user();
$fn$;

revoke all on function public.can_view_reports() from public;
grant execute on function public.can_view_reports() to authenticated, service_role;

-- =============================================================================
-- 7. SALES, PURCHASES AND PROFIT
-- =============================================================================

drop function if exists public.get_sales_report(date, date, uuid, uuid, text);
create or replace function public.get_sales_report(
  p_date_from date default null,
  p_date_to   date default null,
  p_customer  uuid default null,
  p_category  uuid default null,
  p_method    text default 'ALL'
)
returns table (
  gross_sales      numeric,
  discounts        numeric,
  returns_value    numeric,
  net_sales        numeric,
  invoice_count    integer,
  units_sold       integer,
  units_returned   integer,
  average_order    numeric,
  cash_sales       numeric,
  bank_sales       numeric,
  total_collected  numeric,
  total_outstanding numeric
)
language sql stable set search_path = public as $fn$
  with s as (
    select * from public.sales
     where status = 'COMPLETED'
       and (p_date_from is null or sale_date >= p_date_from)
       and (p_date_to   is null or sale_date <= p_date_to)
       and (p_customer is null or customer_id = p_customer)
       and (p_category is null or exists (
             select 1 from public.sale_items si
             join public.product_variants v on v.id = si.variant_id
             join public.products pr on pr.id = v.product_id
             where si.sale_id = sales.id and pr.category_id = p_category))
       and (p_method = 'ALL' or exists (
             select 1 from public.sale_payments sp
             where sp.sale_id = sales.id and sp.payment_method = p_method))
  ),
  r as (
    select * from public.sales_returns
     where status <> 'CANCELLED'
       and (p_date_from is null or return_date >= p_date_from)
       and (p_date_to   is null or return_date <= p_date_to)
       and (p_customer is null or customer_id = p_customer)
  ),
  pay as (
    select sp.payment_method, sp.amount
    from public.sale_payments sp join s on s.id = sp.sale_id
  )
  select
    coalesce((select sum(subtotal) from s), 0)::numeric,
    coalesce((select sum(discount) from s), 0)::numeric,
    coalesce((select sum(refund_amount) from r), 0)::numeric,
    (coalesce((select sum(total_amount) from s), 0)
     - coalesce((select sum(refund_amount) from r), 0))::numeric,
    (select count(*) from s)::integer,
    coalesce((select sum(si.quantity) from public.sale_items si join s on s.id = si.sale_id), 0)::integer,
    coalesce((select sum(ri.quantity) from public.sales_return_items ri join r on r.id = ri.return_id), 0)::integer,
    case when (select count(*) from s) > 0
      then round((coalesce((select sum(total_amount) from s), 0)
                  - coalesce((select sum(refund_amount) from r), 0)) / (select count(*) from s), 2)
      else 0 end::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'CASH'), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'BANK_TRANSFER'), 0)::numeric,
    coalesce((select sum(paid_amount) from s), 0)::numeric,
    coalesce((select sum(remaining_amount) from s), 0)::numeric;
$fn$;

-- Gross, returns and net over time. The bucket is chosen by the caller from the
-- range, so a year does not render 365 columns.
drop function if exists public.get_sales_series(date, date, text);
create or replace function public.get_sales_series(
  p_date_from date default null,
  p_date_to   date default null,
  p_bucket    text default 'day'
)
returns table (
  bucket        date,
  gross_sales   numeric,
  returns_value numeric,
  net_sales     numeric,
  invoice_count integer
)
language sql stable set search_path = public as $fn$
  with step as (
    select case when p_bucket = 'month' then '1 month'::interval
                when p_bucket = 'week'  then '1 week'::interval
                else '1 day'::interval end as iv,
           case when p_bucket = 'month' then 'month'
                when p_bucket = 'week'  then 'week' else 'day' end as trunc
  ),
  span as (
    select coalesce(p_date_from, (select min(sale_date) from public.sales), current_date) as d0,
           coalesce(p_date_to, current_date) as d1
  ),
  buckets as (
    select generate_series(
             date_trunc((select trunc from step), (select d0 from span))::date,
             (select d1 from span),
             (select iv from step))::date as bucket
  )
  select
    b.bucket,
    coalesce((select sum(s.total_amount) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket
                 and s.sale_date < b.bucket + (select iv from step)), 0)::numeric,
    coalesce((select sum(r.refund_amount) from public.sales_returns r
               where r.status <> 'CANCELLED'
                 and r.return_date >= b.bucket
                 and r.return_date < b.bucket + (select iv from step)), 0)::numeric,
    (coalesce((select sum(s.total_amount) from public.sales s
                where s.status = 'COMPLETED'
                  and s.sale_date >= b.bucket
                  and s.sale_date < b.bucket + (select iv from step)), 0)
     - coalesce((select sum(r.refund_amount) from public.sales_returns r
                  where r.status <> 'CANCELLED'
                    and r.return_date >= b.bucket
                    and r.return_date < b.bucket + (select iv from step)), 0))::numeric,
    coalesce((select count(*) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket
                 and s.sale_date < b.bucket + (select iv from step)), 0)::integer
  from buckets b
  order by b.bucket;
$fn$;

drop function if exists public.get_purchase_report(date, date, uuid);
create or replace function public.get_purchase_report(
  p_date_from date default null,
  p_date_to   date default null,
  p_supplier  uuid default null
)
returns table (
  total_purchases   numeric,
  purchase_count    integer,
  units_purchased   integer,
  paid_to_suppliers numeric,
  outstanding       numeric,
  purchase_returns  numeric,
  net_purchases     numeric
)
language sql stable set search_path = public as $fn$
  with p as (
    select * from public.purchases
     where status = 'COMPLETED'
       and (p_date_from is null or purchase_date >= p_date_from)
       and (p_date_to   is null or purchase_date <= p_date_to)
       and (p_supplier is null or supplier_id = p_supplier)
  ),
  ret as (
    select coalesce(sum(t.amount), 0) as v
    from public.supplier_balance_transactions t
    where t.transaction_type = 'PURCHASE_RETURN'
      and (p_supplier is null or t.supplier_id = p_supplier)
  )
  select
    coalesce((select sum(total_amount) from p), 0)::numeric,
    (select count(*) from p)::integer,
    coalesce((select sum(pi.quantity) from public.purchase_items pi join p on p.id = pi.purchase_id), 0)::integer,
    coalesce((select sum(paid_amount) from p), 0)::numeric,
    coalesce((select sum(remaining_amount) from p), 0)::numeric,
    (select v from ret)::numeric,
    (coalesce((select sum(total_amount) from p), 0) - (select v from ret))::numeric;
$fn$;

-- §75 in the strongest form available: the profit report does not restate the
-- formulas, it calls the Phase 6 function that owns them. Two screens cannot
-- disagree about profit because there is only one implementation.
drop function if exists public.get_profit_report(date, date);
create or replace function public.get_profit_report(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  gross_sales        numeric,
  discounts          numeric,
  returns_value      numeric,
  net_sales          numeric,
  cogs               numeric,
  gross_profit       numeric,
  gross_margin       numeric,
  operating_expenses numeric,
  operating_profit   numeric,
  operating_margin   numeric
)
language sql stable set search_path = public as $fn$
  select
    f.gross_sales,
    f.sales_discounts,
    f.sales_returns,
    f.net_sales,
    f.cogs,
    f.gross_profit,
    f.gross_margin,
    f.operating_expenses,
    f.operating_profit,
    case when f.net_sales > 0
      then round((f.operating_profit / f.net_sales) * 100, 2)
      else 0 end::numeric
  from public.finance_summary(p_date_from, p_date_to) f;
$fn$;

-- Profit split by product, category or brand. One function rather than three,
-- with the dimension allowlisted — never interpolated (§103).
drop function if exists public.get_profit_by_dimension(date, date, text, integer);
create or replace function public.get_profit_by_dimension(
  p_date_from date default null,
  p_date_to   date default null,
  p_dimension text default 'product',
  p_limit     integer default 50
)
returns table (
  dimension_id   text,
  dimension_name text,
  units_sold     integer,
  net_sales      numeric,
  cogs           numeric,
  gross_profit   numeric,
  margin         numeric
)
language sql stable set search_path = public as $fn$
  with sold as (
    select si.variant_id, si.quantity, si.total_price, si.total_cost
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.status = 'COMPLETED'
      and (p_date_from is null or s.sale_date >= p_date_from)
      and (p_date_to   is null or s.sale_date <= p_date_to)
  ),
  returned as (
    select ri.variant_id, ri.quantity, ri.total_amount, ri.total_cost
    from public.sales_return_items ri
    join public.sales_returns r on r.id = ri.return_id
    where r.status <> 'CANCELLED'
      and (p_date_from is null or r.return_date >= p_date_from)
      and (p_date_to   is null or r.return_date <= p_date_to)
  ),
  per_variant as (
    select
      v.id as variant_id, v.product_id, p.name as product_name,
      p.brand, p.category_id, c.name as category_name,
      coalesce((select sum(quantity) from sold where sold.variant_id = v.id), 0)
        - coalesce((select sum(quantity) from returned where returned.variant_id = v.id), 0) as units,
      coalesce((select sum(total_price) from sold where sold.variant_id = v.id), 0)
        - coalesce((select sum(total_amount) from returned where returned.variant_id = v.id), 0) as revenue,
      coalesce((select sum(total_cost) from sold where sold.variant_id = v.id), 0)
        - coalesce((select sum(total_cost) from returned where returned.variant_id = v.id), 0) as cost
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
  ),
  grouped as (
    select
      case p_dimension
        when 'category' then coalesce(category_id::text, 'none')
        when 'brand'    then coalesce(brand, 'none')
        else product_id::text
      end as dim_id,
      case p_dimension
        when 'category' then coalesce(category_name, 'بدون تصنيف')
        when 'brand'    then coalesce(brand, 'بدون علامة')
        else product_name
      end as dim_name,
      sum(units) as units, sum(revenue) as revenue, sum(cost) as cost
    from per_variant
    group by 1, 2
  )
  select
    g.dim_id, g.dim_name,
    g.units::integer,
    g.revenue::numeric,
    g.cost::numeric,
    (g.revenue - g.cost)::numeric,
    case when g.revenue > 0 then round(((g.revenue - g.cost) / g.revenue) * 100, 2) else 0 end::numeric
  from grouped g
  where g.units <> 0 or g.revenue <> 0
  order by (g.revenue - g.cost) desc
  limit greatest(p_limit, 1);
$fn$;

-- Per-variant performance for a period, with allowlisted sorting.
drop function if exists public.get_product_report(date, date, uuid, text, uuid, text, integer, integer);
create or replace function public.get_product_report(
  p_date_from date default null,
  p_date_to   date default null,
  p_category  uuid default null,
  p_brand     text default null,
  p_supplier  uuid default null,
  p_sort      text default 'quantity',
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns table (
  variant_id        uuid,
  product_id        uuid,
  product_name      text,
  sku               text,
  color             text,
  size              text,
  brand             text,
  category_name     text,
  sold_quantity     integer,
  returned_quantity integer,
  net_quantity      integer,
  gross_revenue     numeric,
  net_revenue       numeric,
  cogs              numeric,
  gross_profit      numeric,
  margin            numeric,
  total_count       bigint
)
language sql stable set search_path = public as $fn$
  with sold as (
    select si.variant_id, sum(si.quantity) qty, sum(si.total_price) revenue, sum(si.total_cost) cost
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.status = 'COMPLETED'
      and (p_date_from is null or s.sale_date >= p_date_from)
      and (p_date_to   is null or s.sale_date <= p_date_to)
    group by si.variant_id
  ),
  returned as (
    select ri.variant_id, sum(ri.quantity) qty, sum(ri.total_amount) refunded, sum(ri.total_cost) cost
    from public.sales_return_items ri
    join public.sales_returns r on r.id = ri.return_id
    where r.status <> 'CANCELLED'
      and (p_date_from is null or r.return_date >= p_date_from)
      and (p_date_to   is null or r.return_date <= p_date_to)
    group by ri.variant_id
  ),
  filtered as (
    select
      v.id, v.product_id, p.name, v.sku, v.color, v.size, p.brand, c.name as category_name,
      coalesce(s.qty, 0)::integer as sold_qty,
      coalesce(r.qty, 0)::integer as ret_qty,
      (coalesce(s.qty, 0) - coalesce(r.qty, 0))::integer as net_qty,
      coalesce(s.revenue, 0)::numeric as gross_rev,
      (coalesce(s.revenue, 0) - coalesce(r.refunded, 0))::numeric as net_rev,
      (coalesce(s.cost, 0) - coalesce(r.cost, 0))::numeric as net_cost
    from public.product_variants v
    join public.products p        on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    left join sold s              on s.variant_id = v.id
    left join returned r          on r.variant_id = v.id
    where (p_category is null or p.category_id = p_category)
      and (p_brand is null or p.brand = p_brand)
      and (p_supplier is null or v.supplier_id = p_supplier)
      and (coalesce(s.qty, 0) > 0 or coalesce(r.qty, 0) > 0)
  )
  select
    f.id, f.product_id, f.name, f.sku, f.color, f.size, f.brand, f.category_name,
    f.sold_qty, f.ret_qty, f.net_qty, f.gross_rev, f.net_rev, f.net_cost,
    (f.net_rev - f.net_cost)::numeric,
    case when f.net_rev > 0 then round(((f.net_rev - f.net_cost) / f.net_rev) * 100, 2) else 0 end::numeric,
    count(*) over () as total_count
  from filtered f
  -- Sorting is an allowlist, not a string spliced into SQL.
  order by
    case when p_sort = 'revenue' then f.net_rev end desc nulls last,
    case when p_sort = 'profit'  then (f.net_rev - f.net_cost) end desc nulls last,
    case when p_sort = 'margin'  then
      (case when f.net_rev > 0 then (f.net_rev - f.net_cost) / f.net_rev else 0 end) end desc nulls last,
    case when p_sort not in ('revenue', 'profit', 'margin') then f.net_qty end desc nulls last,
    f.name
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

-- =============================================================================
-- 8. INVENTORY REPORTS
-- =============================================================================

drop function if exists public.get_stock_alert_report(text, uuid, integer, integer);
create or replace function public.get_stock_alert_report(
  p_mode     text default 'LOW',      -- LOW | OUT | DEAD
  p_category uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  variant_id      uuid,
  product_id      uuid,
  product_name    text,
  sku             text,
  color           text,
  size            text,
  brand           text,
  category_name   text,
  supplier_name   text,
  current_stock   integer,
  minimum_stock   integer,
  shortfall       integer,
  stock_cost      numeric,
  stock_retail    numeric,
  last_sale_date  date,
  last_purchase_date date,
  days_since_sale integer,
  total_count     bigint
)
language sql stable set search_path = public as $fn$
  with cfg as (select dead_stock_days from public.report_settings limit 1),
  base as (
    select
      iv.variant_id, iv.product_id, iv.product_name, iv.sku, iv.color, iv.size,
      iv.brand, iv.category_name, iv.supplier_name,
      iv.current_stock, iv.minimum_stock,
      (iv.minimum_stock - iv.current_stock)::integer as shortfall,
      iv.stock_cost, iv.stock_retail,
      pp.last_sale_date, pp.last_purchase_date,
      case when pp.last_sale_date is null then null
           else (current_date - pp.last_sale_date)::integer end as days_since_sale,
      iv.is_active, iv.category_id
    from public.inventory_valuation iv
    join public.product_performance pp on pp.variant_id = iv.variant_id
  ),
  filtered as (
    select * from base
    where (p_category is null or category_id = p_category)
      and case upper(p_mode)
        -- At or below the variant's own reorder point, but still holding stock.
        when 'LOW'  then current_stock > 0 and current_stock <= minimum_stock
        when 'OUT'  then current_stock <= 0 and is_active
        -- Holding stock that has not sold within the configured window,
        -- including stock that has never sold at all.
        when 'DEAD' then current_stock > 0
                     and (last_sale_date is null
                          or last_sale_date < current_date - ((select dead_stock_days from cfg) || ' days')::interval)
        else true
      end
  )
  select
    f.variant_id, f.product_id, f.product_name, f.sku, f.color, f.size, f.brand,
    f.category_name, f.supplier_name, f.current_stock, f.minimum_stock, f.shortfall,
    f.stock_cost, f.stock_retail, f.last_sale_date, f.last_purchase_date, f.days_since_sale,
    count(*) over () as total_count
  from filtered f
  order by
    case when upper(p_mode) = 'DEAD' then f.days_since_sale end desc nulls first,
    f.shortfall desc, f.product_name
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

drop function if exists public.get_inventory_value_report();
create or replace function public.get_inventory_value_report()
returns table (
  total_variants   integer,
  total_units      integer,
  damaged_units    integer,
  stock_cost       numeric,
  stock_retail     numeric,
  potential_profit numeric,
  potential_margin numeric,
  low_stock_count  integer,
  out_of_stock_count integer
)
language sql stable set search_path = public as $fn$
  select
    count(*)::integer,
    coalesce(sum(current_stock), 0)::integer,
    coalesce(sum(damaged_quantity), 0)::integer,
    coalesce(sum(stock_cost), 0)::numeric,
    coalesce(sum(stock_retail), 0)::numeric,
    coalesce(sum(potential_profit), 0)::numeric,
    case when coalesce(sum(stock_retail), 0) > 0
      then round((coalesce(sum(potential_profit), 0) / sum(stock_retail)) * 100, 2)
      else 0 end::numeric,
    count(*) filter (where current_stock > 0 and current_stock <= minimum_stock)::integer,
    count(*) filter (where current_stock <= 0 and is_active)::integer
  from public.inventory_valuation;
$fn$;

drop function if exists public.get_inventory_movement_report(date, date, uuid, text, integer, integer);
create or replace function public.get_inventory_movement_report(
  p_date_from date default null,
  p_date_to   date default null,
  p_variant   uuid default null,
  p_type      text default 'ALL',
  p_limit     integer default 50,
  p_offset    integer default 0
)
returns table (
  id               uuid,
  moved_at         timestamptz,
  variant_id       uuid,
  product_name     text,
  sku              text,
  transaction_type text,
  stock_state      text,
  quantity_in      integer,
  quantity_out     integer,
  signed_quantity  integer,
  reference_type   text,
  reference_id     uuid,
  notes            text,
  actor_name       text,
  total_count      bigint
)
language sql stable set search_path = public as $fn$
  with filtered as (
    select
      t.id, t.created_at, t.variant_id, p.name, v.sku, t.transaction_type, t.stock_state,
      case when t.signed_quantity > 0 then t.quantity else 0 end as qty_in,
      case when t.signed_quantity < 0 then t.quantity else 0 end as qty_out,
      t.signed_quantity, t.reference_type, t.reference_id, t.notes, pr.full_name
    from public.inventory_transactions t
    join public.product_variants v on v.id = t.variant_id
    join public.products p         on p.id = v.product_id
    left join public.profiles pr   on pr.id = t.created_by
    where (p_variant is null or t.variant_id = p_variant)
      and (p_type = 'ALL' or t.transaction_type = p_type)
      and (p_date_from is null or t.created_at >= p_date_from::timestamptz)
      and (p_date_to   is null or t.created_at < (p_date_to + 1)::timestamptz)
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

-- =============================================================================
-- 9. MANAGEMENT KPIs AND COMPARISON
-- =============================================================================

drop function if exists public.get_management_kpis(date, date);
create or replace function public.get_management_kpis(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  net_sales            numeric,
  gross_profit         numeric,
  gross_margin         numeric,
  operating_profit     numeric,
  operating_margin     numeric,
  order_count          integer,
  units_sold           integer,
  average_order_value  numeric,
  units_per_order      numeric,
  return_rate          numeric,
  expense_ratio        numeric,
  inventory_cost       numeric,
  inventory_turnover   numeric,
  customer_receivables numeric,
  supplier_payables    numeric,
  low_stock_count      integer
)
language sql stable set search_path = public as $fn$
  with f as (select * from public.finance_summary(p_date_from, p_date_to) limit 1),
       s as (select * from public.get_sales_report(p_date_from, p_date_to) limit 1),
       inv as (select * from public.get_inventory_value_report() limit 1)
  select
    f.net_sales,
    f.gross_profit,
    f.gross_margin,
    f.operating_profit,
    case when f.net_sales > 0 then round((f.operating_profit / f.net_sales) * 100, 2) else 0 end::numeric,
    s.invoice_count,
    s.units_sold,
    s.average_order,
    case when s.invoice_count > 0
      then round((s.units_sold - s.units_returned)::numeric / s.invoice_count, 2) else 0 end::numeric,
    case when s.units_sold > 0
      then round((s.units_returned::numeric / s.units_sold) * 100, 2) else 0 end::numeric,
    case when f.net_sales > 0
      then round((f.operating_expenses / f.net_sales) * 100, 2) else 0 end::numeric,
    inv.stock_cost,
    -- An approximation, and labelled as one: closing inventory stands in for
    -- average inventory, which the system does not track period by period.
    case when inv.stock_cost > 0 then round(f.cogs / inv.stock_cost, 2) else 0 end::numeric,
    f.customer_receivables,
    f.supplier_payables,
    inv.low_stock_count
  from f, s, inv;
$fn$;

-- §49 and §95: growth against the immediately preceding window of equal length.
-- A previous period of zero yields NULL, never a division by zero — the screen
-- shows "غير متاح" rather than a meaningless infinity.
drop function if exists public.get_period_comparison(date, date);
create or replace function public.get_period_comparison(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  metric          text,
  current_value   numeric,
  previous_value  numeric,
  change_value    numeric,
  change_percent  numeric
)
language sql stable set search_path = public as $fn$
  with bounds as (
    select
      coalesce(p_date_from, date_trunc('month', current_date)::date) as d0,
      coalesce(p_date_to, current_date) as d1
  ),
  span as (
    select d0, d1, (d1 - d0 + 1) as len,
           (d0 - (d1 - d0 + 1))::date as pd0,
           (d0 - 1)::date as pd1
    from bounds
  ),
  cur  as (select * from public.finance_summary((select d0 from span), (select d1 from span)) limit 1),
  prev as (select * from public.finance_summary((select pd0 from span), (select pd1 from span)) limit 1),
  curs as (select * from public.get_sales_report((select d0 from span), (select d1 from span)) limit 1),
  prevs as (select * from public.get_sales_report((select pd0 from span), (select pd1 from span)) limit 1),
  pairs as (
    select 'net_sales'        as metric, cur.net_sales          as c, prev.net_sales          as p from cur, prev
    union all select 'gross_profit',     cur.gross_profit,           prev.gross_profit           from cur, prev
    union all select 'operating_profit', cur.operating_profit,       prev.operating_profit       from cur, prev
    union all select 'expenses',         cur.operating_expenses,     prev.operating_expenses     from cur, prev
    union all select 'orders',           curs.invoice_count::numeric, prevs.invoice_count::numeric from curs, prevs
    union all select 'returned_units',   curs.units_returned::numeric, prevs.units_returned::numeric from curs, prevs
  )
  select
    pairs.metric,
    pairs.c::numeric,
    pairs.p::numeric,
    (pairs.c - pairs.p)::numeric,
    case when pairs.p <> 0 then round(((pairs.c - pairs.p) / abs(pairs.p)) * 100, 2) else null end::numeric
  from pairs;
$fn$;

-- =============================================================================
-- 10. DAILY CLOSING, MONTHLY AND YEARLY
-- =============================================================================

drop function if exists public.get_daily_closing_summary(date);
create or replace function public.get_daily_closing_summary(p_date date default current_date)
returns table (
  closing_date      date,
  cash_opening      numeric,
  cash_in           numeric,
  cash_out          numeric,
  cash_closing      numeric,
  bank_opening      numeric,
  bank_in           numeric,
  bank_out          numeric,
  bank_closing      numeric,
  sales_total       numeric,
  returns_total     numeric,
  expenses_total    numeric,
  gross_profit      numeric,
  customer_outstanding numeric,
  supplier_outstanding numeric
)
language sql stable set search_path = public as $fn$
  with accts as (
    select id, account_type from public.financial_accounts where is_active
  ),
  opening as (
    select a.account_type,
           coalesce(sum(t.signed_amount), 0) as bal
    from accts a
    left join public.financial_transactions t
      on t.financial_account_id = a.id and t.transaction_date < p_date
    group by a.account_type
  ),
  moves as (
    select a.account_type,
           coalesce(sum(t.amount) filter (where t.direction = 'IN'), 0)  as ins,
           coalesce(sum(t.amount) filter (where t.direction = 'OUT'), 0) as outs
    from accts a
    left join public.financial_transactions t
      on t.financial_account_id = a.id and t.transaction_date = p_date
    group by a.account_type
  ),
  f as (select * from public.finance_summary(p_date, p_date) limit 1)
  select
    p_date,
    coalesce((select bal from opening where account_type = 'CASH'), 0)::numeric,
    coalesce((select ins from moves where account_type = 'CASH'), 0)::numeric,
    coalesce((select outs from moves where account_type = 'CASH'), 0)::numeric,
    (coalesce((select bal from opening where account_type = 'CASH'), 0)
     + coalesce((select ins from moves where account_type = 'CASH'), 0)
     - coalesce((select outs from moves where account_type = 'CASH'), 0))::numeric,
    coalesce((select bal from opening where account_type = 'BANK'), 0)::numeric,
    coalesce((select ins from moves where account_type = 'BANK'), 0)::numeric,
    coalesce((select outs from moves where account_type = 'BANK'), 0)::numeric,
    (coalesce((select bal from opening where account_type = 'BANK'), 0)
     + coalesce((select ins from moves where account_type = 'BANK'), 0)
     - coalesce((select outs from moves where account_type = 'BANK'), 0))::numeric,
    f.net_sales + f.sales_returns,
    f.sales_returns,
    f.operating_expenses,
    f.gross_profit,
    f.customer_receivables,
    f.supplier_payables
  from f;
$fn$;

drop function if exists public.get_monthly_performance(integer);
create or replace function public.get_monthly_performance(p_year integer default null)
returns table (
  period_start     date,
  label            text,
  gross_sales      numeric,
  net_sales        numeric,
  cogs             numeric,
  gross_profit     numeric,
  expenses         numeric,
  operating_profit numeric,
  cash_in          numeric,
  cash_out         numeric,
  net_cash_flow    numeric
)
language sql stable set search_path = public as $fn$
  with months as (
    select generate_series(
             make_date(coalesce(p_year, extract(year from current_date)::integer), 1, 1),
             make_date(coalesce(p_year, extract(year from current_date)::integer), 12, 1),
             '1 month'::interval)::date as m
  )
  select
    m.m,
    to_char(m.m, 'YYYY-MM'),
    f.gross_sales, f.net_sales, f.cogs, f.gross_profit,
    f.operating_expenses, f.operating_profit,
    f.cash_in, f.cash_out, f.net_cash_flow
  from months m
  cross join lateral public.finance_summary(m.m, (m.m + '1 month'::interval - '1 day'::interval)::date) f
  order by m.m;
$fn$;

drop function if exists public.get_yearly_performance(integer);
create or replace function public.get_yearly_performance(p_years integer default 5)
returns table (
  period_start     date,
  label            text,
  net_sales        numeric,
  total_purchases  numeric,
  expenses         numeric,
  gross_profit     numeric,
  operating_profit numeric,
  net_cash_flow    numeric
)
language sql stable set search_path = public as $fn$
  with years as (
    select generate_series(
             make_date(extract(year from current_date)::integer - greatest(p_years, 1) + 1, 1, 1),
             make_date(extract(year from current_date)::integer, 1, 1),
             '1 year'::interval)::date as y
  )
  select
    y.y,
    to_char(y.y, 'YYYY'),
    f.net_sales, f.total_purchases, f.operating_expenses,
    f.gross_profit, f.operating_profit, f.net_cash_flow
  from years y
  cross join lateral public.finance_summary(y.y, (y.y + '1 year'::interval - '1 day'::interval)::date) f
  order by y.y;
$fn$;

-- =============================================================================
-- 11. ALERTS AND INSIGHTS
-- =============================================================================
-- Deterministic and rule-based (§105). Every figure is measured, and every
-- threshold comes from report_settings rather than from the query text.

drop function if exists public.get_management_alerts();
create or replace function public.get_management_alerts()
returns table (
  alert_key   text,
  severity    text,
  metric      numeric,
  threshold   numeric,
  detail      text
)
language sql stable set search_path = public as $fn$
  with cfg as (select * from public.report_settings limit 1),
  inv as (select * from public.get_inventory_value_report() limit 1),
  cust as (
    select count(*) as n, coalesce(sum(outstanding), 0) as total
    from public.customer_performance, cfg
    where outstanding > cfg.customer_debt_threshold
  ),
  sup as (
    select count(*) as n, coalesce(sum(outstanding), 0) as total
    from public.supplier_performance, cfg
    where outstanding > cfg.supplier_debt_threshold
  ),
  ret as (
    select count(*) as n
    from public.product_performance pp, cfg
    where pp.sold_quantity > 0
      and (pp.returned_quantity::numeric / pp.sold_quantity) * 100 > cfg.high_return_rate_percent
  ),
  dead as (
    select count(*) as n
    from public.inventory_valuation iv
    join public.product_performance pp on pp.variant_id = iv.variant_id, cfg
    where iv.current_stock > 0
      and (pp.last_sale_date is null
           or pp.last_sale_date < current_date - (cfg.dead_stock_days || ' days')::interval)
  )
  select 'LOW_STOCK', 'WARNING', inv.low_stock_count::numeric, null::numeric,
         'منتجات وصلت الحد الأدنى للمخزون' from inv where inv.low_stock_count > 0
  union all
  select 'OUT_OF_STOCK', 'CRITICAL', inv.out_of_stock_count::numeric, null,
         'منتجات نفدت من المخزون' from inv where inv.out_of_stock_count > 0
  union all
  select 'CUSTOMER_DEBT', 'WARNING', cust.total, cfg.customer_debt_threshold,
         'عملاء تجاوزت أرصدتهم الحد المسموح' from cust, cfg where cust.n > 0
  union all
  select 'SUPPLIER_DEBT', 'WARNING', sup.total, cfg.supplier_debt_threshold,
         'موردون تجاوزت أرصدتهم الحد المسموح' from sup, cfg where sup.n > 0
  union all
  select 'HIGH_RETURN_RATE', 'WARNING', ret.n::numeric, cfg.high_return_rate_percent,
         'منتجات معدل إرجاعها مرتفع' from ret, cfg where ret.n > 0
  union all
  select 'DEAD_STOCK', 'INFO', dead.n::numeric, cfg.dead_stock_days::numeric,
         'منتجات لم تُبع منذ فترة طويلة' from dead, cfg where dead.n > 0;
$fn$;

-- =============================================================================
-- 12. WRITE OPERATIONS
-- =============================================================================

create or replace function public.create_cash_closing(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor    uuid := (select auth.uid());
  v_id       uuid;
  v_number   text;
  v_account  uuid := nullif(p_payload ->> 'financial_account_id', '')::uuid;
  v_date     date := coalesce(nullif(p_payload ->> 'closing_date', '')::date, current_date);
  v_actual   numeric(12,2) := coalesce(nullif(p_payload ->> 'actual_balance', '')::numeric, 0);
  v_expected numeric(12,2);
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to close the till' using errcode = '42501';
  end if;
  if v_account is null then
    raise exception 'account_required' using errcode = '22023';
  end if;
  if v_actual < 0 then
    raise exception 'invalid_actual_balance' using errcode = '22023';
  end if;

  perform 1 from public.financial_accounts where id = v_account and is_active;
  if not found then
    raise exception 'financial_account_not_found' using errcode = 'P0002';
  end if;

  -- Expected comes from the ledger, never from the browser: the whole point of
  -- a closing is to compare what was counted against what the books say.
  select coalesce(sum(signed_amount), 0) into v_expected
    from public.financial_transactions
   where financial_account_id = v_account and transaction_date <= v_date;

  insert into public.cash_closings (
    closing_date, financial_account_id, expected_balance, actual_balance,
    difference, notes, closed_by
  )
  values (
    v_date, v_account, v_expected, v_actual, v_actual - v_expected,
    nullif(btrim(p_payload ->> 'notes'), ''), v_actor
  )
  returning id, closing_number into v_id, v_number;

  -- §45: a difference is recorded, not corrected. Moving money to match the
  -- count requires a deliberate financial adjustment by an administrator.
  return jsonb_build_object(
    'id', v_id, 'closing_number', v_number, 'closing_date', v_date,
    'expected_balance', v_expected, 'actual_balance', v_actual,
    'difference', v_actual - v_expected
  );
end;
$fn$;

create or replace function public.update_report_settings(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if not public.can_administer_finance() then
    raise exception 'forbidden: only an administrator may change report thresholds'
      using errcode = '42501';
  end if;

  update public.report_settings
     set dead_stock_days = coalesce(nullif(p_payload ->> 'dead_stock_days', '')::integer, dead_stock_days),
         high_return_rate_percent = coalesce(nullif(p_payload ->> 'high_return_rate_percent', '')::numeric, high_return_rate_percent),
         customer_debt_threshold = coalesce(nullif(p_payload ->> 'customer_debt_threshold', '')::numeric, customer_debt_threshold),
         supplier_debt_threshold = coalesce(nullif(p_payload ->> 'supplier_debt_threshold', '')::numeric, supplier_debt_threshold),
         expense_growth_percent = coalesce(nullif(p_payload ->> 'expense_growth_percent', '')::numeric, expense_growth_percent)
   where id;

  return (select to_jsonb(r) from public.report_settings r limit 1);
end;
$fn$;

revoke all on function public.create_cash_closing(jsonb)    from public;
revoke all on function public.update_report_settings(jsonb) from public;
grant execute on function public.create_cash_closing(jsonb)    to authenticated;
grant execute on function public.update_report_settings(jsonb) to authenticated;

-- =============================================================================
-- 13. RLS AND GRANTS
-- =============================================================================

alter table public.cash_closings   enable row level security;
alter table public.report_settings enable row level security;

drop policy if exists cash_closings_select   on public.cash_closings;
drop policy if exists report_settings_select on public.report_settings;

create policy cash_closings_select on public.cash_closings
  for select to authenticated using ((select public.can_view_reports()));
create policy report_settings_select on public.report_settings
  for select to authenticated using ((select public.can_view_reports()));

revoke all on public.cash_closings, public.report_settings from authenticated, anon;
grant select on public.cash_closings   to authenticated;
grant select on public.report_settings to authenticated;
grant usage, select on sequence public.closing_number_seq to authenticated;

grant execute on function public.get_sales_report(date, date, uuid, uuid, text) to authenticated;
grant execute on function public.get_sales_series(date, date, text) to authenticated;
grant execute on function public.get_purchase_report(date, date, uuid) to authenticated;
grant execute on function public.get_profit_report(date, date) to authenticated;
grant execute on function public.get_profit_by_dimension(date, date, text, integer) to authenticated;
grant execute on function public.get_product_report(date, date, uuid, text, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_stock_alert_report(text, uuid, integer, integer) to authenticated;
grant execute on function public.get_inventory_value_report() to authenticated;
grant execute on function public.get_inventory_movement_report(date, date, uuid, text, integer, integer) to authenticated;
grant execute on function public.get_management_kpis(date, date) to authenticated;
grant execute on function public.get_period_comparison(date, date) to authenticated;
grant execute on function public.get_daily_closing_summary(date) to authenticated;
grant execute on function public.get_monthly_performance(integer) to authenticated;
grant execute on function public.get_yearly_performance(integer) to authenticated;
grant execute on function public.get_management_alerts() to authenticated;
