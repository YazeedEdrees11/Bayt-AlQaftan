-- =============================================================================
-- 0019 — The settings that were switches attached to nothing
--
-- 0017 fixed one rule that was enforced in one of the four places that decide
-- it. That prompted the obvious question: how many others? Cross-referencing
-- the thirty business-rule settings against every `setting_*()` call in the
-- schema answered it — fourteen were read by no code path at all. The screens
-- for them existed, the switches moved, the audit trail recorded the change,
-- and nothing whatsoever happened.
--
-- A switch that does nothing is worse than a missing feature: the owner turns
-- on «إلزام سبب الاستبدال», believes exchanges now carry reasons, and finds out
-- otherwise a quarter later when they go looking for one.
--
--   create_inventory_adjustment  require_adjustment_reason, require_adjustment_notes
--   cancel_purchase              require_purchase_cancellation_reason
--   create_sales_return          require_return_condition, allow_damaged_returns
--   create_exchange              allow_exchanges, require_exchange_reason,
--                                maximum_exchange_days,
--                                allow_customer_pays_difference,
--                                allow_customer_receives_difference
--   create_financial_transfer    require_transfer_notes
--   enforce_non_negative_account allow_negative_account_balance
--   create_financial_adjustment  require_financial_adjustment_reason
--   complete_sale                require_customer_for_credit  ← second path to
--                                completing a sale; create_sale checked it and
--                                this one did not, which is 0017 exactly again.
--
-- Two settings are deliberately left alone and marked read-only in the screens
-- instead: `allow_partial_receiving`, because partial receiving is not a
-- feature that exists to govern, and `require_expense_category`, because the
-- column is NOT NULL and a category is compulsory whatever the switch says.
-- =============================================================================

-- 1. INVENTORY ADJUSTMENTS (§23)

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
     and coalesce(btrim(v_reason), '') = '' then
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

-- 2. PURCHASE CANCELLATION (§30)

