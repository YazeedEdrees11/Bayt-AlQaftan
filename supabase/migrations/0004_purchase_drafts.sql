-- =============================================================================
-- بيت القفطان — Phase 3.1
-- Draft purchases: save now, receive later
-- Migration 0004
--
-- Paste into the Supabase SQL Editor and run once. Idempotent.
-- Requires 0001–0003.
--
-- A DRAFT is a document with items and totals but **no side effects**: no
-- stock movement, no supplier charge, no payment. Completing it is what
-- applies all three, atomically. That keeps "someone typed the delivery note
-- but the goods have not been checked in yet" out of the inventory figures.
--
--   DRAFT ──complete_purchase()──> COMPLETED ──cancel_purchase()──> CANCELLED
--     │
--     └──delete_draft_purchase()──> (gone; safe, it never touched a ledger)
-- =============================================================================

-- =============================================================================
-- 1. SHARED COMPLETION LOGIC
--
-- Used by both create_purchase (when saving straight to COMPLETED) and
-- complete_purchase (when promoting a draft), so the two paths cannot drift.
--
-- Deliberately NOT granted to `authenticated`: it performs no permission check
-- of its own and trusts its callers, which do.
-- =============================================================================

create or replace function public.apply_purchase_completion(
  p_purchase_id uuid,
  p_payment     jsonb,
  p_update_cost boolean,
  p_actor       uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_purchase record;
  v_item     record;
  v_paid     numeric(12,2) := 0;
  v_method   text;
  v_status   text;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  -- Stock in, one ledger row per line.
  for v_item in
    select i.variant_id, i.quantity, i.unit_cost
      from public.purchase_items i
     where i.purchase_id = p_purchase_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id,
      notes, created_by
    )
    values (
      v_item.variant_id, 'PURCHASE', v_item.quantity, 'PURCHASE', p_purchase_id,
      'مشتريات ' || v_purchase.purchase_number, p_actor
    );

    if p_update_cost then
      update public.product_variants
         set purchase_price = v_item.unit_cost
       where id = v_item.variant_id;
    end if;
  end loop;

  -- Opening payment, if any.
  if p_payment is not null and p_payment <> 'null'::jsonb then
    v_paid   := coalesce(nullif(p_payment ->> 'amount', '')::numeric, 0);
    v_method := coalesce(p_payment ->> 'payment_method', 'CASH');

    if v_paid < 0 then
      raise exception 'invalid_paid_amount' using errcode = '22023';
    end if;
    if v_paid > v_purchase.total_amount then
      raise exception 'overpayment' using errcode = '22023';
    end if;

    if v_paid > 0 then
      if v_method = 'BANK_TRANSFER'
         and (
           coalesce(btrim(p_payment ->> 'bank_name'), '') = ''
           or coalesce(btrim(p_payment ->> 'transfer_reference'), '') = ''
         ) then
        raise exception 'bank_details_required' using errcode = '22023';
      end if;

      insert into public.purchase_payments (
        purchase_id, payment_method, amount, payment_date,
        bank_name, transfer_reference, receipt_image_path, notes, created_by
      )
      values (
        p_purchase_id, v_method, v_paid,
        coalesce(nullif(p_payment ->> 'payment_date', '')::date, current_date),
        nullif(btrim(p_payment ->> 'bank_name'), ''),
        nullif(btrim(p_payment ->> 'transfer_reference'), ''),
        nullif(btrim(p_payment ->> 'receipt_image_path'), ''),
        nullif(btrim(p_payment ->> 'notes'), ''),
        p_actor
      );
    end if;
  end if;

  v_status := case
    when v_paid = 0                        then 'UNPAID'
    when v_paid >= v_purchase.total_amount then 'PAID'
    else 'PARTIALLY_PAID'
  end;

  update public.purchases
     set status           = 'COMPLETED',
         paid_amount      = v_paid,
         remaining_amount = round(v_purchase.total_amount - v_paid, 2),
         payment_status   = v_status
   where id = p_purchase_id;

  -- Supplier account.
  insert into public.supplier_balance_transactions (
    supplier_id, transaction_type, amount, reference_type, reference_id,
    description, created_by
  )
  values (
    v_purchase.supplier_id, 'PURCHASE', v_purchase.total_amount,
    'PURCHASE', p_purchase_id,
    'مشتريات ' || v_purchase.purchase_number, p_actor
  );

  if v_paid > 0 then
    insert into public.supplier_balance_transactions (
      supplier_id, transaction_type, amount, reference_type, reference_id,
      description, created_by
    )
    values (
      v_purchase.supplier_id, 'PAYMENT', v_paid, 'PURCHASE', p_purchase_id,
      'دفعة عند تسجيل مشتريات ' || v_purchase.purchase_number, p_actor
    );
  end if;

  return jsonb_build_object(
    'id', p_purchase_id,
    'purchase_number', v_purchase.purchase_number,
    'subtotal', v_purchase.subtotal,
    'discount', v_purchase.discount,
    'total_amount', v_purchase.total_amount,
    'paid_amount', v_paid,
    'remaining_amount', round(v_purchase.total_amount - v_paid, 2),
    'payment_status', v_status,
    'status', 'COMPLETED'
  );
