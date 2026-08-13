-- =============================================================================
-- 0018 — Clamp the sales series to the range it was asked for
--
-- `get_sales_series` builds its buckets with date_trunc, so a range beginning
-- mid-period starts at the period boundary: ask for the last 30 days on the
-- 12th of August and the first monthly bucket begins on 1 July. Each bucket
-- then summed everything from its own start to its own end, which is to say it
-- counted sales from before the range the caller asked for — and, at the other
-- end, sales dated after it.
--
-- On the Phase 7 fixtures this was invisible, because every seeded row sat
-- inside the window. It surfaced the moment Phase 8's tests left a sale dated
-- forty days back: the series totalled 10,375 against the report's 9,775 for
-- the same period. Two figures on the same screen — the chart and the headline
-- above it — disagreeing by 600.
--
-- Each bucket is now clamped to the intersection of itself and the requested
-- range. The buckets still start on clean boundaries, because a chart whose
-- first column began on the 13th of a month would be harder to read, but a
-- partial bucket now reports only the part that was asked for.
-- =============================================================================

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
    coalesce((select sum(s.total_amount) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.lo and s.sale_date < b.hi), 0)::numeric,
    coalesce((select sum(r.refund_amount) from public.sales_returns r
               where r.status <> 'CANCELLED'
                 and r.return_date >= b.lo and r.return_date < b.hi), 0)::numeric,
    (coalesce((select sum(s.total_amount) from public.sales s
                where s.status = 'COMPLETED'
                  and s.sale_date >= b.lo and s.sale_date < b.hi), 0)
     - coalesce((select sum(r.refund_amount) from public.sales_returns r
                  where r.status <> 'CANCELLED'
                    and r.return_date >= b.lo and r.return_date < b.hi), 0))::numeric,
    coalesce((select count(*) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.lo and s.sale_date < b.hi), 0)::integer
  from buckets b
  where b.lo < b.hi
  order by b.bucket;
end;
$fn$;

comment on function public.get_sales_series(date, date, text) is
  'Sales over time, bucketed. Each bucket counts only the part of itself that falls inside the requested range, so the series always sums to the sales report.';