create or replace function public.cancel_purchase(
  p_purchase_id uuid,
  p_reason      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor    uuid := (select auth.uid());
  v_purchase record;
  v_item     record;
  v_stock    integer;
  v_blocked  text := null;
begin
  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to cancel purchases'
      using errcode = '42501';
  end if;

  -- §30. Same reasoning as a cancelled sale: a cancelled purchase with no
  -- stated reason is a hole nobody can account for later.
  if public.setting_bool('require_purchase_cancellation_reason', true)
     and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;

  select * into v_purchase
    from public.purchases
   where id = p_purchase_id
   for update;

  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_purchase.status <> 'COMPLETED' then
    raise exception 'purchase_not_cancellable' using errcode = '22023';
  end if;

  -- Refuse if any of the received goods have already left the shop: reversing
  -- would invent negative stock.
  for v_item in
    select i.variant_id, i.quantity, i.variant_sku_snapshot
      from public.purchase_items i
     where i.purchase_id = p_purchase_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t
     where t.variant_id = v_item.variant_id;

    if v_stock < v_item.quantity then
      v_blocked := coalesce(v_blocked || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_blocked is not null then
    raise exception 'stock_already_consumed: %', v_blocked using errcode = '22023';
  end if;

  for v_item in
    select i.variant_id, i.quantity
      from public.purchase_items i
     where i.purchase_id = p_purchase_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id,
      notes, created_by
    )
    values (
      v_item.variant_id, 'PURCHASE_REVERSAL', v_item.quantity,
      'PURCHASE_CANCELLATION', p_purchase_id,
      'إلغاء مشتريات ' || v_purchase.purchase_number, v_actor
    );
  end loop;

  insert into public.supplier_balance_transactions (
    supplier_id, transaction_type, amount, reference_type, reference_id,
    description, created_by
  )
  values (
    v_purchase.supplier_id, 'ADJUSTMENT', -v_purchase.total_amount,
    'PURCHASE_CANCELLATION', p_purchase_id,
    'إلغاء مشتريات ' || v_purchase.purchase_number, v_actor
  );

  update public.purchases
     set status        = 'CANCELLED',
         cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_purchase_id;

  return jsonb_build_object(
    'id', p_purchase_id,
    'purchase_number', v_purchase.purchase_number,
    'reversed_amount', v_purchase.total_amount,
    'paid_amount', v_purchase.paid_amount,
    -- > 0 means the supplier is holding money that belongs to the shop.
    'supplier_credit', v_purchase.paid_amount
  );
end;
$$;

-- 3. RETURNS (§33)

create or replace function public.create_sales_return(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor     uuid := (select auth.uid());
  v_sale_id   uuid := nullif(p_payload ->> 'sale_id', '')::uuid;
  v_sale      record;
  v_factor    numeric;
  v_return_id uuid;
  v_return_no text;
  v_item      jsonb;
  v_si        record;
  v_qty       integer;
  v_state     text;
  v_net       numeric(12,2);
  v_gross     numeric(12,2);
  v_cost      numeric(12,2);
  v_subtotal  numeric(12,2) := 0;
  v_refund    numeric(12,2) := 0;
  v_costtotal numeric(12,2) := 0;
  v_count     integer := 0;
  v_refunds   jsonb := p_payload -> 'refunds';
  v_rf        jsonb;
  v_ramount   numeric(12,2);
  v_rmethod   text;
  v_rtotal    numeric(12,2) := 0;
begin
  if not public.can_return() then
    raise exception 'forbidden: insufficient permission to create returns' using errcode = '42501';
  end if;

  if not public.setting_bool('allow_returns', true) then
    raise exception 'returns_disabled' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'sale_cancelled' using errcode = '22023';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_returnable' using errcode = '22023';
  end if;

  -- §34. The window is counted from the sale, and only applies to returns being
  -- created now: a return already recorded is history and is left alone.
  if public.setting_number('maximum_return_days', 0) > 0
     and coalesce(nullif(p_payload ->> 'return_date', '')::date, current_date)
         > v_sale.sale_date + (public.setting_number('maximum_return_days', 30) || ' days')::interval then
    raise exception 'return_period_expired: sold %, limit % days',
      v_sale.sale_date, public.setting_number('maximum_return_days', 30)
      using errcode = '22023';
  end if;

  -- §33. A reason is worth requiring because it is the only field that explains
  -- why the shop lost the sale.
  if public.setting_bool('require_return_reason', true)
     and coalesce(btrim(p_payload ->> 'reason'), '') = '' then
    raise exception 'return_reason_required' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  -- Lock every variant involved, ascending, before any write touches them.
  -- Same discipline as 0006: one order for everyone, locks taken up front.
  perform 1
    from public.product_variants v
   where v.id in (
     select si.variant_id from public.sale_items si
      where si.id in (
        select (value ->> 'sale_item_id')::uuid from jsonb_array_elements(p_payload -> 'items')
      )
   )
   order by v.id
   for update;

  -- The sale's discount belongs to the line in proportion to its value, so the
  -- refund is what the customer actually paid for the piece, not its list price.
  v_factor := case when v_sale.subtotal > 0
                then (v_sale.subtotal - v_sale.discount) / v_sale.subtotal
                else 1 end;

  -- Pass 1: nothing may exceed what is still returnable, counting every earlier
  -- return AND every exchange that already took the piece back.
  for v_item in
    select jsonb_build_object(
             'sale_item_id', value ->> 'sale_item_id',
             'quantity', sum((value ->> 'quantity')::integer))
    from jsonb_array_elements(p_payload -> 'items')
    group by value ->> 'sale_item_id'
  loop
    select si.sale_id, si.variant_sku_snapshot, sir.returnable_quantity
      into v_si
      from public.sale_items si
      join public.sale_item_returns sir on sir.sale_item_id = si.id
     where si.id = (v_item ->> 'sale_item_id')::uuid;

    if not found then raise exception 'sale_item_not_found' using errcode = 'P0002'; end if;
    if v_si.sale_id <> v_sale_id then
      raise exception 'sale_item_mismatch' using errcode = '22023';
    end if;

    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    -- §33. Pass two defaults a missing condition to GOOD, which quietly turns
    -- "we did not look" into "we checked and it was fine". When the shop wants
    -- the condition recorded, it has to be stated.
    if public.setting_bool('require_return_condition', true)
       and coalesce(nullif(v_item ->> 'condition', ''), '') = '' then
      raise exception 'return_condition_required' using errcode = '22023';
    end if;
    if v_item ->> 'condition' = 'DAMAGED'
       and not public.setting_bool('allow_damaged_returns', true) then
      raise exception 'damaged_returns_not_accepted' using errcode = '42501';
    end if;
    if v_si.returnable_quantity <= 0 then
      raise exception 'nothing_returnable: %', v_si.variant_sku_snapshot using errcode = '22023';
    end if;
    if v_qty > v_si.returnable_quantity then
      raise exception 'return_exceeds_sold: % (% متاح)', v_si.variant_sku_snapshot, v_si.returnable_quantity
        using errcode = '22023';
    end if;
  end loop;

  insert into public.sales_returns (
    sale_id, customer_id, return_date, reason, notes, status, created_by
  )
  values (
    v_sale_id, v_sale.customer_id,
    coalesce(nullif(p_payload ->> 'return_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'reason'), ''),
    nullif(btrim(p_payload ->> 'notes'), ''),
    'COMPLETED', v_actor
  )
  returning id, return_number into v_return_id, v_return_no;

  -- Pass 2: write the lines. Good and damaged pieces of the same sale line stay
  -- separate rows because they land in different stock buckets.
  for v_item in
    select jsonb_build_object(
             'sale_item_id', value ->> 'sale_item_id',
             'condition', coalesce(nullif(value ->> 'condition', ''), 'GOOD'),
             'quantity', sum((value ->> 'quantity')::integer),
             'reason', max(value ->> 'reason'))
    from jsonb_array_elements(p_payload -> 'items')
    group by value ->> 'sale_item_id', coalesce(nullif(value ->> 'condition', ''), 'GOOD')
    order by (value ->> 'sale_item_id')::uuid
  loop
    select si.* into v_si from public.sale_items si
     where si.id = (v_item ->> 'sale_item_id')::uuid;

    v_qty   := (v_item ->> 'quantity')::integer;
    v_gross := round(v_qty * v_si.unit_price, 2);
    v_net   := round(v_qty * v_si.unit_price * v_factor, 2);
    v_cost  := round(v_qty * v_si.unit_cost, 2);

    if (v_item ->> 'condition') not in ('GOOD', 'DAMAGED') then
      raise exception 'invalid_condition' using errcode = '22023';
    end if;

    insert into public.sales_return_items (
      return_id, sale_item_id, variant_id, quantity, unit_price, unit_cost,
      total_amount, total_cost, condition,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot, reason
    )
    values (
      v_return_id, v_si.id, v_si.variant_id, v_qty, v_si.unit_price, v_si.unit_cost,
      v_net, v_cost, v_item ->> 'condition',
      v_si.product_name_snapshot, v_si.variant_sku_snapshot,
      v_si.color_snapshot, v_si.size_snapshot,
      nullif(btrim(v_item ->> 'reason'), '')
    );

    -- Damaged goods are recorded, but into the damaged bucket: they are back in
    -- the building and accounted for, and they can never be sold.
    v_state := case when v_item ->> 'condition' = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end;

    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_si.variant_id, 'SALE_RETURN', v_qty, v_state,
      'SALES_RETURN', v_return_id, 'مرتجع ' || v_return_no, v_actor
    );

    v_subtotal  := v_subtotal + v_gross;
    v_refund    := v_refund + v_net;
    v_costtotal := v_costtotal + v_cost;
    v_count     := v_count + 1;
  end loop;

  update public.sales_returns
     set subtotal = v_subtotal,
         discount = round(v_subtotal - v_refund, 2),
         refund_amount = v_refund,
         total_cost = v_costtotal
   where id = v_return_id;

  -- The return itself reduces what the customer owes. Money handed back is a
  -- separate, opposite movement recorded below.
  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'SALE_RETURN', v_refund, 'SALES_RETURN', v_return_id,
            'مرتجع ' || v_return_no, v_actor);
  end if;

  -- Refunds are the money side, so they need the manager permission even when a
  -- staff member is the one taking the goods back (§51).
  if v_refunds is not null and jsonb_typeof(v_refunds) = 'array'
     and jsonb_array_length(v_refunds) > 0 then
    if not public.can_manage_returns() then
      raise exception 'forbidden: insufficient permission to issue refunds' using errcode = '42501';
    end if;

    for v_rf in select * from jsonb_array_elements(v_refunds) loop
      v_ramount := coalesce(nullif(v_rf ->> 'amount', '')::numeric, 0);
      v_rmethod := coalesce(v_rf ->> 'refund_method', 'CASH');
      if v_ramount <= 0 then continue; end if;

      if v_rmethod not in ('CASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT') then
        raise exception 'invalid_refund_method' using errcode = '22023';
      end if;
      -- §35. A method that has been switched off cannot be used by a new
      -- refund. Refunds already issued through it stay exactly as they are.
      if (v_rmethod = 'CASH' and not public.setting_bool('allow_cash_refund', true))
         or (v_rmethod = 'BANK_TRANSFER' and not public.setting_bool('allow_bank_refund', true))
         or (v_rmethod = 'CUSTOMER_CREDIT'
             and not public.setting_bool('allow_customer_credit_refund', true)) then
        raise exception 'refund_method_disabled: %', v_rmethod using errcode = '42501';
      end if;
      if v_rmethod = 'CUSTOMER_CREDIT' and v_sale.customer_id is null then
        raise exception 'credit_requires_customer' using errcode = '22023';
      end if;
      if v_rmethod = 'BANK_TRANSFER'
         and (coalesce(btrim(v_rf ->> 'bank_name'), '') = ''
              or coalesce(btrim(v_rf ->> 'transfer_reference'), '') = '') then
        raise exception 'bank_details_required' using errcode = '22023';
      end if;

      v_rtotal := v_rtotal + v_ramount;
      if v_rtotal > v_refund then
        raise exception 'refund_exceeds_return' using errcode = '22023';
      end if;

      insert into public.return_refunds (
        return_id, refund_method, amount, refund_date,
        bank_name, transfer_reference, receipt_image_path, notes, created_by
      )
      values (
        v_return_id, v_rmethod, v_ramount,
        coalesce(nullif(v_rf ->> 'refund_date', '')::date, current_date),
        nullif(btrim(v_rf ->> 'bank_name'), ''),
        nullif(btrim(v_rf ->> 'transfer_reference'), ''),
        nullif(btrim(v_rf ->> 'receipt_image_path'), ''),
        nullif(btrim(v_rf ->> 'notes'), ''),
        v_actor
      );

      -- Only money that physically leaves settles the credit. A CUSTOMER_CREDIT
      -- refund is the credit itself, already posted by the return above.
      if v_rmethod in ('CASH', 'BANK_TRANSFER') then
        if v_sale.customer_id is not null then
          insert into public.customer_balance_transactions (
            customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
          )
          values (v_sale.customer_id, 'REFUND', v_ramount, 'SALES_RETURN', v_return_id,
                  'استرداد على المرتجع ' || v_return_no, v_actor);
        end if;
      end if;
    end loop;
  end if;

  perform public.refresh_return_refund_status(v_return_id);

  return (
    select jsonb_build_object(
      'id', r.id, 'return_number', r.return_number, 'sale_id', r.sale_id,
      'sale_number', v_sale.sale_number,
      'status', r.status, 'refund_status', r.refund_status,
      'subtotal', r.subtotal, 'discount', r.discount,
      'refund_amount', r.refund_amount, 'refunded_amount', r.refunded_amount,
      'total_cost', r.total_cost,
      'profit_reversal', round(r.refund_amount - r.total_cost, 2),
      'item_count', v_count
    )
    from public.sales_returns r where r.id = v_return_id
  );
end;
$fn$;

-- 4. EXCHANGES (§36)

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
    sale_id, customer_id, exchange_date, notes, status, created_by
  )
  values (
    v_sale_id, v_sale.customer_id,
    coalesce(nullif(p_payload ->> 'exchange_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
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

-- 5. TRANSFERS (§37)

create or replace function public.create_financial_transfer(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_id     uuid;
  v_number text;
  v_from   uuid := nullif(p_payload ->> 'from_account_id', '')::uuid;
  v_to     uuid := nullif(p_payload ->> 'to_account_id', '')::uuid;
  v_amount numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_date   date := coalesce(nullif(p_payload ->> 'transfer_date', '')::date, current_date);
begin
  if not public.can_manage_finance() then
    raise exception 'forbidden: insufficient permission to transfer funds' using errcode = '42501';
  end if;
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_from is null or v_to is null then
    raise exception 'account_required' using errcode = '22023';
  end if;
  if v_from = v_to then raise exception 'same_account' using errcode = '22023'; end if;

  -- §37. Money moving between the shop's own accounts leaves no other trace of
  -- why it moved.
  if public.setting_bool('require_transfer_notes', false)
     and coalesce(btrim(p_payload ->> 'notes'), '') = '' then
    raise exception 'transfer_notes_required' using errcode = '22023';
  end if;

  perform 1 from public.financial_accounts where id = v_from and is_active;
  if not found then raise exception 'financial_account_not_found' using errcode = 'P0002'; end if;
  perform 1 from public.financial_accounts where id = v_to and is_active;
  if not found then raise exception 'financial_account_not_found' using errcode = 'P0002'; end if;

  insert into public.financial_transfers (transfer_date, from_account_id, to_account_id, amount, notes, created_by)
  values (v_date, v_from, v_to, v_amount, nullif(btrim(p_payload ->> 'notes'), ''), v_actor)
  returning id, transfer_number into v_id, v_number;

  -- OUT first, so an underfunded source aborts before anything is credited.
  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (v_date, 'TRANSFER_OUT', v_from, v_amount, 'OUT', 'TRANSFER', v_id,
          'تحويل داخلي ' || v_number, v_actor);

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (v_date, 'TRANSFER_IN', v_to, v_amount, 'IN', 'TRANSFER', v_id,
          'تحويل داخلي ' || v_number, v_actor);

  return jsonb_build_object('id', v_id, 'transfer_number', v_number, 'amount', v_amount);
end;
$fn$;

-- 6. ACCOUNT BALANCES (§37)

create or replace function public.enforce_non_negative_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(12,2);
  v_name    text;
begin
  if new.direction <> 'OUT' then return new; end if;

  -- §37. The mirror of allow_negative_stock, and enforced in the same place: the
  -- one trigger every outgoing movement passes through.
  if public.setting_bool('allow_negative_account_balance', false) then
    return new;
  end if;
  if coalesce(current_setting('app.finance_backfill', true), 'off') = 'on' then
    return new;
  end if;

  perform 1 from public.financial_accounts where id = new.financial_account_id for update;

  select coalesce(sum(t.signed_amount), 0), max(a.name)
    into v_balance, v_name
    from public.financial_accounts a
    left join public.financial_transactions t on t.financial_account_id = a.id
   where a.id = new.financial_account_id;

  if v_balance - new.amount < 0 then
    raise exception 'insufficient_funds: % (الرصيد % والمطلوب %)', v_name, v_balance, new.amount
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- 7. FINANCIAL ADJUSTMENTS (§37)

create or replace function public.create_financial_adjustment(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_id      uuid;
  v_number  text;
  v_amount  numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_dir     text := upper(coalesce(p_payload ->> 'direction', ''));
  v_account uuid := nullif(p_payload ->> 'financial_account_id', '')::uuid;
  v_reason  text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_date    date := coalesce(nullif(p_payload ->> 'adjustment_date', '')::date, current_date);
begin
  -- §66: correcting the ledger by hand is the one operation that can make the
  -- books say anything at all, so it is the owner's alone.
  if not public.can_administer_finance() then
    raise exception 'forbidden: only an administrator may adjust the ledger' using errcode = '42501';
  end if;
  -- §39. Hand-correcting the ledger can make the books say anything, so it is
  -- off unless an owner deliberately turns it on — and even then only for an
  -- administrator, which can_administer_finance() already required above.
  if not public.setting_bool('allow_financial_adjustments', false) then
    raise exception 'financial_adjustments_disabled' using errcode = '42501';
  end if;
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_dir not in ('IN', 'OUT') then raise exception 'invalid_direction' using errcode = '22023'; end if;
  -- §37. The reason was compulsory whatever the setting said, which made the
  -- switch a decoration. It now means what it reads as.
  if public.setting_bool('require_financial_adjustment_reason', true)
     and char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  perform 1 from public.financial_accounts where id = v_account and is_active;
  if not found then raise exception 'financial_account_not_found' using errcode = 'P0002'; end if;

  insert into public.financial_adjustments (
    adjustment_date, financial_account_id, amount, direction, reason, notes, created_by
  )
  values (v_date, v_account, v_amount, v_dir, v_reason,
          nullif(btrim(p_payload ->> 'notes'), ''), v_actor)
  returning id, adjustment_number into v_id, v_number;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (v_date, 'ADJUSTMENT', v_account, v_amount, v_dir, 'FINANCIAL_ADJUSTMENT', v_id,
          'تعديل مالي — ' || v_reason, v_actor);

  return jsonb_build_object('id', v_id, 'adjustment_number', v_number,
                            'amount', v_amount, 'direction', v_dir);
end;
$fn$;

-- 8. COMPLETING A DRAFT SALE (§26)

create or replace function public.complete_sale(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_sale_id uuid := (p_payload ->> 'sale_id')::uuid;
  v_status  text;
  v_count   integer;
  v_sale    record;
  v_paid    numeric(12,2);
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to complete sales' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  v_status := v_sale.status;
  if v_status <> 'DRAFT' then raise exception 'sale_not_draft' using errcode = '22023'; end if;

  select count(*) into v_count from public.sale_items where sale_id = v_sale_id;
  if v_count = 0 then raise exception 'no_items' using errcode = '22023'; end if;

  -- §26. create_sale checks this and this function did not, so a draft with no
  -- customer could be completed unpaid and become a debt owed by nobody. The
  -- same shape of gap as 0017: two paths, one question, one of them asking it.
  if v_sale.customer_id is null
     and public.setting_bool('require_customer_for_credit', true) then
    select coalesce(sum(coalesce(nullif(value ->> 'amount', '')::numeric, 0)), 0)
      into v_paid
      from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb));
    if v_paid < v_sale.total_amount then
      raise exception 'customer_required_for_credit' using errcode = '22023';
    end if;
  end if;

  return public.apply_sale_completion(v_sale_id, p_payload -> 'payments', v_actor)
         || jsonb_build_object('item_count', v_count);
end;
$$;
