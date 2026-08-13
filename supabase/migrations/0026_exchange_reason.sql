-- =============================================================================
-- 0026 — the exchange nobody could make
-- =============================================================================
--
-- `require_exchange_reason` ships switched on, and since 0019 `create_exchange`
-- has refused any payload whose `reason` is empty. Nothing ever sent one: the
-- form does not collect a reason, the action does not pass one, and the
-- `exchanges` table has nowhere to put one. With the settings as delivered,
-- every exchange in the shop failed.
--
-- This is the same shape of mistake as 0020 and 0021, and it is worth naming
-- once more: a rule was attached to a field that did not exist. 0020 and 0021
-- were a check reading a *defaulted* value instead of the absent one; this is a
-- check reading an absent value that was never going to arrive. Both come from
-- writing the enforcement and the input at different times, and the only thing
-- that catches either is running the rule end to end from the screen — which is
-- what the go-live simulation finally did.
--
-- The reasons are the return reasons. An exchange is a return and a sale in one
-- movement, the customer's answer to "why?" is the same answer, and a second
-- list would only drift from the first.
-- =============================================================================

alter table public.exchanges
  add column if not exists reason text null;

comment on column public.exchanges.reason is
  'Why the customer swapped. Required when require_exchange_reason is on, which is the default.';

alter table public.exchanges drop constraint if exists exchanges_reason_check;
alter table public.exchanges add constraint exchanges_reason_check
  check (reason is null or reason in (
    'CUSTOMER_CHANGED_MIND', 'WRONG_SIZE', 'WRONG_COLOR', 'DEFECTIVE_PRODUCT',
    'DAMAGED_PRODUCT', 'WRONG_PRODUCT', 'QUALITY_ISSUE', 'OTHER'
  ));

-- Unchanged from 0019 but for the two lines that store the reason. The guard
-- that demands it was already there; it now has somewhere to write the answer.

