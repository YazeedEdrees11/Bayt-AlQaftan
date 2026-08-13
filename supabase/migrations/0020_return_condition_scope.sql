-- =============================================================================
-- 0020 — Two corrections to 0019
--
-- The sweep that checks each setting both ways — on must refuse, off must
-- permit — caught both of these. Neither would have shown up by reading the
-- migration, and the first would have been severe.
--
-- 1. require_return_condition refused EVERY return.
--
--    I put the check inside pass 1 of create_sales_return, which does not
--    iterate the caller's items: it iterates a rebuilt object carrying only
--    `sale_item_id` and `quantity`, because that pass exists to sum quantities
--    per line. The condition is dropped there and restored in pass 2. So the
--    check could never see a condition, and with the setting at its default of
--    true it would have rejected every return in the shop with
--    `return_condition_required` — including returns that stated the condition
--    perfectly well. The validation now runs over the raw items, before pass 1.
--
-- 2. require_financial_adjustment_reason cannot be relaxed.
--
--    0019 made the reason conditional on the setting. But
--    `financial_adjustments.reason` is NOT NULL, so turning the setting off
--    replaced a clear "reason required" message with a raw constraint
--    violation. The reason is compulsory whatever the switch says, so the check
--    goes back to unconditional and the setting is marked read-only in the
--    screen — the same treatment as require_expense_category. A switch that
--    cannot change the outcome should say so rather than move.
-- =============================================================================

-- 1. RETURNS: validate the condition on what the caller actually sent.

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

  -- §33. Checked over the caller's own items, because the passes below iterate
  -- rebuilt objects that carry only what those passes need — the condition is
  -- not among them. Pass two defaults a missing condition to GOOD, which turns
  -- "we did not look" into "we checked and it was fine"; when the shop wants the
  -- condition recorded, it has to be stated.
  if public.setting_bool('require_return_condition', true)
     and exists (
       select 1 from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) item
        where coalesce(nullif(item.value ->> 'condition', ''), '') = ''
     ) then
    raise exception 'return_condition_required' using errcode = '22023';
  end if;

  if not public.setting_bool('allow_damaged_returns', true)
     and exists (
       select 1 from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) item
        where item.value ->> 'condition' = 'DAMAGED'
     ) then
    raise exception 'damaged_returns_not_accepted' using errcode = '42501';
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

-- 2. FINANCIAL ADJUSTMENTS: the reason is compulsory in the schema.

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
  -- financial_adjustments.reason is NOT NULL, so this cannot be relaxed by a
  -- setting: making it conditional only swapped a clear message for a constraint
  -- violation. The switch is shown read-only in the screen instead.
  if char_length(v_reason) < 3 then
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
