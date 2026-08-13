-- =============================================================================
-- 0014 — Make the profit breakdown scale
--
-- Measured against 10,000 sales carrying 100,000 sale lines, every report
-- answered inside a second except one:
--
--     get_profit_by_dimension (product)   2242 ms
--
-- The cause is shape, not size. `per_variant` ran two correlated sub-selects
-- over the entire sale-line set once per variant in the catalogue, so the work
-- grew with variants x lines. Aggregating each side by variant first and then
-- joining does the same arithmetic once. Variants with no movement in the
-- period are dropped before the grouping rather than after, since they can only
-- contribute zeroes.
--
-- Identical results — same allocation, same netting of returns, same ordering.
-- Only the plan changes.
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
  per_variant as (
    select
      v.id as variant_id, v.product_id, p.name as product_name,
      p.brand, p.category_id, c.name as category_name,
      (coalesce(sd.quantity, 0) - coalesce(rt.quantity, 0)) as units,
      (coalesce(sd.total_price, 0) - coalesce(rt.total_amount, 0)) as revenue,
      (coalesce(sd.total_cost, 0) - coalesce(rt.total_cost, 0)) as cost
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    left join sold sd     on sd.variant_id = v.id
    left join returned rt on rt.variant_id = v.id
    -- A variant with no movement in the period contributes nothing but still
    -- had to be scanned; dropping it here keeps the group-by small.
    where sd.variant_id is not null or rt.variant_id is not null
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
