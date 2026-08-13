-- =============================================================================
-- 0016 — Business rules, notifications and the audit reader (Phase 8)
--
-- 0015 stored the settings. This one makes them bite.
--
-- Every rule below is enforced inside the SECURITY DEFINER function that owns
-- the write, which is the only place it can be enforced honestly: a discount
-- ceiling checked in the browser is a suggestion, and the API is right there.
-- The function bodies are the ones Phases 1-7 verified, carried across intact
-- with the settings check inserted — not rewritten, because they work.
--
-- Contents:
--   1  numbering prefixes read from settings, history left alone
--   2  negative stock, at the one trigger every movement passes through
--   3  sales: walk-in, manual discount, discount ceiling, credit customer
--   4  sale cancellation: allowed at all, and the reason
--   5  returns: window, reason, and which refund methods are open
--   6  expenses: receipt required
--   7  financial adjustments: off unless deliberately enabled
--   8  purchases: supplier required
--   9  notifications, generated from the same rules the reports use
--  10  data statistics (counts only, §64/§65)
--  11  audit log reader
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NUMBERING (§62, §63)
--
-- The prefix is read at the moment a number is issued, so changing it affects
-- only documents created afterwards. SAL-000123 stays SAL-000123 forever — the
-- sequence is untouched, and nothing rewrites a number that has been printed,
-- quoted on the phone or written on a customer's copy.
-- -----------------------------------------------------------------------------

create or replace function public.next_sale_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_sale', 'SAL-')
      || lpad(nextval('public.sale_number_seq')::text, 6, '0');
$$;

create or replace function public.next_purchase_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_purchase', 'PUR-')
      || lpad(nextval('public.purchase_number_seq')::text, 6, '0');
$$;

create or replace function public.next_return_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_return', 'RET-')
      || lpad(nextval('public.return_number_seq')::text, 6, '0');
$$;

create or replace function public.next_exchange_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_exchange', 'EXC-')
      || lpad(nextval('public.exchange_number_seq')::text, 6, '0');
$$;

create or replace function public.next_expense_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_expense', 'EXP-')
      || lpad(nextval('public.expense_number_seq')::text, 6, '0');
$$;

create or replace function public.next_account_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_account', 'ACC-')
      || lpad(nextval('public.account_number_seq')::text, 6, '0');
$$;

create or replace function public.next_financial_transaction_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_financial', 'FIN-')
      || lpad(nextval('public.financial_transaction_seq')::text, 6, '0');
$$;

create or replace function public.next_transfer_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_transfer', 'TRF-')
      || lpad(nextval('public.transfer_number_seq')::text, 6, '0');
$$;

create or replace function public.next_closing_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_closing', 'CLS-')
      || lpad(nextval('public.closing_number_seq')::text, 6, '0');
$$;

create or replace function public.next_adjustment_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_adjustment', 'ADJ-')
      || lpad(nextval('public.adjustment_number_seq')::text, 6, '0');
$$;

create or replace function public.next_customer_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_customer', 'CUS-')
      || lpad(nextval('public.customer_number_seq')::text, 6, '0');
$$;

create or replace function public.next_financial_adjustment_number()
returns text language sql volatile set search_path = '' as $$
  select public.setting_text('prefix_financial_adjustment', 'FAD-')
      || lpad(nextval('public.financial_adjustment_seq')::text, 6, '0');
$$;


-- -----------------------------------------------------------------------------
-- 2. NEGATIVE STOCK (§21, §88)
-- -----------------------------------------------------------------------------

create or replace function public.enforce_non_negative_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  if public.inventory_direction(new.transaction_type) > 0 then
    return new;   -- increases can never drive a balance below zero
  end if;

  -- §21. Selling stock you do not have is refused by default; an owner who
  -- knows their counts run behind their sales can allow it. The check lives
  -- here, in the one trigger every stock movement passes through, so no write
  -- path can obey the setting while another quietly ignores it.
  if public.setting_bool('allow_negative_stock', false) then
    return new;
  end if;

  -- Lock the variant row so two concurrent withdrawals cannot both pass.
  perform 1 from public.product_variants where id = new.variant_id for update;

  select coalesce(sum(t.signed_quantity), 0)
    into v_current
    from public.inventory_transactions t
   where t.variant_id = new.variant_id
     and t.stock_state = new.stock_state;

  if v_current - new.quantity < 0 then
    raise exception 'insufficient_stock: current %, requested %', v_current, new.quantity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. SALES (§25, §26, §27, §87)
