-- =============================================================================
-- 0022 — The discount ceiling, re-read when a draft becomes a sale
--
-- create_sale checks the ceiling; complete_sale did not, because the draft had
-- already been validated when it was written. That reasoning has a hole in it:
-- a draft is not a sale. It becomes one here, and drafts can be written in
-- advance. Lower the limit from 30% to 10% and every draft already carrying a
-- 30% discount stays completable — which is precisely the thing the owner
-- lowered the limit to stop.
--
-- Same family as the credit-customer gap 0019 closed in this same function:
-- two paths reach a completed sale, and only one of them was asking.
-- =============================================================================

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
  v_max     numeric(5,2);
  v_pct     numeric(6,2);
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

  -- §25. The ceiling is re-read here, not trusted from when the draft was made.
  -- A draft is not a sale; it becomes one at this line. Otherwise lowering the
  -- limit would leave every draft already written at the old one still
  -- completable — and drafts can be written in advance.
  if v_sale.discount > 0 then
    if not public.setting_bool('allow_manual_discount', true) then
      raise exception 'discount_not_allowed' using errcode = '42501';
    end if;
    v_max := public.setting_number('maximum_discount_percent', 100);
    if v_sale.subtotal > 0 then
      v_pct := round((v_sale.discount / v_sale.subtotal) * 100, 2);
      if v_pct > v_max then
        raise exception 'discount_exceeds_limit: % percent requested, % allowed',
          v_pct, v_max using errcode = '22023';
      end if;
    end if;
  end if;

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
