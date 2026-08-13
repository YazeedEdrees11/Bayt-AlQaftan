-- =============================================================================
-- 0023 — Idempotency for operations that move money or stock (§36, §37, §38)
--
-- Measured before this migration: the same sale submitted twice, at the same
-- moment, produced two sales, two stock movements and two ledger entries. A
-- double-click does that. So does a browser retry, a flaky connection, or a
-- user refreshing a page that was mid-request. In a shop this shows up as
-- inventory that does not match the shelf and a customer charged twice.
--
-- The client sends an `idempotency_key` with the payload — one key per attempt
-- at an operation, reused if the attempt is retried. The first call claims the
-- key and does the work; a second call carrying the same key gets the first
-- call's answer back without doing anything.
--
-- The claim is a row insert inside the caller's own transaction, which gives
-- three properties for free:
--
--   * a duplicate arriving while the first is still running blocks on the row
--     lock rather than racing it;
--   * if the first attempt fails and rolls back, the claim rolls back with it,
--     so a genuine retry after a genuine failure proceeds normally — which is
--     exactly when a retry is most deserved;
--   * no background reaper is needed to release stuck keys, because a key can
--     only outlive its transaction by committing.
--
-- Sending no key keeps the old behaviour. Nothing breaks for a caller that has
-- not been updated.
-- =============================================================================

create table if not exists public.idempotency_keys (
  key          text        primary key,
  user_id      uuid        null references public.profiles (id) on delete set null,
  operation    text        not null,
  result       jsonb       null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz null
);

comment on table public.idempotency_keys is
  'One row per attempted operation. Holds the answer so a retry returns it instead of repeating the work.';

create index if not exists idempotency_keys_created_at_idx
  on public.idempotency_keys (created_at desc);
create index if not exists idempotency_keys_operation_idx
  on public.idempotency_keys (operation);

alter table public.idempotency_keys enable row level security;
-- No policy at all: the table is reached only through the two functions below,
-- both SECURITY DEFINER. Nothing reads or writes it directly.

/**
 * Claims a key, or returns the answer the first call gave.
 *
 * Returns null when the caller now owns the key and should do the work.
 */
create or replace function public.idempotency_claim(p_key text, p_operation text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_result jsonb;
  v_found  boolean;
begin
  if p_key is null or btrim(p_key) = '' then
    return null;                      -- no key supplied: behave as before
  end if;
  if length(p_key) > 100 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  loop
    -- FOR UPDATE is what makes a simultaneous duplicate wait rather than race:
    -- the first call holds this row until it commits.
    select result, true into v_result, v_found
      from public.idempotency_keys
     where key = p_key
     for update;

    if v_found then
      if v_result is not null then
        return v_result;              -- already answered; hand back the answer
      end if;
      -- Claimed and committed with no result: the first call finished without
      -- storing one. Refusing is safer than guessing it is safe to repeat.
      raise exception 'duplicate_request' using errcode = '23505';
    end if;

    begin
      insert into public.idempotency_keys (key, user_id, operation)
      values (p_key, v_actor, p_operation);
      return null;                    -- the key is ours; go and do the work
    exception when unique_violation then
      -- Another transaction claimed it between the select and the insert.
      -- Round again: this time the select will find it and block on its lock.
      null;
    end;
  end loop;
end;
$fn$;

/** Records what the operation returned, so a later retry can be answered. */
create or replace function public.idempotency_store(p_key text, p_result jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
begin
  if p_key is null or btrim(p_key) = '' then return; end if;
  update public.idempotency_keys
     set result = p_result, completed_at = now()
   where key = p_key;
end;
$fn$;

revoke all on function public.idempotency_claim(text, text) from public;
revoke all on function public.idempotency_store(text, jsonb) from public;
grant execute on function public.idempotency_claim(text, text) to authenticated;
grant execute on function public.idempotency_store(text, jsonb) to authenticated;


-- =============================================================================
-- The dispatcher
--
-- Every operation below already exists, is already guarded, and was already
-- verified in an earlier phase. None of them is touched here. This wraps them
-- instead: claim the key, call the real function, record what it returned.
--
-- Wrapping rather than editing has three advantages worth stating. The eleven
-- functions keep the bodies their phases signed off on. The operation name is an
-- allowlist by construction — `case` has no `else` that runs anything. And the
-- claim, the work and the record all happen inside one transaction, so a failure
-- anywhere releases the key along with everything else.
-- =============================================================================

create or replace function public.idempotent(p_operation text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_key    text := nullif(btrim(p_payload ->> 'idempotency_key'), '');
  v_cached jsonb;
  v_out    jsonb;
begin
  -- A returning key short-circuits everything, including the permission checks
  -- inside the wrapped function — correctly so: the work already happened, was
  -- already authorised, and this is the same caller asking for the answer again.
  v_cached := public.idempotency_claim(v_key, p_operation);
  if v_cached is not null then
    return v_cached || jsonb_build_object('idempotent_replay', true);
  end if;

  case p_operation
    when 'create_sale' then v_out := public.create_sale(p_payload);
    when 'complete_sale' then v_out := public.complete_sale(p_payload);
    when 'create_purchase' then v_out := public.create_purchase(p_payload);
    when 'create_expense' then v_out := public.create_expense(p_payload);
    when 'create_sales_return' then v_out := public.create_sales_return(p_payload);
    when 'create_exchange' then v_out := public.create_exchange(p_payload);
    when 'create_financial_transfer' then v_out := public.create_financial_transfer(p_payload);
    when 'add_sale_payment' then v_out := public.add_sale_payment(p_payload);
    when 'add_purchase_payment' then v_out := public.add_purchase_payment(p_payload);
    when 'add_return_refund' then v_out := public.add_return_refund(p_payload);
    when 'create_inventory_adjustment' then v_out := public.create_inventory_adjustment(p_payload);
    else
      raise exception 'unknown_operation: %', p_operation using errcode = '22023';
  end case;

  perform public.idempotency_store(v_key, v_out);
  return v_out;
end;
$fn$;

revoke all on function public.idempotent(text, jsonb) from public;
grant execute on function public.idempotent(text, jsonb) to authenticated;

comment on function public.idempotent(text, jsonb) is
  'Runs a write operation at most once per idempotency_key. Without a key it simply forwards the call.';