-- -----------------------------------------------------------------------------

create or replace function public.create_sale(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_customer_id uuid := nullif(p_payload ->> 'customer_id', '')::uuid;
  v_status      text := upper(coalesce(nullif(p_payload ->> 'status', ''), 'COMPLETED'));
  v_sale_id     uuid;
  v_sale_no     text;
  v_item        jsonb;
  v_variant     record;
  v_qty         integer;
  v_price       numeric(12,2);
  v_cost        numeric(12,2);
  v_subtotal    numeric(12,2) := 0;
  v_costtotal   numeric(12,2) := 0;
  v_discount    numeric(12,2) := coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0);
  v_total       numeric(12,2);
  v_count       integer := 0;
  v_maxdisc     numeric(5,2);
  v_discpct     numeric(6,2);
  v_paid        numeric(12,2);
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to create sales' using errcode = '42501';
  end if;
  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  -- §27. A shop that wants every sale attached to a named customer says so
  -- here rather than relying on the salesperson to remember.
  if v_customer_id is null and not public.setting_bool('allow_walk_in_sales', true) then
    raise exception 'walk_in_sales_disabled' using errcode = '22023';
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id = v_customer_id and is_active;
    if not found then
      raise exception 'customer_not_found' using errcode = 'P0002';
    end if;
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  insert into public.sales (customer_id, sale_date, notes, status, created_by)
  values (
    v_customer_id,
    coalesce(nullif(p_payload ->> 'sale_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
    'DRAFT',
    v_actor
  )
  returning id, sale_number into v_sale_id, v_sale_no;

  -- Duplicate lines for the same variant are merged rather than stored twice.
  -- Walked in ascending variant_id so that concurrent baskets always contend
  -- for the same rows in the same order (see the header note).
  for v_item in
    select jsonb_build_object(
             'variant_id', value ->> 'variant_id',
             'quantity', sum((value ->> 'quantity')::integer),
             'unit_price', max((value ->> 'unit_price')::numeric)
           )
    from jsonb_array_elements(p_payload -> 'items')
    group by value ->> 'variant_id'
    order by (value ->> 'variant_id')::uuid
  loop
    -- FOR UPDATE here, before the sale_items insert below. That insert takes a
    -- KEY SHARE lock on this same row via its foreign key; acquiring the
    -- exclusive lock first means we never sit waiting while holding a lock that
    -- blocks the session we are waiting for.
    select v.id, v.sku, v.color, v.size, v.is_active, v.selling_price, v.purchase_price,
           p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid
     for update of v;

    if not found then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
    if not v_variant.is_active then
      raise exception 'variant_inactive: %', v_variant.sku using errcode = 'P0002';
    end if;

    v_qty   := (v_item ->> 'quantity')::integer;
    v_price := coalesce((v_item ->> 'unit_price')::numeric, v_variant.selling_price);
    -- Cost basis is frozen here; later purchases never rewrite this sale.
    v_cost  := v_variant.purchase_price;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'invalid_unit_price' using errcode = '22023';
    end if;

    insert into public.sale_items (
      sale_id, variant_id, quantity, unit_price, unit_cost, total_price, total_cost,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot
    )
    values (
      v_sale_id, v_variant.id, v_qty, v_price, v_cost,
      round(v_qty * v_price, 2), round(v_qty * v_cost, 2),
      v_variant.product_name, v_variant.sku, v_variant.color, v_variant.size
    );

    v_subtotal  := v_subtotal + round(v_qty * v_price, 2);
    v_costtotal := v_costtotal + round(v_qty * v_cost, 2);
    v_count     := v_count + 1;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  -- §25. The ceiling is a percentage of the basket, checked here because this
  -- is where the basket's value is finally known — and checked at all because
  -- a limit enforced only in the browser is not a limit.
  if v_discount > 0 then
    if not public.setting_bool('allow_manual_discount', true) then
      raise exception 'discount_not_allowed' using errcode = '42501';
    end if;
    v_maxdisc := public.setting_number('maximum_discount_percent', 100);
    if v_subtotal > 0 then
      v_discpct := round((v_discount / v_subtotal) * 100, 2);
      if v_discpct > v_maxdisc then
        raise exception 'discount_exceeds_limit: % percent requested, % allowed',
          v_discpct, v_maxdisc using errcode = '22023';
      end if;
    end if;
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  update public.sales
     set subtotal = v_subtotal, discount = v_discount, total_amount = v_total,
         total_cost = v_costtotal, paid_amount = 0, remaining_amount = v_total,
         payment_status = 'UNPAID'
   where id = v_sale_id;

  if v_status = 'DRAFT' then
    return jsonb_build_object(
      'id', v_sale_id, 'sale_number', v_sale_no, 'status', 'DRAFT',
      'subtotal', v_subtotal, 'discount', v_discount, 'total_amount', v_total,
      'total_cost', v_costtotal,
      'gross_profit', round(v_total - v_costtotal, 2),
      'paid_amount', 0, 'remaining_amount', v_total,
      'payment_status', 'UNPAID', 'item_count', v_count
    );
  end if;

  -- §26. An unpaid sale is a debt, and a debt needs somebody to owe it.
  if v_customer_id is null
     and public.setting_bool('require_customer_for_credit', true) then
    select coalesce(sum(coalesce(nullif(value ->> 'amount', '')::numeric, 0)), 0)
      into v_paid
      from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb));
    if v_paid < v_total then
      raise exception 'customer_required_for_credit' using errcode = '22023';
    end if;
  end if;

  return public.apply_sale_completion(v_sale_id, p_payload -> 'payments', v_actor)
         || jsonb_build_object('item_count', v_count);
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. SALE CANCELLATION (§29)
-- -----------------------------------------------------------------------------

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_sale  record;
  v_item  record;
  v_count integer;
