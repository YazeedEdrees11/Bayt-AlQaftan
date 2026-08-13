-- =============================================================================
-- 0012 — Report authorization and discount allocation
--
-- Two defects found by running Phase 7's reporting against the live database.
--
-- 1. AUTHORIZATION. Every reporting function in 0011 was `language sql` with
--    no permission check, granted to `authenticated`. The application guards
--    each screen with requirePermission, but a STAFF user holding nothing but
--    their own session could call the RPC directly and read the whole profit
--    report — measured: gross sales, COGS, margin, the lot. The same held for
--    the four reporting views, which are security_invoker and therefore only
--    as restrictive as the RLS a salesperson already needs to do their job.
--    Every function now refuses without can_view_reports(), and every view
--    filters on it. RLS still applies underneath; this is a floor, not a
--    replacement.
--
-- 2. DISCOUNT ALLOCATION. Per-product revenue summed `sale_items.total_price`,
--    which is the line total *before* the invoice discount, while returns were
--    already valued net of it. So the product and dimension reports overstated
--    revenue and profit by exactly the discounts given, and the profit page
--    showed a breakdown that added up to more than its own headline. The
--    discount is now spread across the lines that earned it, in proportion to
--    line value, so the parts sum to the whole.
--
-- Nothing here changes a stored figure: no ledger row, no sale, no balance.
-- These are read paths only.
-- =============================================================================

-- ---------------------------------------------------------------- functions

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
with sold as (
    select si.variant_id, si.quantity,
           -- Same allocation as get_product_report, so the two agree.
           (si.total_price * case when s.subtotal > 0
               then (s.subtotal - s.discount) / s.subtotal else 1 end) as total_price,
           si.total_cost
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
  filtered as (
    select
      v.id, v.product_id, p.name, v.sku, v.color, v.size, p.brand, c.name as category_name,
      coalesce(s.qty, 0)::integer as sold_qty,
      coalesce(r.qty, 0)::integer as ret_qty,
      (coalesce(s.qty, 0) - coalesce(r.qty, 0))::integer as net_qty,
      coalesce(s.gross_revenue, 0)::numeric as gross_rev,
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

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
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

create or replace function public.get_management_alerts()
returns table (
  alert_key   text,
  severity    text,
  metric      numeric,
  threshold   numeric,
  detail      text
)
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
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
end;
$fn$;

-- -------------------------------------------------------------------- views

create or replace view public.product_performance
with (security_invoker = on) as
select * from (
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
         sum(si.total_price * case when sa.subtotal > 0
               then (sa.subtotal - sa.discount) / sa.subtotal else 1 end) as revenue,
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
) pu on true
) t
where public.can_view_reports();

create or replace view public.inventory_valuation
with (security_invoker = on) as
select * from (
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
join public.variant_stock vs  on vs.variant_id = v.id
) t
where public.can_view_reports();

create or replace view public.customer_performance
with (security_invoker = on) as
select * from (
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
) pay on true
) t
where public.can_view_reports();

create or replace view public.supplier_performance
with (security_invoker = on) as
select * from (
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
) pay on true
) t
where public.can_view_reports();

comment on function public.get_profit_report(date, date) is
  'Profit and loss for a period. Delegates to finance_summary so the figures cannot disagree with the finance module, and refuses callers without report permission.';
comment on function public.get_product_report(date, date, uuid, text, uuid, text, integer, integer) is
  'Per-variant trading for a period. Revenue is net of the invoice discount, allocated across lines by value, so per-product revenue reconciles with net sales.';
