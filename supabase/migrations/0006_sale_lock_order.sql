-- بيت القفطان (Bayt Al-Qaftan) — Phase 4 follow-up
-- =============================================================================
-- Serialise concurrent sales without deadlocking.
--
-- Found by the Phase 4 concurrency simulation: with 500 units in stock — so no
-- stock contention whatsoever — four simultaneous sales of the same variant
-- already produced deadlock aborts (40P01), and at sixteen only one sale in
-- sixteen survived. Two independent causes:
--
--   1. LOCK UPGRADE. create_sale inserted sale_items first, and that foreign
--      key takes a KEY SHARE lock on the product_variants row. Only afterwards
--      did apply_sale_completion ask for FOR UPDATE on the same row. Two tills
--      each holding KEY SHARE and each waiting to upgrade to FOR UPDATE is a
--      deadlock by construction — neither can proceed. The cure is to take the
--      exclusive lock BEFORE any statement that touches the foreign key, so a
--      transaction never waits while holding a conflicting shared lock.
--
--   2. LOCK ORDER. The lock loops had no ORDER BY, so a two-item basket could
--      lock A then B while a concurrent basket locked B then A. Every loop that
--      locks variants now walks them in ascending variant_id, which makes a
--      waits-for cycle impossible regardless of the order the cashier scanned.
--
-- Integrity was never at risk — the failing transactions rolled back cleanly and
-- the ledger always reconciled — so this changes availability, not arithmetic.
-- Behaviour, totals and error messages are otherwise identical.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- apply_sale_completion — lock in a deterministic order
-- ---------------------------------------------------------------------------
create or replace function public.apply_sale_completion(
  p_sale_id uuid,
  p_payments jsonb,
  p_actor   uuid
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_sale    record;
  v_item    record;
  v_stock   integer;
  v_short   text := null;
  v_payment jsonb;
  v_paid    numeric(12,2) := 0;
  v_amount  numeric(12,2);
  v_method  text;
  v_status  text;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0002';
  end if;

  -- Validate the WHOLE basket before touching anything: a sale is never
  -- partially fulfilled. The row lock serialises concurrent sales of the same
  -- variant, which is what makes overselling impossible.
  --
  -- Ordering by variant_id is what keeps that safe under load: every session
  -- takes the locks in the same sequence, so two baskets sharing two variants
  -- can never each hold what the other is waiting for.
  for v_item in
    select i.variant_id, i.quantity, i.variant_sku_snapshot
      from public.sale_items i
     where i.sale_id = p_sale_id
     order by i.variant_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t where t.variant_id = v_item.variant_id;

    if v_stock < v_item.quantity then
      v_short := coalesce(v_short || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_short is not null then
    raise exception 'insufficient_stock: %', v_short using errcode = '22023';
  end if;

  for v_item in
    select i.variant_id, i.quantity
      from public.sale_items i
     where i.sale_id = p_sale_id
     order by i.variant_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'SALE', v_item.quantity, 'SALE', p_sale_id,
      'بيع ' || v_sale.sale_number, p_actor
    );
  end loop;

  -- A sale may be settled with several payments at once (cash + transfer).
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_payment in select * from jsonb_array_elements(p_payments) loop
      v_amount := coalesce(nullif(v_payment ->> 'amount', '')::numeric, 0);
      v_method := coalesce(v_payment ->> 'payment_method', 'CASH');
      if v_amount <= 0 then continue; end if;

      if v_method = 'BANK_TRANSFER'
         and (coalesce(btrim(v_payment ->> 'bank_name'), '') = ''
              or coalesce(btrim(v_payment ->> 'transfer_reference'), '') = '') then
        raise exception 'bank_details_required' using errcode = '22023';
      end if;

      insert into public.sale_payments (
        sale_id, payment_method, amount, payment_date,
        bank_name, transfer_reference, receipt_image_path, notes, created_by
      )
      values (
        p_sale_id, v_method, v_amount,
        coalesce(nullif(v_payment ->> 'payment_date', '')::date, current_date),
        nullif(btrim(v_payment ->> 'bank_name'), ''),
        nullif(btrim(v_payment ->> 'transfer_reference'), ''),
        nullif(btrim(v_payment ->> 'receipt_image_path'), ''),
        nullif(btrim(v_payment ->> 'notes'), ''),
        p_actor
      );

      v_paid := v_paid + v_amount;
    end loop;
  end if;

  if v_paid > v_sale.total_amount then
    raise exception 'overpayment' using errcode = '22023';
  end if;

  v_status := case
    when v_paid = 0 then 'UNPAID'
    when v_paid >= v_sale.total_amount then 'PAID'
    else 'PARTIALLY_PAID'
  end;

  update public.sales
     set status           = 'COMPLETED',
         paid_amount      = v_paid,
         remaining_amount = round(v_sale.total_amount - v_paid, 2),
         payment_status   = v_status
   where id = p_sale_id;

  -- Walk-in sales have no account to post to.
  if v_sale.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_sale.customer_id, 'SALE', v_sale.total_amount, 'SALE', p_sale_id,
            'بيع ' || v_sale.sale_number, p_actor);

    if v_paid > 0 then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_sale.customer_id, 'PAYMENT', v_paid, 'SALE', p_sale_id,
              'دفعة عند البيع ' || v_sale.sale_number, p_actor);
    end if;
  end if;

  return jsonb_build_object(
    'id', p_sale_id,
    'sale_number', v_sale.sale_number,
    'status', 'COMPLETED',
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount,
    'total_amount', v_sale.total_amount,
    'total_cost', v_sale.total_cost,
    'gross_profit', round(v_sale.total_amount - v_sale.total_cost, 2),
    'paid_amount', v_paid,
    'remaining_amount', round(v_sale.total_amount - v_paid, 2),
    'payment_status', v_status
  );
end;
$$;

revoke all on function public.apply_sale_completion(uuid, jsonb, uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- create_sale — take the variant lock before the sale_items insert
-- ---------------------------------------------------------------------------
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
begin
  if not public.can_sell() then
    raise exception 'forbidden: insufficient permission to create sales' using errcode = '42501';
  end if;
  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid_status' using errcode = '22023';
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

  return public.apply_sale_completion(v_sale_id, p_payload -> 'payments', v_actor)
         || jsonb_build_object('item_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_sale — same deterministic order when returning goods to the shelf
-- ---------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_sale  record;
  v_item  record;
begin
  if not public.can_manage_sales() then
    raise exception 'forbidden: insufficient permission to cancel sales' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_cancellable' using errcode = '22023';
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
      variant_id, transaction_type, quantity, reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'SALE_REVERSAL', v_item.quantity, 'SALE_CANCELLATION', p_sale_id,
      'إلغاء بيع ' || v_sale.sale_number, v_actor
    );
  end loop;

  -- Reverse the charge. Payments already taken stay on the ledger, so any
  -- money the customer handed over shows as a credit until it is refunded.
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
$$;

revoke all on function public.create_sale(jsonb)      from public;
revoke all on function public.cancel_sale(uuid, text) from public;
grant execute on function public.create_sale(jsonb)      to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
