-- بيت القفطان (Bayt Al-Qaftan) — Phase 5 follow-up
-- =============================================================================
-- Two defects found by the Phase 5 verification run, both in how a return's
-- money reaches the customer ledger.
--
--   1. WRONG CONSTRAINT NAME. Phase 4 named its type constraint
--      `customer_balance_type_check`, but 0007 tried to drop
--      `customer_balance_transactions_type_check` before adding the version
--      that allows REFUND. The DROP silently matched nothing, so the Phase 4
--      constraint stayed in force and every cash or bank refund was rejected
--      with a check violation — the whole return rolled back. 0007's constraint
--      was added alongside, so BOTH are dropped here and one correct one is put
--      back under the original name.
--
--   2. ZERO-AMOUNT ADJUSTMENT. `customer_balance_amount_check` requires an
--      ADJUSTMENT to be non-zero. Cancelling an EVEN exchange posted an
--      adjustment of exactly zero — returned and replacement being equal is the
--      definition of EVEN — so cancelling one would have failed. A ledger entry
--      of zero says nothing anyway, so it is simply not written.
--
-- Nothing was mis-recorded by either bug: both aborted their transaction.
-- =============================================================================

alter table public.customer_balance_transactions
  drop constraint if exists customer_balance_transactions_type_check;
alter table public.customer_balance_transactions
  drop constraint if exists customer_balance_type_check;

alter table public.customer_balance_transactions
  add constraint customer_balance_type_check
  check (transaction_type in ('SALE', 'PAYMENT', 'SALE_RETURN', 'REFUND', 'ADJUSTMENT'));

