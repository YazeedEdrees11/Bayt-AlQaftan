-- =============================================================================
-- 0029 — the breakdowns that no longer added up
-- =============================================================================
--
-- 0027 and 0028 taught the headline figures to count exchanges. Everything that
-- breaks those headlines down — by product, by category, by brand, by day —
-- still counted only invoices, so the parts stopped summing to the whole. The
-- regression run put numbers on it: product rows came to 28,900 against a
-- reported net of 29,410, and the daily series to 29,100 against 29,610.
--
-- The sweep after 0028 missed these because it looked for functions summing
-- `sales.total_amount`. These aggregate `sale_items`, which is a different
-- route into the same data and did not match the pattern. The corrected sweep
-- asks a better question — does this function aggregate anything reachable from
-- a sale — and finds eleven, of which these four were still blind.
--
-- Attribution is exact rather than apportioned, because `exchange_items` keeps
-- both legs with their own variant, quantity, price and cost. The replacement
-- adds its retail value and cost to its own product; the piece handed back
-- takes them off its own. Summed across variants that is precisely the
-- (new - returned) difference the headline carries, so the breakdown reconciles
-- by construction rather than by coincidence.
--
-- `invoice_count` in the sales series is deliberately untouched: an exchange is
-- not an invoice, and inflating the count would make average-order-value wrong
-- in order to make a different number look tidy.
-- =============================================================================

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
language plpgsql stable set search_path = public as $fn$
#variable_conflict use_column
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
-- Aggregate once per variant, then join. The previous shape ran a pair of
  -- correlated sub-selects over the whole sale-line set for every variant in
  -- the catalogue, which is fine on a demo database and 2.2 seconds on a real
  -- one — measured at 100,000 lines.
  with sold as (
    select si.variant_id,
           sum(si.quantity) as quantity,
           -- Same allocation as get_product_report, so the two agree.
           sum(si.total_price * case when s.subtotal > 0
               then (s.subtotal - s.discount) / s.subtotal else 1 end) as total_price,
           sum(si.total_cost) as total_cost
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.status = 'COMPLETED'
      and (p_date_from is null or s.sale_date >= p_date_from)
      and (p_date_to   is null or s.sale_date <= p_date_to)
    group by si.variant_id
  ),
  returned as (
    select ri.variant_id,
           sum(ri.quantity) as quantity,
           sum(ri.total_amount) as total_amount,
           sum(ri.total_cost) as total_cost
    from public.sales_return_items ri
    join public.sales_returns r on r.id = ri.return_id
    where r.status <> 'CANCELLED'
      and (p_date_from is null or r.return_date >= p_date_from)
      and (p_date_to   is null or r.return_date <= p_date_to)
    group by ri.variant_id
  ),
  swapped as (
    -- Both legs of every exchange, signed: the replacement adds its retail
    -- value and its cost to its own variant, the piece handed back takes them
    -- off its own. Summed over all variants this comes to exactly the
    -- (new - returned) difference the headline carries since 0027, which is
    -- what makes the breakdown reconcile with the total again.
    select xi.variant_id,
           sum(case when xi.item_type = 'NEW'
                    then xi.quantity else -xi.quantity end)          as quantity,
           sum(case when xi.item_type = 'NEW'
                    then xi.total_amount else -xi.total_amount end)  as total_amount,
           sum(case when xi.item_type = 'NEW'
                    then xi.quantity * xi.unit_cost
                    else -xi.quantity * xi.unit_cost end)            as total_cost
    from public.exchange_items xi
    join public.exchanges ex on ex.id = xi.exchange_id
    where ex.status <> 'CANCELLED'
      and (p_date_from is null or ex.exchange_date >= p_date_from)
      and (p_date_to   is null or ex.exchange_date <= p_date_to)
    group by xi.variant_id
  ),
  per_variant as (
    select
      v.id as variant_id, v.product_id, p.name as product_name,
      p.brand, p.category_id, c.name as category_name,
      (coalesce(sd.quantity, 0) - coalesce(rt.quantity, 0)
        + coalesce(xc.quantity, 0)) as units,
      (coalesce(sd.total_price, 0) - coalesce(rt.total_amount, 0)
        + coalesce(xc.total_amount, 0)) as revenue,
      (coalesce(sd.total_cost, 0) - coalesce(rt.total_cost, 0)
        + coalesce(xc.total_cost, 0)) as cost
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    left join sold sd     on sd.variant_id = v.id
    left join returned rt on rt.variant_id = v.id
    left join swapped  xc on xc.variant_id = v.id
    -- A variant with no movement in the period contributes nothing but still
    -- had to be scanned; dropping it here keeps the group-by small.
    where sd.variant_id is not null or rt.variant_id is not null
       or xc.variant_id is not null
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
#variable_conflict use_column
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
with sold as (
    select si.variant_id,
           sum(si.quantity) qty,
           sum(si.total_price) gross_revenue,
           -- The invoice discount belongs to the lines that earned it, spread
           -- by line value. Without this a product's revenue is pre-discount
           -- while its returns are post-discount, and the two never reconcile.
           sum(si.total_price * case when s.subtotal > 0
               then (s.subtotal - s.discount) / s.subtotal else 1 end) revenue,
           sum(si.total_cost) cost
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
  swapped as (
    -- Both legs of every exchange, signed: the replacement adds its retail
    -- value and its cost to its own variant, the piece handed back takes them
    -- off its own. Summed over all variants this comes to exactly the
    -- (new - returned) difference the headline carries since 0027, which is
    -- what makes the breakdown reconcile with the total again.
    select xi.variant_id,
           sum(case when xi.item_type = 'NEW'
                    then xi.quantity else -xi.quantity end)          as quantity,
           sum(case when xi.item_type = 'NEW'
                    then xi.total_amount else -xi.total_amount end)  as total_amount,
           sum(case when xi.item_type = 'NEW'
                    then xi.quantity * xi.unit_cost
                    else -xi.quantity * xi.unit_cost end)            as total_cost
    from public.exchange_items xi
    join public.exchanges ex on ex.id = xi.exchange_id
    where ex.status <> 'CANCELLED'
      and (p_date_from is null or ex.exchange_date >= p_date_from)
      and (p_date_to   is null or ex.exchange_date <= p_date_to)
    group by xi.variant_id
  ),
  filtered as (
    select
      v.id, v.product_id, p.name, v.sku, v.color, v.size, p.brand, c.name as category_name,
      coalesce(s.qty, 0)::integer as sold_qty,
      coalesce(r.qty, 0)::integer as ret_qty,
      (coalesce(s.qty, 0) - coalesce(r.qty, 0)
        + coalesce(x.quantity, 0))::integer as net_qty,
      (coalesce(s.gross_revenue, 0)
        + coalesce(x.total_amount, 0))::numeric as gross_rev,
      (coalesce(s.revenue, 0) - coalesce(r.refunded, 0)
        + coalesce(x.total_amount, 0))::numeric as net_rev,
      (coalesce(s.cost, 0) - coalesce(r.cost, 0)
        + coalesce(x.total_cost, 0))::numeric as net_cost
    from public.product_variants v
    join public.products p        on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    left join sold s              on s.variant_id = v.id
    left join returned r          on r.variant_id = v.id
    left join swapped  x          on x.variant_id = v.id
    where (p_category is null or p.category_id = p_category)
      and (p_brand is null or p.brand = p_brand)
      and (p_supplier is null or v.supplier_id = p_supplier)
      and (coalesce(s.qty, 0) > 0 or coalesce(r.qty, 0) > 0
           or x.variant_id is not null)
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
#variable_conflict use_column
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
    -- `lo` and `hi` are the half-open window this bucket may actually count:
    -- its own span, intersected with the range the caller asked for.
    select gs::date as bucket,
           greatest(gs::date, (select d0 from span))                  as lo,
           least((gs + (select iv from step))::date,
                 (select d1 from span) + 1)                           as hi
      from generate_series(
             date_trunc((select trunc from step), (select d0 from span))::date,
             (select d1 from span),
             (select iv from step)
           ) as gs
  )
  select
    b.bucket,
    (coalesce((select sum(s.total_amount) from public.sales s
                where s.status = 'COMPLETED'
                  and s.sale_date >= b.lo and s.sale_date < b.hi), 0)
    + coalesce((select sum(ex.new_items_amount - ex.returned_amount)
                  from public.exchanges ex
                 where ex.status <> 'CANCELLED'
                   and ex.exchange_date >= b.lo and ex.exchange_date < b.hi), 0))::numeric,
    coalesce((select sum(r.refund_amount) from public.sales_returns r
               where r.status <> 'CANCELLED'
                 and r.return_date >= b.lo and r.return_date < b.hi), 0)::numeric,
    (coalesce((select sum(s.total_amount) from public.sales s
                where s.status = 'COMPLETED'
                  and s.sale_date >= b.lo and s.sale_date < b.hi), 0)
     - coalesce((select sum(r.refund_amount) from public.sales_returns r
                  where r.status <> 'CANCELLED'
                    and r.return_date >= b.lo and r.return_date < b.hi), 0)
    + coalesce((select sum(ex.new_items_amount - ex.returned_amount)
                  from public.exchanges ex
                 where ex.status <> 'CANCELLED'
                   and ex.exchange_date >= b.lo and ex.exchange_date < b.hi), 0))::numeric,
    coalesce((select count(*) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.lo and s.sale_date < b.hi), 0)::integer
  from buckets b
  where b.lo < b.hi
  order by b.bucket;
end;
$fn$;

create or replace function public.finance_series(
  p_date_from date default null,
  p_date_to   date default null,
  p_bucket    text default 'day'
)
returns table (
  bucket       date,
  net_sales    numeric,
  cogs         numeric,
  gross_profit numeric,
  expenses     numeric
)
language sql stable set search_path = public as $fn$
  with span as (
    select coalesce(p_date_from, (select min(sale_date) from public.sales), current_date) as d0,
           coalesce(p_date_to, current_date) as d1
  ),
  step as (
    select case when p_bucket = 'month' then '1 month'::interval
                when p_bucket = 'week'  then '1 week'::interval
                else '1 day'::interval end as iv
  ),
  buckets as (
    select generate_series(
             date_trunc(case when p_bucket = 'month' then 'month'
                             when p_bucket = 'week'  then 'week' else 'day' end,
                        (select d0 from span))::date,
             (select d1 from span),
             (select iv from step)
           )::date as bucket
  )
  select
    b.bucket,
    coalesce((select sum(s.total_amount) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket and s.sale_date < b.bucket + (select iv from step)), 0)
    - coalesce((select sum(r.refund_amount) from public.sales_returns r
                 where r.status <> 'CANCELLED'
                   and r.return_date >= b.bucket and r.return_date < b.bucket + (select iv from step)), 0)
    + coalesce((select sum(ex.new_items_amount - ex.returned_amount)
                  from public.exchanges ex
                 where ex.status <> 'CANCELLED'
                   and ex.exchange_date >= b.bucket and ex.exchange_date < b.bucket + (select iv from step)), 0),
    coalesce((select sum(s.total_cost) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket and s.sale_date < b.bucket + (select iv from step)), 0)
    - coalesce((select sum(r.total_cost) from public.sales_returns r
                 where r.status <> 'CANCELLED'
                   and r.return_date >= b.bucket and r.return_date < b.bucket + (select iv from step)), 0)
    + coalesce((select sum(ex.new_items_cost - ex.returned_cost)
                  from public.exchanges ex
                 where ex.status <> 'CANCELLED'
                   and ex.exchange_date >= b.bucket and ex.exchange_date < b.bucket + (select iv from step)), 0),
    0::numeric,
    coalesce((select sum(e.amount) from public.expenses e
               where e.status = 'COMPLETED'
                 and e.expense_date >= b.bucket and e.expense_date < b.bucket + (select iv from step)), 0)
  from buckets b
  order by b.bucket;
$fn$;