create or replace function public.create_exchange(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor      uuid := (select auth.uid());
  v_sale_id    uuid := nullif(p_payload ->> 'sale_id', '')::uuid;
  v_sale       record;
  v_factor     numeric;
  v_exc_id     uuid;
  v_exc_no     text;
  v_item       jsonb;
  v_si         record;
  v_variant    record;
  v_qty        integer;
  v_stock      integer;
  v_short      text := null;
  v_ret_total  numeric(12,2) := 0;
  v_ret_cost   numeric(12,2) := 0;
  v_new_total  numeric(12,2) := 0;
  v_new_cost   numeric(12,2) := 0;
  v_diff       numeric(12,2);
  v_direction  text;
  v_method     text := nullif(btrim(p_payload ->> 'settlement_method'), '');
begin
  if not public.can_return() then
    raise exception 'forbidden: insufficient permission to create exchanges' using errcode = '42501';
  end if;

  -- §36. Exchanges had a settings screen and no enforcement whatsoever.
  if not public.setting_bool('allow_exchanges', true) then
    raise exception 'exchanges_disabled' using errcode = '42501';
  end if;
  if public.setting_bool('require_exchange_reason', true)
     and coalesce(btrim(p_payload ->> 'reason'), '') = '' then
    raise exception 'exchange_reason_required' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'sale_cancelled' using errcode = '22023';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_returnable' using errcode = '22023';
  end if;

  -- §36. Counted from the sale, like the return window, and applied only to
  -- exchanges being created now.
  if public.setting_number('maximum_exchange_days', 0) > 0
     and coalesce(nullif(p_payload ->> 'exchange_date', '')::date, current_date)
         > v_sale.sale_date
           + (public.setting_number('maximum_exchange_days', 30) || ' days')::interval then
    raise exception 'exchange_period_expired: sold %, limit % days',
      v_sale.sale_date, public.setting_number('maximum_exchange_days', 30)
      using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'returned_items', '[]'::jsonb)) = 0
     or jsonb_array_length(coalesce(p_payload -> 'new_items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  -- Every variant on both legs, locked ascending, before anything is written.
  perform 1
    from public.product_variants v
   where v.id in (
     select si.variant_id from public.sale_items si
      where si.id in (select (value ->> 'sale_item_id')::uuid
                        from jsonb_array_elements(p_payload -> 'returned_items'))
     union
     select (value ->> 'variant_id')::uuid
       from jsonb_array_elements(p_payload -> 'new_items')
   )
   order by v.id
   for update;

  v_factor := case when v_sale.subtotal > 0
                then (v_sale.subtotal - v_sale.discount) / v_sale.subtotal
                else 1 end;

  -- Validate the returned leg.
  for v_item in
    select jsonb_build_object('sale_item_id', value ->> 'sale_item_id',
                              'quantity', sum((value ->> 'quantity')::integer))
    from jsonb_array_elements(p_payload -> 'returned_items')
    group by value ->> 'sale_item_id'
  loop
    select si.sale_id, si.variant_sku_snapshot, sir.returnable_quantity
      into v_si
      from public.sale_items si
      join public.sale_item_returns sir on sir.sale_item_id = si.id
     where si.id = (v_item ->> 'sale_item_id')::uuid;

    if not found then raise exception 'sale_item_not_found' using errcode = 'P0002'; end if;
    if v_si.sale_id <> v_sale_id then raise exception 'sale_item_mismatch' using errcode = '22023'; end if;

    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    if v_qty > v_si.returnable_quantity then
      raise exception 'return_exceeds_sold: % (% متاح)', v_si.variant_sku_snapshot, v_si.returnable_quantity
        using errcode = '22023';
    end if;
  end loop;

  -- Validate the WHOLE new leg before a single unit moves: an exchange is never
  -- half-done (§36).
  for v_item in
    select jsonb_build_object('variant_id', value ->> 'variant_id',
                              'quantity', sum((value ->> 'quantity')::integer))
    from jsonb_array_elements(p_payload -> 'new_items')
    group by value ->> 'variant_id'
  loop
    select v.id, v.sku, v.is_active into v_variant
      from public.product_variants v where v.id = (v_item ->> 'variant_id')::uuid;
    if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;
    if not v_variant.is_active then
      raise exception 'variant_inactive: %', v_variant.sku using errcode = 'P0002';
    end if;

    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t
     where t.variant_id = v_variant.id and t.stock_state = 'AVAILABLE';

    if v_stock < v_qty then
      v_short := coalesce(v_short || ', ', '') || v_variant.sku;
    end if;
  end loop;

  -- §21. Checked here as well as in the trigger: this function validates the
  -- whole basket up front, so it would otherwise refuse before the trigger ever
  -- ran and the setting would appear to do nothing.
  if v_short is not null
     and not public.setting_bool('allow_negative_stock', false) then
    raise exception 'insufficient_stock: %', v_short using errcode = '22023';
  end if;

  insert into public.exchanges (
    sale_id, customer_id, exchange_date, notes, reason, status, created_by
  )
  values (
    v_sale_id, v_sale.customer_id,
    coalesce(nullif(p_payload ->> 'exchange_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
    nullif(btrim(p_payload ->> 'reason'), ''),
    'COMPLETED', v_actor
  )
  returning id, exchange_number into v_exc_id, v_exc_no;

  -- Returned leg: back on the shelf, or into the damaged bucket.
  for v_item in
    select jsonb_build_object(
             'sale_item_id', value ->> 'sale_item_id',
             'condition', coalesce(nullif(value ->> 'condition', ''), 'GOOD'),
             'quantity', sum((value ->> 'quantity')::integer))
    from jsonb_array_elements(p_payload -> 'returned_items')
    group by value ->> 'sale_item_id', coalesce(nullif(value ->> 'condition', ''), 'GOOD')
    order by (value ->> 'sale_item_id')::uuid
  loop
    select si.* into v_si from public.sale_items si
     where si.id = (v_item ->> 'sale_item_id')::uuid;

    v_qty := (v_item ->> 'quantity')::integer;

    insert into public.exchange_items (
      exchange_id, item_type, sale_item_id, variant_id, quantity,
      unit_price, unit_cost, total_amount, condition,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot
    )
    values (
      v_exc_id, 'RETURNED', v_si.id, v_si.variant_id, v_qty,
      v_si.unit_price, v_si.unit_cost,
      round(v_qty * v_si.unit_price * v_factor, 2),
      v_item ->> 'condition',
      v_si.product_name_snapshot, v_si.variant_sku_snapshot,
      v_si.color_snapshot, v_si.size_snapshot
    );

    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_si.variant_id, 'EXCHANGE_IN', v_qty,
      case when v_item ->> 'condition' = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end,
      'EXCHANGE', v_exc_id, 'استبدال ' || v_exc_no, v_actor
    );

    v_ret_total := v_ret_total + round(v_qty * v_si.unit_price * v_factor, 2);
    v_ret_cost  := v_ret_cost + round(v_qty * v_si.unit_cost, 2);
  end loop;

  -- New leg: out of available stock.
  for v_item in
    select jsonb_build_object(
             'variant_id', value ->> 'variant_id',
             'quantity', sum((value ->> 'quantity')::integer),
             'unit_price', max((value ->> 'unit_price')::numeric))
    from jsonb_array_elements(p_payload -> 'new_items')
    group by value ->> 'variant_id'
    order by (value ->> 'variant_id')::uuid
  loop
    select v.id, v.sku, v.color, v.size, v.selling_price, v.purchase_price, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid;

    v_qty := (v_item ->> 'quantity')::integer;

    insert into public.exchange_items (
      exchange_id, item_type, sale_item_id, variant_id, quantity,
      unit_price, unit_cost, total_amount, condition,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot
    )
    values (
      v_exc_id, 'NEW', null, v_variant.id, v_qty,
      coalesce((v_item ->> 'unit_price')::numeric, v_variant.selling_price),
      v_variant.purchase_price,
      round(v_qty * coalesce((v_item ->> 'unit_price')::numeric, v_variant.selling_price), 2),
      'GOOD',
      v_variant.product_name, v_variant.sku, v_variant.color, v_variant.size
    );

    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_variant.id, 'EXCHANGE_OUT', v_qty, 'AVAILABLE',
      'EXCHANGE', v_exc_id, 'استبدال ' || v_exc_no, v_actor
    );

    v_new_total := v_new_total
      + round(v_qty * coalesce((v_item ->> 'unit_price')::numeric, v_variant.selling_price), 2);
    v_new_cost := v_new_cost + round(v_qty * v_variant.purchase_price, 2);
  end loop;

  v_diff := round(v_new_total - v_ret_total, 2);
  v_direction := case when v_diff > 0 then 'CUSTOMER_PAYS'
                      when v_diff < 0 then 'CUSTOMER_RECEIVES'
                      else 'EVEN' end;

  -- §36. A shop that will not collect a difference, or will not hand one back,
  -- says so here; the exchange is refused rather than silently rounded.
  if v_direction = 'CUSTOMER_PAYS'
     and not public.setting_bool('allow_customer_pays_difference', true) then
    raise exception 'exchange_difference_not_collectable' using errcode = '42501';
  end if;
  if v_direction = 'CUSTOMER_RECEIVES'
     and not public.setting_bool('allow_customer_receives_difference', true) then
    raise exception 'exchange_difference_not_refundable' using errcode = '42501';
  end if;

  if v_direction = 'EVEN' then
    v_method := null;
  else
    v_method := coalesce(v_method, 'CASH');
    if v_method not in ('CASH', 'BANK_TRANSFER', 'CUSTOMER_BALANCE', 'CUSTOMER_CREDIT') then
      raise exception 'invalid_refund_method' using errcode = '22023';
    end if;
    if v_method in ('CUSTOMER_BALANCE', 'CUSTOMER_CREDIT') and v_sale.customer_id is null then
      raise exception 'credit_requires_customer' using errcode = '22023';
    end if;
    if v_method = 'BANK_TRANSFER'
       and (coalesce(btrim(p_payload ->> 'bank_name'), '') = ''
            or coalesce(btrim(p_payload ->> 'transfer_reference'), '') = '') then
      raise exception 'bank_details_required' using errcode = '22023';
    end if;
  end if;

  update public.exchanges
     set returned_amount = v_ret_total, new_items_amount = v_new_total,
         difference_amount = abs(v_diff), difference_direction = v_direction,
         returned_cost = v_ret_cost, new_items_cost = v_new_cost,
         settlement_method = v_method,
         bank_name = case when v_method = 'BANK_TRANSFER'
                          then nullif(btrim(p_payload ->> 'bank_name'), '') end,
         transfer_reference = case when v_method = 'BANK_TRANSFER'
                                   then nullif(btrim(p_payload ->> 'transfer_reference'), '') end,
         receipt_image_path = case when v_method = 'BANK_TRANSFER'
                                   then nullif(btrim(p_payload ->> 'receipt_image_path'), '') end
   where id = v_exc_id;

  -- Both legs are posted to the account so the customer's statement reads as
  -- what actually happened, and the settlement then squares the difference.
  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'SALE_RETURN', v_ret_total, 'EXCHANGE', v_exc_id,
            'مرتجع الاستبدال ' || v_exc_no, v_actor);

    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'SALE', v_new_total, 'EXCHANGE', v_exc_id,
            'بديل الاستبدال ' || v_exc_no, v_actor);

    if v_direction = 'CUSTOMER_PAYS' and v_method in ('CASH', 'BANK_TRANSFER') then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_sale.customer_id, 'PAYMENT', abs(v_diff), 'EXCHANGE', v_exc_id,
              'فرق الاستبدال ' || v_exc_no, v_actor);
    elsif v_direction = 'CUSTOMER_RECEIVES' and v_method in ('CASH', 'BANK_TRANSFER') then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_sale.customer_id, 'REFUND', abs(v_diff), 'EXCHANGE', v_exc_id,
              'فرق الاستبدال ' || v_exc_no, v_actor);
    end if;
  end if;

  return jsonb_build_object(
    'id', v_exc_id, 'exchange_number', v_exc_no, 'sale_number', v_sale.sale_number,
    'returned_amount', v_ret_total, 'new_items_amount', v_new_total,
    'difference_amount', abs(v_diff), 'difference_direction', v_direction,
    'settlement_method', v_method, 'status', 'COMPLETED'
  );
end;
$fn$;