-- ---------------------------------------------------------------------------
-- cancel_exchange — skip a zero-value ledger entry
-- ---------------------------------------------------------------------------
create or replace function public.cancel_exchange(p_exchange_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_exc   record;
  v_item  record;
  v_stock integer;
  v_short text := null;
begin
  if not public.can_manage_returns() then
    raise exception 'forbidden: insufficient permission to cancel exchanges' using errcode = '42501';
  end if;

  select * into v_exc from public.exchanges where id = p_exchange_id for update;
  if not found then raise exception 'exchange_not_found' using errcode = 'P0002'; end if;
  if v_exc.status <> 'COMPLETED' then
    raise exception 'exchange_not_cancellable' using errcode = '22023';
  end if;

  -- Undoing an exchange sends the returned piece back out again. If it has
  -- since been sold, refuse rather than invent stock (§39).
  for v_item in
    select xi.variant_id, xi.quantity, xi.condition, xi.variant_sku_snapshot
      from public.exchange_items xi
     where xi.exchange_id = p_exchange_id and xi.item_type = 'RETURNED'
     order by xi.variant_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t
     where t.variant_id = v_item.variant_id
       and t.stock_state = case when v_item.condition = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end;

    if v_stock < v_item.quantity then
      v_short := coalesce(v_short || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_short is not null then
    raise exception 'cancel_would_oversell: %', v_short using errcode = '22023';
  end if;

  for v_item in
    select xi.item_type, xi.variant_id, xi.quantity, xi.condition
      from public.exchange_items xi
     where xi.exchange_id = p_exchange_id
     order by xi.variant_id
  loop
    if v_item.item_type = 'RETURNED' then
      insert into public.inventory_transactions (
        variant_id, transaction_type, quantity, stock_state,
        reference_type, reference_id, notes, created_by
      )
      values (
        v_item.variant_id, 'EXCHANGE_OUT', v_item.quantity,
        case when v_item.condition = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end,
        'EXCHANGE_CANCELLATION', p_exchange_id,
        'إلغاء استبدال ' || v_exc.exchange_number, v_actor
      );
    else
      insert into public.inventory_transactions (
        variant_id, transaction_type, quantity, stock_state,
        reference_type, reference_id, notes, created_by
      )
      values (
        v_item.variant_id, 'EXCHANGE_IN', v_item.quantity, 'AVAILABLE',
        'EXCHANGE_CANCELLATION', p_exchange_id,
        'إلغاء استبدال ' || v_exc.exchange_number, v_actor
      );
    end if;
  end loop;

  if v_exc.customer_id is not null then
    -- An EVEN exchange moved nothing on the account, so there is nothing to
    -- reverse; a zero-value ledger row would say nothing and the amount CHECK
    -- rejects it outright.
    if v_exc.returned_amount <> v_exc.new_items_amount then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_exc.customer_id, 'ADJUSTMENT', v_exc.returned_amount - v_exc.new_items_amount,
              'EXCHANGE_CANCELLATION', p_exchange_id,
              'إلغاء استبدال ' || v_exc.exchange_number, v_actor);
    end if;

    if v_exc.difference_amount > 0 and v_exc.settlement_method in ('CASH', 'BANK_TRANSFER') then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (
        v_exc.customer_id, 'ADJUSTMENT',
        case when v_exc.difference_direction = 'CUSTOMER_PAYS'
             then v_exc.difference_amount else -v_exc.difference_amount end,
        'EXCHANGE_CANCELLATION', p_exchange_id,
        'عكس فرق الاستبدال ' || v_exc.exchange_number, v_actor
      );
    end if;
  end if;

  update public.exchanges
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_exchange_id;

  return jsonb_build_object(
    'id', p_exchange_id, 'exchange_number', v_exc.exchange_number,
    'difference_amount', v_exc.difference_amount,
    'difference_direction', v_exc.difference_direction
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- cancel_sales_return — same guard on the reversing entries
-- ---------------------------------------------------------------------------
-- A return worth zero cannot exist, but a return that was never refunded posts
-- no second entry, and the sum-based insert below already skipped that case.
-- Made explicit so the two cancellation paths read the same way.
create or replace function public.cancel_sales_return(p_return_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_ret   record;
  v_item  record;
  v_stock integer;
  v_short text := null;
  v_paid  numeric(12,2);
begin
  if not public.can_manage_returns() then
    raise exception 'forbidden: insufficient permission to cancel returns' using errcode = '42501';
  end if;

  select * into v_ret from public.sales_returns where id = p_return_id for update;
  if not found then raise exception 'return_not_found' using errcode = 'P0002'; end if;
  if v_ret.status <> 'COMPLETED' then
    raise exception 'return_not_cancellable' using errcode = '22023';
  end if;

  for v_item in
    select ri.variant_id, ri.quantity, ri.condition, ri.variant_sku_snapshot
      from public.sales_return_items ri
     where ri.return_id = p_return_id
     order by ri.variant_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;

    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t
     where t.variant_id = v_item.variant_id
       and t.stock_state = case when v_item.condition = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end;

    if v_stock < v_item.quantity then
      v_short := coalesce(v_short || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_short is not null then
    raise exception 'cancel_would_oversell: %', v_short using errcode = '22023';
  end if;

  for v_item in
    select ri.variant_id, ri.quantity, ri.condition
      from public.sales_return_items ri
     where ri.return_id = p_return_id
     order by ri.variant_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id, 'RETURN_REVERSAL', v_item.quantity,
      case when v_item.condition = 'DAMAGED' then 'DAMAGED' else 'AVAILABLE' end,
      'RETURN_CANCELLATION', p_return_id,
      'إلغاء مرتجع ' || v_ret.return_number, v_actor
    );
  end loop;

  if v_ret.customer_id is not null then
    if v_ret.refund_amount <> 0 then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_ret.customer_id, 'ADJUSTMENT', v_ret.refund_amount,
              'RETURN_CANCELLATION', p_return_id,
              'إلغاء مرتجع ' || v_ret.return_number, v_actor);
    end if;

    select coalesce(sum(amount), 0) into v_paid
      from public.return_refunds
     where return_id = p_return_id and refund_method in ('CASH', 'BANK_TRANSFER');

    if v_paid > 0 then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      values (v_ret.customer_id, 'ADJUSTMENT', -v_paid,
              'RETURN_CANCELLATION', p_return_id,
              'عكس استرداد المرتجع ' || v_ret.return_number, v_actor);
    end if;
  end if;

  update public.sales_returns
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_return_id;

  return jsonb_build_object(
    'id', p_return_id, 'return_number', v_ret.return_number,
    'reversed_amount', v_ret.refund_amount,
    'refunded_amount', v_ret.refunded_amount
  );
end;
$fn$;

revoke all on function public.cancel_exchange(uuid, text)      from public;
revoke all on function public.cancel_sales_return(uuid, text)  from public;
grant execute on function public.cancel_exchange(uuid, text)      to authenticated;
grant execute on function public.cancel_sales_return(uuid, text)  to authenticated;