begin
  if not public.can_manage_sales() then
    raise exception 'forbidden: insufficient permission to cancel sales' using errcode = '42501';
  end if;

  -- §29. Cancellation can be turned off entirely, and when it is on the reason
  -- can be made compulsory: a cancelled sale with no stated reason is a hole in
  -- the record that nobody can explain a month later.
  if not public.setting_bool('allow_sale_cancellation', true) then
    raise exception 'sale_cancellation_disabled' using errcode = '42501';
  end if;
  if public.setting_bool('require_cancellation_reason', true)
     and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_cancellable' using errcode = '22023';
  end if;

  select count(*) into v_count from public.sales_returns
   where sale_id = p_sale_id and status <> 'CANCELLED';
  if v_count > 0 then
    raise exception 'sale_has_returns' using errcode = '22023';
  end if;

  select count(*) into v_count from public.exchanges
   where sale_id = p_sale_id and status <> 'CANCELLED';
  if v_count > 0 then
    raise exception 'sale_has_exchanges' using errcode = '22023';
  end if;

  -- Returning goods to the shelf can never make stock invalid, so unlike a
  -- purchase cancellation there is nothing to refuse here.
  for v_item in
    select i.variant_id, i.quantity
      from public.sale_items i
     where i.sale_id = p_sale_id
     order by i.variant_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'SALE_REVERSAL', v_item.quantity, 'AVAILABLE',
      'SALE_CANCELLATION', p_sale_id, 'إلغاء بيع ' || v_sale.sale_number, v_actor
    );
  end loop;

  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'ADJUSTMENT', -v_sale.total_amount,
            'SALE_CANCELLATION', p_sale_id,
            'إلغاء بيع ' || v_sale.sale_number, v_actor);
  end if;

  update public.sales
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_sale_id;

  return jsonb_build_object(
    'id', p_sale_id, 'sale_number', v_sale.sale_number,
    'reversed_amount', v_sale.total_amount,
    'paid_amount', v_sale.paid_amount,
    'customer_credit', v_sale.paid_amount
  );
