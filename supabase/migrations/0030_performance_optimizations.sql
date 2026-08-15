-- 0030_performance_optimizations.sql
-- Optimizations for brand listing and variant facets

create or replace function public.get_distinct_brands()
returns setof text
language sql stable security invoker set search_path = '' as $fn$
  select distinct trim(p.brand)
  from public.products p
  where p.brand is not null
    and trim(p.brand) <> ''
  order by trim(p.brand);
$fn$;

create or replace function public.get_variant_facets()
returns jsonb
language plpgsql stable security invoker set search_path = '' as $fn$
declare
  v_colors jsonb;
  v_sizes jsonb;
begin
  select coalesce(jsonb_agg(c), '[]'::jsonb)
    into v_colors
    from (
      select distinct trim(pv.color) as c
      from public.product_variants pv
      where pv.color is not null and trim(pv.color) <> ''
      order by c
    ) t;

  select coalesce(jsonb_agg(s), '[]'::jsonb)
    into v_sizes
    from (
      select distinct trim(pv.size) as s
      from public.product_variants pv
      where pv.size is not null and trim(pv.size) <> ''
      order by s
    ) t;

  return jsonb_build_object(
    'colors', v_colors,
    'sizes', v_sizes
  );
end;
$fn$;

grant execute on function public.get_distinct_brands() to authenticated;
grant execute on function public.get_variant_facets() to authenticated;

revoke execute on function public.get_distinct_brands() from anon;
revoke execute on function public.get_variant_facets() from anon;