end;
$$;

revoke all on function public.apply_purchase_completion(uuid, jsonb, boolean, uuid) from public, authenticated, anon;

-- =============================================================================
-- 2. create_purchase — now honours a requested status
-- =============================================================================

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

-- =============================================================================
-- 3. complete_purchase — promote a draft
-- =============================================================================

create or replace function public.complete_purchase(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_purchase_id uuid := (p_payload ->> 'purchase_id')::uuid;
  v_update_cost boolean := coalesce((p_payload ->> 'update_variant_cost')::boolean, true);
  v_status      text;
  v_count       integer;
begin
  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to complete purchases'
      using errcode = '42501';
  end if;

  select status into v_status from public.purchases where id = v_purchase_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'purchase_not_draft' using errcode = '22023';
  end if;

  select count(*) into v_count from public.purchase_items where purchase_id = v_purchase_id;
  if v_count = 0 then
    raise exception 'no_items' using errcode = '22023';
  end if;

  return public.apply_purchase_completion(
    v_purchase_id, p_payload -> 'payment', v_update_cost, v_actor
  ) || jsonb_build_object('item_count', v_count);
end;
$$;

-- =============================================================================
-- 4. delete_draft_purchase
--
-- Safe precisely because a draft has never written to a ledger. Anything that
-- has been completed must be cancelled instead, which preserves history.
-- =============================================================================

create or replace function public.delete_draft_purchase(p_purchase_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_purchase record;
begin
  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to delete drafts'
      using errcode = '42501';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_purchase.status <> 'DRAFT' then
    raise exception 'purchase_not_draft' using errcode = '22023';
  end if;

  -- Belt and braces: a draft must never have produced side effects.
  perform 1 from public.inventory_transactions where reference_id = p_purchase_id;
  if found then
    raise exception 'draft_has_side_effects' using errcode = '22023';
  end if;
  perform 1 from public.supplier_balance_transactions where reference_id = p_purchase_id;
  if found then
    raise exception 'draft_has_side_effects' using errcode = '22023';
  end if;

  delete from public.purchase_items where purchase_id = p_purchase_id;
  delete from public.purchases where id = p_purchase_id;

  return jsonb_build_object(
    'id', p_purchase_id,
    'purchase_number', v_purchase.purchase_number
  );
end;
$$;

revoke all on function public.complete_purchase(jsonb)      from public;
revoke all on function public.delete_draft_purchase(uuid)   from public;

grant execute on function public.complete_purchase(jsonb)    to authenticated;
grant execute on function public.delete_draft_purchase(uuid) to authenticated;

-- =============================================================================
-- 5. GUARDS
--
-- A draft carries no money and no goods, so nothing may be paid against it and
-- it cannot be cancelled (it is deleted instead). Both are already enforced in
-- add_purchase_payment / cancel_purchase by their `status <> 'COMPLETED'`
-- checks; this constraint stops a draft from ever *holding* a paid amount.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_draft_unpaid_check') then
    alter table public.purchases add constraint purchases_draft_unpaid_check
      check (status <> 'DRAFT' or (paid_amount = 0 and payment_status = 'UNPAID'));
  end if;
end $$;

create index if not exists purchases_draft_idx
  on public.purchases (created_at desc) where status = 'DRAFT';