end;
$fn$;


-- -----------------------------------------------------------------------------
-- 5. RETURNS (§33, §34, §35, §89)
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- 6. EXPENSES (§38, §90)
--
-- `require_expense_category` has no check here on purpose: expenses.
-- expense_category_id is NOT NULL and already validated against the active
-- categories, so a category is compulsory whatever the setting says. The
-- setting is shown read-only rather than offering a switch that does nothing.
-- -----------------------------------------------------------------------------

create or replace function public.create_expense(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_id      uuid;
  v_number  text;
  v_amount  numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_method  text := coalesce(p_payload ->> 'payment_method', 'CASH');
  v_account uuid := nullif(p_payload ->> 'financial_account_id', '')::uuid;
  v_type    text;
begin
  if not public.can_manage_finance() then
    raise exception 'forbidden: insufficient permission to record expenses' using errcode = '42501';
  end if;
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_method not in ('CASH', 'BANK_TRANSFER') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  -- §38, §90. A shop that wants every dinar backed by a piece of paper turns
  -- this on; the expense is then refused until the receipt is attached.
  if public.setting_bool('require_expense_receipt', false)
     and coalesce(btrim(p_payload ->> 'receipt_image_path'), '') = '' then
    raise exception 'expense_receipt_required' using errcode = '22023';
  end if;

  v_account := public.resolve_financial_account(v_account, v_method);

  -- §10: cash does not come out of a bank account.
  select account_type into v_type from public.financial_accounts where id = v_account;
  if (v_method = 'CASH' and v_type <> 'CASH') or (v_method = 'BANK_TRANSFER' and v_type <> 'BANK') then
    raise exception 'account_method_mismatch' using errcode = '22023';
  end if;

  perform 1 from public.expense_categories
   where id = nullif(p_payload ->> 'expense_category_id', '')::uuid and is_active;
  if not found then
    raise exception 'expense_category_not_found' using errcode = 'P0002';
  end if;

  insert into public.expenses (
    expense_category_id, amount, expense_date, payment_method, financial_account_id,
    description, receipt_image_path, status, created_by
  )
  values (
    (p_payload ->> 'expense_category_id')::uuid, v_amount,
    coalesce(nullif(p_payload ->> 'expense_date', '')::date, current_date),
    v_method, v_account,
    nullif(btrim(p_payload ->> 'description'), ''),
    nullif(btrim(p_payload ->> 'receipt_image_path'), ''),
    'COMPLETED', v_actor
  )
  returning id, expense_number into v_id, v_number;

  -- Atomic with the expense: if the account cannot fund it, neither row lands.
  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (
    coalesce(nullif(p_payload ->> 'expense_date', '')::date, current_date),
    'EXPENSE', v_account, v_amount, 'OUT', 'EXPENSE', v_id,
    'مصروف ' || v_number, v_actor
  );

  return jsonb_build_object('id', v_id, 'expense_number', v_number, 'amount', v_amount,
                            'financial_account_id', v_account, 'status', 'COMPLETED');
end;
$fn$;


-- -----------------------------------------------------------------------------
-- 7. FINANCIAL ADJUSTMENTS (§39)
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- 8. PURCHASES (§31)
-- -----------------------------------------------------------------------------

create or replace function public.create_purchase(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_supplier_id uuid := (p_payload ->> 'supplier_id')::uuid;
  v_status      text := upper(coalesce(nullif(p_payload ->> 'status', ''), 'COMPLETED'));
  v_purchase_id uuid;
  v_purchase_no text;
  v_item        jsonb;
  v_variant     record;
  v_quantity    integer;
  v_unit_cost   numeric(12,2);
  v_subtotal    numeric(12,2) := 0;
  v_discount    numeric(12,2) := coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0);
  v_total       numeric(12,2);
  v_item_count  integer := 0;
  v_update_cost boolean := coalesce((p_payload ->> 'update_variant_cost')::boolean, true);
begin
  -- §31. A purchase without a supplier is a cost nobody can chase, so the
  -- requirement is on by default.
  if v_supplier_id is null and public.setting_bool('require_supplier', true) then
    raise exception 'supplier_required' using errcode = '22023';
  end if;

  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to create purchases'
      using errcode = '42501';
  end if;

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  perform 1 from public.suppliers s where s.id = v_supplier_id;
  if not found then
    raise exception 'supplier_not_found' using errcode = 'P0002';
  end if;

  perform 1 from public.suppliers s where s.id = v_supplier_id and s.is_active;
  if not found then
    raise exception 'supplier_inactive' using errcode = 'P0002';
  end if;

  if jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  insert into public.purchases (supplier_id, purchase_date, notes, status, created_by)
  values (
    v_supplier_id,
    coalesce(nullif(p_payload ->> 'purchase_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
    'DRAFT',                      -- promoted below when COMPLETED was asked for
    v_actor
  )
  returning id, purchase_number into v_purchase_id, v_purchase_no;

  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    select v.id, v.sku, v.color, v.size, v.is_active, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item ->> 'variant_id')::uuid;

    if not found then
      raise exception 'variant_not_found' using errcode = 'P0002';
    end if;
    if not v_variant.is_active then
      raise exception 'variant_inactive: %', v_variant.sku using errcode = 'P0002';
    end if;

    v_quantity  := (v_item ->> 'quantity')::integer;
    v_unit_cost := (v_item ->> 'unit_cost')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    if v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'invalid_unit_cost' using errcode = '22023';
    end if;

    insert into public.purchase_items (
      purchase_id, variant_id, quantity, unit_cost, total_cost,
      product_name_snapshot, variant_sku_snapshot, color_snapshot, size_snapshot
    )
    values (
      v_purchase_id, v_variant.id, v_quantity, v_unit_cost,
      round(v_quantity * v_unit_cost, 2),
      v_variant.product_name, v_variant.sku, v_variant.color, v_variant.size
    );

    v_subtotal   := v_subtotal + round(v_quantity * v_unit_cost, 2);
    v_item_count := v_item_count + 1;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  update public.purchases
     set subtotal         = v_subtotal,
         discount         = v_discount,
         total_amount     = v_total,
         paid_amount      = 0,
         remaining_amount = v_total,
         payment_status   = 'UNPAID'
   where id = v_purchase_id;

  -- A draft stops here: no stock, no supplier charge, no payment.
  if v_status = 'DRAFT' then
    return jsonb_build_object(
      'id', v_purchase_id,
      'purchase_number', v_purchase_no,
      'subtotal', v_subtotal,
      'discount', v_discount,
      'total_amount', v_total,
      'paid_amount', 0,
      'remaining_amount', v_total,
      'payment_status', 'UNPAID',
      'status', 'DRAFT',
      'item_count', v_item_count
    );
  end if;

  return public.apply_purchase_completion(
    v_purchase_id, p_payload -> 'payment', v_update_cost, v_actor
  ) || jsonb_build_object('item_count', v_item_count);
end;
$$;

-- The alert rules themselves, with no permission check: this is not granted to
-- anyone, and exists so the report screen and the notification generator cannot
-- drift apart about what counts as a problem (the §75 rule, applied to alerts).
create or replace function public.compute_management_alerts()
returns table (
  alert_key   text,
  severity    text,
  metric      numeric,
  threshold   numeric,
  detail      text
)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
begin
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

revoke all on function public.compute_management_alerts() from public;

-- And the Phase 7 entry point, now a guard in front of that one definition.
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
  return query select * from public.compute_management_alerts();
end;
$fn$;

-- -----------------------------------------------------------------------------
-- 9. NOTIFICATIONS (§42–§47)
-- -----------------------------------------------------------------------------

create table if not exists public.notifications (
  id               uuid        primary key default gen_random_uuid(),
  notification_key text        not null,
  type             text        not null,
  title            text        not null,
  message          text        not null,
  severity         text        not null,
  reference_type   text        null,
  reference_id     uuid        null,
  metric           numeric     null,
  threshold        numeric     null,
  -- Null means the whole shop: these are business conditions, not messages to
  -- one person. The column exists so a per-user notification can be added later
  -- without moving the table.
  user_id          uuid        null references public.profiles (id) on delete cascade,
  is_read          boolean     not null default false,
  read_at          timestamptz null,
  read_by          uuid        null references public.profiles (id) on delete set null,
  notify_date      date        not null default (now() at time zone 'UTC')::date,
  created_at       timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_severity_check;
alter table public.notifications add constraint notifications_severity_check
  check (severity in ('INFO', 'WARNING', 'CRITICAL'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('INVENTORY', 'FINANCE', 'CUSTOMER', 'SUPPLIER', 'SYSTEM'));

-- One notification per condition per day. Raising the same alert every time a
-- manager opens the dashboard would bury the one that matters; leaving a
-- dismissed alert silenced forever would hide a problem that is still there.
-- A day is the compromise: dismiss it now, see it again tomorrow if it persists.
create unique index if not exists notifications_daily_key_idx
  on public.notifications (notification_key, notify_date)
  where user_id is null;

create index if not exists notifications_user_id_idx    on public.notifications (user_id);
create index if not exists notifications_is_read_idx    on public.notifications (is_read);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_type_idx       on public.notifications (type);

comment on table public.notifications is
  'Business alerts raised server-side from the same rules the reports use. Never written by the browser.';

alter table public.notifications enable row level security;

drop policy if exists "notifications readable" on public.notifications;
create policy "notifications readable"
  on public.notifications for select to authenticated
  using (
    public.has_permission('VIEW_NOTIFICATIONS')
    and (user_id is null or user_id = (select auth.uid()))
  );

-- No write policy: generation and read-marking both go through functions below.

-- Which setting switches each alert off, and how it should be presented.
create or replace function public.notification_shape(p_key text)
returns table (enabled boolean, ntype text, title text)
language sql stable security definer set search_path = '' as $fn$
  select
    case p_key
      when 'LOW_STOCK'        then public.setting_bool('notify_low_stock', true)
      when 'OUT_OF_STOCK'     then public.setting_bool('notify_out_of_stock', true)
      when 'DEAD_STOCK'       then public.setting_bool('notify_low_stock', true)
      when 'CUSTOMER_DEBT'    then public.setting_bool('notify_customer_debt', true)
      when 'SUPPLIER_DEBT'    then public.setting_bool('notify_supplier_debt', true)
      when 'HIGH_RETURN_RATE' then public.setting_bool('notify_high_return_rate', true)
      when 'HIGH_EXPENSES'    then public.setting_bool('notify_high_expenses', true)
      else true
    end,
    case p_key
      when 'LOW_STOCK'        then 'INVENTORY'
      when 'OUT_OF_STOCK'     then 'INVENTORY'
      when 'DEAD_STOCK'       then 'INVENTORY'
      when 'CUSTOMER_DEBT'    then 'CUSTOMER'
      when 'SUPPLIER_DEBT'    then 'SUPPLIER'
      when 'HIGH_RETURN_RATE' then 'INVENTORY'
      when 'HIGH_EXPENSES'    then 'FINANCE'
      else 'SYSTEM'
    end,
    case p_key
      when 'LOW_STOCK'        then 'مخزون منخفض'
      when 'OUT_OF_STOCK'     then 'نفاد مخزون'
      when 'DEAD_STOCK'       then 'مخزون راكد'
      when 'CUSTOMER_DEBT'    then 'ذمم عملاء مرتفعة'
      when 'SUPPLIER_DEBT'    then 'ذمم موردين مرتفعة'
      when 'HIGH_RETURN_RATE' then 'ارتفاع معدل المرتجعات'
      when 'HIGH_EXPENSES'    then 'ارتفاع المصاريف'
      else p_key
    end;
$fn$;

revoke all on function public.notification_shape(text) from public;

-- §47. Generation is server-side. A signed-in caller must be entitled to see
-- the reports these alerts come from; a scheduled run has no session at all and
-- is allowed through, which is how Phase 9 will drive this from cron.
create or replace function public.generate_notifications()
returns integer
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_alert   record;
  v_shape   record;
  v_created integer := 0;
  v_diff    numeric;
  v_closing record;
begin
  if (select auth.uid()) is not null and not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to generate notifications'
      using errcode = '42501';
  end if;

  for v_alert in select * from public.compute_management_alerts() loop
    select * into v_shape from public.notification_shape(v_alert.alert_key);
    continue when not v_shape.enabled;

    insert into public.notifications
      (notification_key, type, title, message, severity, metric, threshold)
    values (
      v_alert.alert_key, v_shape.ntype, v_shape.title, v_alert.detail,
      v_alert.severity, v_alert.metric, v_alert.threshold
    )
    on conflict do nothing;

    if found then v_created := v_created + 1; end if;
  end loop;

  -- Cash closings are not part of the management alerts because they are an
  -- event rather than a standing condition, so they are raised here (§42).
  if public.setting_bool('notify_cash_difference', true) then
    v_diff := public.setting_number('cash_difference_threshold', 5);
    for v_closing in
      select c.id, c.closing_number, c.closing_date, c.difference
        from public.cash_closings c
       where c.closing_date >= current_date - 7
         and abs(c.difference) > v_diff
       order by c.closing_date desc
       limit 20
    loop
      insert into public.notifications
        (notification_key, type, title, message, severity,
         reference_type, reference_id, metric, threshold)
      values (
        'CASH_DIFFERENCE_' || v_closing.closing_number, 'FINANCE',
        'فرق في جرد الصندوق',
        'إغلاق ' || v_closing.closing_number || ' بتاريخ ' || v_closing.closing_date
          || ' يحمل فرقاً قدره ' || round(v_closing.difference, 2),
        case when abs(v_closing.difference) > v_diff * 10 then 'CRITICAL' else 'WARNING' end,
        'cash_closing', v_closing.id, v_closing.difference, v_diff
      )
      on conflict do nothing;
      if found then v_created := v_created + 1; end if;
    end loop;
  end if;

  return v_created;
end;
$fn$;

create or replace function public.mark_notification_read(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.has_permission('VIEW_NOTIFICATIONS') then
    raise exception 'forbidden: insufficient permission' using errcode = '42501';
  end if;

  update public.notifications
     set is_read = true, read_at = now(), read_by = v_actor
   where id = p_id
     and (user_id is null or user_id = v_actor)
     and not is_read;

  return jsonb_build_object('id', p_id, 'is_read', true);
end;
$fn$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_count integer;
begin
  if not public.has_permission('VIEW_NOTIFICATIONS') then
    raise exception 'forbidden: insufficient permission' using errcode = '42501';
  end if;

  with updated as (
    update public.notifications
       set is_read = true, read_at = now(), read_by = v_actor
     where not is_read
       and (user_id is null or user_id = v_actor)
    returning 1
  )
  select count(*) into v_count from updated;

  return coalesce(v_count, 0);
end;
$fn$;

create or replace function public.unread_notification_count()
returns integer
language sql stable security definer set search_path = '' as $fn$
  select case
    when not public.has_permission('VIEW_NOTIFICATIONS') then 0
    else (select count(*)::integer from public.notifications n
           where not n.is_read
             and (n.user_id is null or n.user_id = (select auth.uid())))
  end;
$fn$;

revoke all on function public.generate_notifications()       from public;
revoke all on function public.mark_notification_read(uuid)   from public;
revoke all on function public.mark_all_notifications_read()  from public;

grant execute on function public.generate_notifications()      to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid)  to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.unread_notification_count()   to authenticated;
grant execute on function public.get_management_alerts()       to authenticated;

-- -----------------------------------------------------------------------------
-- 10. DATA STATISTICS (§64)
-- -----------------------------------------------------------------------------

-- Counts only. There is deliberately no companion that deletes any of this:
-- §65 rules out reset-the-database buttons, and a screen that can only count
-- cannot be talked into doing anything worse.
create or replace function public.get_data_statistics()
returns table (
  products                integer,
  variants                integer,
  customers               integer,
  suppliers               integer,
  sales                   integer,
  purchases               integer,
  returns                 integer,
  exchanges               integer,
  expenses                integer,
  financial_transactions  integer,
  inventory_transactions  integer,
  audit_logs              integer
)
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_manage_settings() then
    raise exception 'forbidden: insufficient permission to view statistics'
      using errcode = '42501';
  end if;
  return query
    select
      (select count(*)::integer from public.products),
      (select count(*)::integer from public.product_variants),
      (select count(*)::integer from public.customers),
      (select count(*)::integer from public.suppliers),
      (select count(*)::integer from public.sales),
      (select count(*)::integer from public.purchases),
      (select count(*)::integer from public.sales_returns),
      (select count(*)::integer from public.exchanges),
      (select count(*)::integer from public.expenses),
      (select count(*)::integer from public.financial_transactions),
      (select count(*)::integer from public.inventory_transactions),
      (select count(*)::integer from public.audit_logs);
end;
$fn$;

grant execute on function public.get_data_statistics() to authenticated;

-- -----------------------------------------------------------------------------
-- 11. AUDIT LOG READ ACCESS (§48, §51)
-- -----------------------------------------------------------------------------

-- The trail is readable by whoever holds VIEW_AUDIT_LOG and writable by nobody:
-- there is no update or delete policy, and none should be added. A log that can
-- be edited is not evidence of anything.
-- 0001 granted this to administrators by role. Phase 8 makes VIEW_AUDIT_LOG the
-- single answer, so the old policy is replaced rather than left beside the new
-- one — two SELECT policies are OR-ed, and the older one would quietly outrank
-- anything the matrix said.
drop policy if exists audit_logs_select_admin on public.audit_logs;
drop policy if exists "audit log readable"    on public.audit_logs;
create policy "audit log readable"
  on public.audit_logs for select to authenticated
  using (public.has_permission('VIEW_AUDIT_LOG'));

create index if not exists audit_logs_entity_type_idx on public.audit_logs (entity_type);

-- The reader, joined to names so the screen does not have to.
create or replace function public.search_audit_logs(
  p_search    text    default null,
  p_action    text    default null,
  p_entity    text    default null,
  p_user      uuid    default null,
  p_date_from date    default null,
  p_date_to   date    default null,
  p_limit     integer default 50,
  p_offset    integer default 0
)
returns table (
  id          uuid,
  user_id     uuid,
  user_name   text,
  action      text,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz,
  total_count bigint
)
language plpgsql stable set search_path = public as $fn$
begin
  if not public.can_view_audit_log() then
    raise exception 'forbidden: insufficient permission to view the audit log'
      using errcode = '42501';
  end if;
  return query
    select a.id, a.user_id, p.full_name, a.action, a.entity_type, a.entity_id,
           a.metadata, a.created_at, count(*) over () as total_count
      from public.audit_logs a
      left join public.profiles p on p.id = a.user_id
     where (p_action is null or a.action = p_action)
       and (p_entity is null or a.entity_type = p_entity)
       and (p_user   is null or a.user_id = p_user)
       and (p_date_from is null or a.created_at >= p_date_from::timestamptz)
       and (p_date_to   is null or a.created_at < (p_date_to + 1)::timestamptz)
       and (
         p_search is null or p_search = '' or
         a.action ilike '%' || p_search || '%' or
         a.entity_type ilike '%' || p_search || '%' or
         coalesce(p.full_name, '') ilike '%' || p_search || '%'
       )
     order by a.created_at desc
     limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$fn$;

grant execute on function public.search_audit_logs(text, text, text, uuid, date, date, integer, integer)
  to authenticated;
