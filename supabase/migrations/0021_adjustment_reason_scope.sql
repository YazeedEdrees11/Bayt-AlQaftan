-- =============================================================================
-- 0021 — require_adjustment_reason, checked against what was actually sent
--
-- `v_reason` is declared as
--
--     coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'STOCK_COUNT')
--
-- so by the time 0019's check ran, a missing reason had already become
-- 'STOCK_COUNT' and the check could never fire. The setting read as enforced
-- and was not — which is the very thing 0019 set out to fix.
--
-- The same silent substitution as the return condition in 0020: a value nobody
-- supplied quietly becomes a plausible default, and "we did not say why" is
-- recorded as "stock count". The check now reads the payload, not the variable
-- that has already been defaulted. The default itself stays, because an
-- adjustment made while the setting is off still needs a reason column to fill.
-- =============================================================================

create or replace function public.create_inventory_adjustment(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor    uuid := (select auth.uid());
  v_adj_id   uuid;
  v_adj_no   text;
  v_reason   text := coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'STOCK_COUNT');
  v_item     jsonb;
  v_variant  record;
  v_system   integer;
  v_actual   integer;
  v_diff     integer;
  v_inc      integer := 0;
  v_dec      integer := 0;
  v_count    integer := 0;
begin
  if not public.can_adjust_inventory() then
    raise exception 'forbidden: insufficient permission to adjust inventory' using errcode = '42501';
  end if;

  -- A null reason slipped through: `null not in (...)` is null, not true, so
  -- the check below never fired for a missing value — only for a wrong one.
  if public.setting_bool('require_adjustment_reason', true)
     and coalesce(nullif(btrim(p_payload ->> 'reason'), ''), '') = '' then
    raise exception 'adjustment_reason_required' using errcode = '22023';
  end if;
  if v_reason is not null
     and v_reason not in ('STOCK_COUNT', 'DAMAGED', 'LOST', 'FOUND', 'DATA_CORRECTION', 'OTHER') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if public.setting_bool('require_adjustment_notes', false)
     and coalesce(btrim(p_payload ->> 'notes'), '') = '' then
    raise exception 'adjustment_notes_required' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  perform 1
    from public.product_variants v
   where v.id in (select (value ->> 'variant_id')::uuid
                    from jsonb_array_elements(p_payload -> 'items'))
   order by v.id
   for update;

  insert into public.inventory_adjustments (
    adjustment_date, reason, notes, status, created_by
  )
  values (
    coalesce(nullif(p_payload ->> 'adjustment_date', '')::date, current_date),
    v_reason,
    nullif(btrim(p_payload ->> 'notes'), ''),
    'COMPLETED', v_actor
  )
  returning id, adjustment_number into v_adj_id, v_adj_no;

  for v_item in
    select jsonb_build_object(
             'variant_id', value ->> 'variant_id',
             'actual_quantity', max((value ->> 'actual_quantity')::integer),
             'reason', max(value ->> 'reason'))
    from jsonb_array_elements(p_payload -> 'items')
    group by value ->> 'variant_id'
    order by (value ->> 'variant_id')::uuid
  loop
    select v.id, v.sku, v.color, v.size, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid;
    if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;

    v_actual := (v_item ->> 'actual_quantity')::integer;
    if v_actual is null or v_actual < 0 then
      raise exception 'invalid_actual_quantity' using errcode = '22023';
    end if;

    select coalesce(sum(t.signed_quantity), 0) into v_system
      from public.inventory_transactions t
     where t.variant_id = v_variant.id and t.stock_state = 'AVAILABLE';

    v_diff := v_actual - v_system;

    insert into public.inventory_adjustment_items (
      adjustment_id, variant_id, system_quantity, actual_quantity, difference_quantity,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot, reason
    )
    values (
      v_adj_id, v_variant.id, v_system, v_actual, v_diff,
      v_variant.product_name, v_variant.sku, v_variant.color, v_variant.size,
      nullif(btrim(v_item ->> 'reason'), '')
    );

    if v_diff <> 0 then
      insert into public.inventory_transactions (
        variant_id, transaction_type, quantity, stock_state,
        reference_type, reference_id, notes, created_by
      )
      values (
        v_variant.id,
        case when v_diff > 0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end,
        abs(v_diff), 'AVAILABLE',
        'INVENTORY_ADJUSTMENT', v_adj_id,
        'تعديل مخزون ' || v_adj_no, v_actor
      );
    end if;

    if v_diff > 0 then v_inc := v_inc + v_diff; else v_dec := v_dec - v_diff; end if;
    v_count := v_count + 1;
  end loop;

  update public.inventory_adjustments
     set total_increase = v_inc, total_decrease = v_dec, items_count = v_count
   where id = v_adj_id;

  return jsonb_build_object(
    'id', v_adj_id, 'adjustment_number', v_adj_no, 'reason', v_reason,
    'items_count', v_count, 'total_increase', v_inc, 'total_decrease', v_dec
  );
end;
$fn$;
