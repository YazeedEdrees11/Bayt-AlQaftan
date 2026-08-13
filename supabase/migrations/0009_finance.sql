-- بيت القفطان (Bayt Al-Qaftan) — Phase 6
-- Finance: accounts, money ledger, expenses, transfers and adjustments.
--
-- Depends on 0001–0008. Idempotent: safe to re-run.
--
-- ARCHITECTURE
--
-- This phase adds a money ledger; it does NOT add a second copy of the
-- business. Sales stay in `sales`, purchases in `purchases`, refunds in
-- `return_refunds`. `financial_transactions` records only the movement of cash
-- and bank money, and always points back at the record that caused it.
--
-- The link is made by TRIGGERS on the existing payment tables rather than by
-- editing the eight Phase 3–5 functions that write them. Two reasons:
--
--   * Atomicity is structural. A trigger runs inside the same transaction as
--     the payment insert, so a payment can never exist without its ledger row
--     and vice versa — §71 — without eight functions each remembering to do it.
--
--   * Every write path is covered at once, including ones added later, and no
--     verified Phase 3–5 function is touched — §113.
--
-- The payment tables gain a nullable `financial_account_id`. When it is set the
-- trigger uses it; when it is null the trigger falls back to the default
-- account for that payment method. Nullable means the existing RPCs, which
-- name their columns explicitly, keep working untouched.
-- =============================================================================

-- =============================================================================
-- 1. SEQUENCES
-- =============================================================================

create sequence if not exists public.account_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.expense_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.financial_transaction_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.transfer_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.financial_adjustment_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create or replace function public.next_account_number()
returns text language sql volatile set search_path = '' as $$
  select 'ACC-' || lpad(nextval('public.account_number_seq')::text, 6, '0');
$$;
create or replace function public.next_expense_number()
returns text language sql volatile set search_path = '' as $$
  select 'EXP-' || lpad(nextval('public.expense_number_seq')::text, 6, '0');
$$;
create or replace function public.next_financial_transaction_number()
returns text language sql volatile set search_path = '' as $$
  select 'FIN-' || lpad(nextval('public.financial_transaction_seq')::text, 6, '0');
$$;
create or replace function public.next_transfer_number()
returns text language sql volatile set search_path = '' as $$
  select 'TRF-' || lpad(nextval('public.transfer_number_seq')::text, 6, '0');
$$;
create or replace function public.next_financial_adjustment_number()
returns text language sql volatile set search_path = '' as $$
  select 'FAD-' || lpad(nextval('public.financial_adjustment_seq')::text, 6, '0');
$$;

-- =============================================================================
-- 2. FINANCIAL ACCOUNTS
-- =============================================================================

create table if not exists public.financial_accounts (
  id              uuid          primary key default gen_random_uuid(),
  account_number  text          not null default public.next_account_number(),
  name            text          not null,
  account_type    text          not null,
  payment_method  text          null,
  opening_balance numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  is_default      boolean       not null default false,
  is_active       boolean       not null default true,
  notes           text          null,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financial_accounts_number_key') then
    alter table public.financial_accounts add constraint financial_accounts_number_key unique (account_number);
  end if;
end $$;

alter table public.financial_accounts drop constraint if exists financial_accounts_type_check;
alter table public.financial_accounts add constraint financial_accounts_type_check
  check (account_type in ('CASH', 'BANK'));

alter table public.financial_accounts drop constraint if exists financial_accounts_name_check;
alter table public.financial_accounts add constraint financial_accounts_name_check
  check (char_length(btrim(name)) >= 2);

-- A cash account settles cash payments and a bank account settles transfers;
-- keeping the pairing on the row is what lets the triggers resolve an account
-- from a payment method without guessing.
alter table public.financial_accounts drop constraint if exists financial_accounts_method_check;
alter table public.financial_accounts add constraint financial_accounts_method_check
  check (
    (account_type = 'CASH' and coalesce(payment_method, 'CASH') = 'CASH')
    or (account_type = 'BANK' and coalesce(payment_method, 'BANK_TRANSFER') = 'BANK_TRANSFER')
  );

create index if not exists financial_accounts_type_idx   on public.financial_accounts (account_type);
create index if not exists financial_accounts_active_idx on public.financial_accounts (is_active);

-- Exactly one default per account type — the fallback the triggers use.
create unique index if not exists financial_accounts_one_default_idx
  on public.financial_accounts (account_type) where is_default;

comment on column public.financial_accounts.current_balance is
  'Cached copy of the ledger balance. account_balances is the authority (§30).';
comment on column public.financial_accounts.opening_balance is
  'What the account was declared to hold at setup. Posted as an OPENING_BALANCE transaction, so the balance is a single SUM over the ledger and this column never double-counts.';

-- =============================================================================
-- 3. FINANCIAL TRANSACTIONS — the money ledger
-- =============================================================================

create table if not exists public.financial_transactions (
  id                   uuid          primary key default gen_random_uuid(),
  transaction_number   text          not null default public.next_financial_transaction_number(),
  transaction_date     date          not null default current_date,
  transaction_type     text          not null,
  financial_account_id uuid          not null references public.financial_accounts (id) on delete restrict,
  amount               numeric(12,2) not null,
  direction            text          not null,
  reference_type       text          null,
  reference_id         uuid          null,
  description          text          null,
  created_by           uuid          null references auth.users (id) on delete set null,
  created_at           timestamptz   not null default now(),

  -- Direction applied, so a balance is a single SUM.
  signed_amount        numeric(12,2) generated always as (
    case when direction = 'IN' then amount else -amount end
  ) stored
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financial_transactions_number_key') then
    alter table public.financial_transactions
      add constraint financial_transactions_number_key unique (transaction_number);
  end if;
end $$;

alter table public.financial_transactions drop constraint if exists financial_transactions_type_check;
alter table public.financial_transactions add constraint financial_transactions_type_check
  check (transaction_type in (
    'SALE_PAYMENT', 'CUSTOMER_PAYMENT', 'PURCHASE_PAYMENT', 'SUPPLIER_PAYMENT',
    'SALE_REFUND', 'CUSTOMER_REFUND', 'REFUND_REVERSAL',
    'EXPENSE', 'EXPENSE_REVERSAL',
    'OPENING_BALANCE', 'ADJUSTMENT',
    'TRANSFER_IN', 'TRANSFER_OUT'
  ));

alter table public.financial_transactions drop constraint if exists financial_transactions_direction_check;
alter table public.financial_transactions add constraint financial_transactions_direction_check
  check (direction in ('IN', 'OUT'));

alter table public.financial_transactions drop constraint if exists financial_transactions_amount_check;
alter table public.financial_transactions add constraint financial_transactions_amount_check
  check (amount > 0);

-- Most types can only move money one way. Recording an expense as money coming
-- in is a data-entry error the database should refuse, not merely discourage.
alter table public.financial_transactions drop constraint if exists financial_transactions_flow_check;
alter table public.financial_transactions add constraint financial_transactions_flow_check
  check (
    case transaction_type
      when 'SALE_PAYMENT'     then direction = 'IN'
      when 'CUSTOMER_PAYMENT' then direction = 'IN'
      when 'TRANSFER_IN'      then direction = 'IN'
      when 'EXPENSE_REVERSAL' then direction = 'IN'
      when 'REFUND_REVERSAL'  then direction = 'IN'
      when 'PURCHASE_PAYMENT' then direction = 'OUT'
      when 'SUPPLIER_PAYMENT' then direction = 'OUT'
      when 'SALE_REFUND'      then direction = 'OUT'
      when 'CUSTOMER_REFUND'  then direction = 'OUT'
      when 'EXPENSE'          then direction = 'OUT'
      when 'TRANSFER_OUT'     then direction = 'OUT'
      else true   -- OPENING_BALANCE and ADJUSTMENT may go either way
    end
  );

-- §74: one source record produces one ledger row of a given type, so a retry or
-- a re-run of the backfill can never double the money. NULL reference_ids do not
-- collide, which is what lets manual adjustments repeat freely.
create unique index if not exists financial_transactions_source_idx
  on public.financial_transactions (reference_type, reference_id, transaction_type)
  where reference_id is not null;

create index if not exists financial_transactions_date_idx    on public.financial_transactions (transaction_date desc);
create index if not exists financial_transactions_account_idx on public.financial_transactions (financial_account_id);
create index if not exists financial_transactions_type_idx    on public.financial_transactions (transaction_type);
create index if not exists financial_transactions_ref_idx     on public.financial_transactions (reference_type, reference_id);
create index if not exists financial_transactions_balance_idx
  on public.financial_transactions (financial_account_id) include (signed_amount);

comment on table public.financial_transactions is
  'Movement of cash and bank money. Never a substitute for sales, purchases, payments or expenses — always a pointer back to one.';

-- =============================================================================
-- 4. EXPENSE CATEGORIES AND EXPENSES
-- =============================================================================

create table if not exists public.expense_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text        null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.expense_categories drop constraint if exists expense_categories_name_check;
alter table public.expense_categories add constraint expense_categories_name_check
  check (char_length(btrim(name)) >= 2);

create unique index if not exists expense_categories_name_idx on public.expense_categories (btrim(name));

create table if not exists public.expenses (
  id                   uuid          primary key default gen_random_uuid(),
  expense_number       text          not null default public.next_expense_number(),
  expense_category_id  uuid          not null references public.expense_categories (id) on delete restrict,
  amount               numeric(12,2) not null,
  expense_date         date          not null default current_date,
  payment_method       text          not null,
  financial_account_id uuid          not null references public.financial_accounts (id) on delete restrict,
  description          text          null,
  receipt_image_path   text          null,
  status               text          not null default 'COMPLETED',
  cancelled_at         timestamptz   null,
  cancelled_by         uuid          null references auth.users (id) on delete set null,
  cancel_reason        text          null,
  created_by           uuid          null references auth.users (id) on delete set null,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_number_key') then
    alter table public.expenses add constraint expenses_number_key unique (expense_number);
  end if;
end $$;

alter table public.expenses drop constraint if exists expenses_amount_check;
alter table public.expenses add constraint expenses_amount_check check (amount > 0);

alter table public.expenses drop constraint if exists expenses_method_check;
alter table public.expenses add constraint expenses_method_check
  check (payment_method in ('CASH', 'BANK_TRANSFER'));

alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add constraint expenses_status_check
  check (status in ('COMPLETED', 'CANCELLED'));

create index if not exists expenses_date_idx     on public.expenses (expense_date desc);
create index if not exists expenses_category_idx on public.expenses (expense_category_id);
create index if not exists expenses_method_idx   on public.expenses (payment_method);
create index if not exists expenses_account_idx  on public.expenses (financial_account_id);
create index if not exists expenses_status_idx   on public.expenses (status);

-- =============================================================================
-- 5. TRANSFERS AND ADJUSTMENTS
-- =============================================================================

create table if not exists public.financial_transfers (
  id              uuid          primary key default gen_random_uuid(),
  transfer_number text          not null default public.next_transfer_number(),
  transfer_date   date          not null default current_date,
  from_account_id uuid          not null references public.financial_accounts (id) on delete restrict,
  to_account_id   uuid          not null references public.financial_accounts (id) on delete restrict,
  amount          numeric(12,2) not null,
  notes           text          null,
  created_by      uuid          null references auth.users (id) on delete set null,
  created_at      timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financial_transfers_number_key') then
    alter table public.financial_transfers add constraint financial_transfers_number_key unique (transfer_number);
  end if;
end $$;

alter table public.financial_transfers drop constraint if exists financial_transfers_amount_check;
alter table public.financial_transfers add constraint financial_transfers_amount_check check (amount > 0);

alter table public.financial_transfers drop constraint if exists financial_transfers_distinct_check;
alter table public.financial_transfers add constraint financial_transfers_distinct_check
  check (from_account_id <> to_account_id);

create index if not exists financial_transfers_date_idx on public.financial_transfers (transfer_date desc);
create index if not exists financial_transfers_from_idx on public.financial_transfers (from_account_id);
create index if not exists financial_transfers_to_idx   on public.financial_transfers (to_account_id);

create table if not exists public.financial_adjustments (
  id                   uuid          primary key default gen_random_uuid(),
  adjustment_number    text          not null default public.next_financial_adjustment_number(),
  adjustment_date      date          not null default current_date,
  financial_account_id uuid          not null references public.financial_accounts (id) on delete restrict,
  amount               numeric(12,2) not null,
  direction            text          not null,
  reason               text          not null,
  notes                text          null,
  created_by           uuid          null references auth.users (id) on delete set null,
  created_at           timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'financial_adjustments_number_key') then
    alter table public.financial_adjustments
      add constraint financial_adjustments_number_key unique (adjustment_number);
  end if;
end $$;

alter table public.financial_adjustments drop constraint if exists financial_adjustments_amount_check;
alter table public.financial_adjustments add constraint financial_adjustments_amount_check check (amount > 0);

alter table public.financial_adjustments drop constraint if exists financial_adjustments_direction_check;
alter table public.financial_adjustments add constraint financial_adjustments_direction_check
  check (direction in ('IN', 'OUT'));

-- §67: an adjustment without a stated reason is exactly the untraceable edit
-- this table exists to prevent.
alter table public.financial_adjustments drop constraint if exists financial_adjustments_reason_check;
alter table public.financial_adjustments add constraint financial_adjustments_reason_check
  check (char_length(btrim(reason)) >= 3);

create index if not exists financial_adjustments_date_idx    on public.financial_adjustments (adjustment_date desc);
create index if not exists financial_adjustments_account_idx on public.financial_adjustments (financial_account_id);

-- =============================================================================
-- 6. LINKING THE EXISTING PAYMENT TABLES
-- =============================================================================
-- Nullable, so every Phase 3–5 function keeps inserting exactly as it does now.
-- When the column is set the ledger uses that account; when it is null the
-- trigger falls back to the default account for the payment method.

alter table public.sale_payments
  add column if not exists financial_account_id uuid references public.financial_accounts (id) on delete restrict;
alter table public.purchase_payments
  add column if not exists financial_account_id uuid references public.financial_accounts (id) on delete restrict;
alter table public.return_refunds
  add column if not exists financial_account_id uuid references public.financial_accounts (id) on delete restrict;
alter table public.exchanges
  add column if not exists financial_account_id uuid references public.financial_accounts (id) on delete restrict;

create index if not exists sale_payments_account_idx     on public.sale_payments (financial_account_id);
create index if not exists purchase_payments_account_idx on public.purchase_payments (financial_account_id);
create index if not exists return_refunds_account_idx    on public.return_refunds (financial_account_id);

-- =============================================================================
-- 7. TRIGGERS
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['financial_accounts', 'expense_categories', 'expenses'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- §70: money already recorded is never edited or deleted. A correction is a new,
-- opposite row, so the trail of what actually happened stays intact.
create or replace function public.prevent_financial_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'financial_transactions is append-only; post a reversing transaction instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists financial_transactions_immutable on public.financial_transactions;
create trigger financial_transactions_immutable
  before update or delete on public.financial_transactions
  for each row execute function public.prevent_financial_mutation();

-- §65: an account may not be driven below zero. Skipped while the backfill
-- reconstructs history — it is replaying decisions already taken, not making
-- new ones, and intermediate ordering could dip negative on the way.
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

drop trigger if exists financial_transactions_non_negative on public.financial_transactions;
create trigger financial_transactions_non_negative
  before insert on public.financial_transactions
  for each row execute function public.enforce_non_negative_account();

-- Keeps the cached copy in step. account_balances stays the authority.
create or replace function public.refresh_account_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.financial_accounts a
     set current_balance = coalesce((
           select sum(t.signed_amount) from public.financial_transactions t
            where t.financial_account_id = a.id
         ), 0)
   where a.id = new.financial_account_id;
  return null;
end;
$$;

drop trigger if exists financial_transactions_refresh_balance on public.financial_transactions;
create trigger financial_transactions_refresh_balance
  after insert on public.financial_transactions
  for each row execute function public.refresh_account_balance();

-- =============================================================================
-- 8. ACCOUNT RESOLUTION
-- =============================================================================
-- A payment says how it was paid, not into which drawer. This turns the method
-- into an account: the one named on the record if there is one, otherwise the
-- default for that method.

create or replace function public.resolve_financial_account(p_account uuid, p_method text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $fn$
declare v_id uuid;
begin
  if p_account is not null then
    select id into v_id from public.financial_accounts where id = p_account and is_active;
    if not found then
      raise exception 'financial_account_not_found' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  select id into v_id
    from public.financial_accounts
   where is_active and is_default
     and account_type = case when p_method = 'CASH' then 'CASH' else 'BANK' end
   limit 1;

  if v_id is null then
    raise exception 'no_default_account: %', p_method using errcode = 'P0002';
  end if;
  return v_id;
end;
$fn$;

-- =============================================================================
-- 9. INTEGRATION TRIGGERS
-- =============================================================================
-- Each fires inside the transaction that wrote the business record, so the two
-- either both exist or neither does. ON CONFLICT DO NOTHING makes every one of
-- them safe to replay — which is what the backfill relies on.

create or replace function public.link_sale_payment_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_number text;
begin
  select sale_number into v_number from public.sales where id = new.sale_id;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (
    new.payment_date, 'SALE_PAYMENT',
    public.resolve_financial_account(new.financial_account_id, new.payment_method),
    new.amount, 'IN', 'SALE_PAYMENT', new.id,
    'دفعة على البيع ' || coalesce(v_number, ''), new.created_by
  )
  on conflict do nothing;

  return null;
end;
$fn$;

drop trigger if exists sale_payments_to_ledger on public.sale_payments;
create trigger sale_payments_to_ledger
  after insert on public.sale_payments
  for each row execute function public.link_sale_payment_to_ledger();

create or replace function public.link_purchase_payment_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_number text;
begin
  select purchase_number into v_number from public.purchases where id = new.purchase_id;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (
    new.payment_date, 'PURCHASE_PAYMENT',
    public.resolve_financial_account(new.financial_account_id, new.payment_method),
    new.amount, 'OUT', 'PURCHASE_PAYMENT', new.id,
    'دفعة للمورد على الفاتورة ' || coalesce(v_number, ''), new.created_by
  )
  on conflict do nothing;

  return null;
end;
$fn$;

drop trigger if exists purchase_payments_to_ledger on public.purchase_payments;
create trigger purchase_payments_to_ledger
  after insert on public.purchase_payments
  for each row execute function public.link_purchase_payment_to_ledger();

-- §27 and §94: store credit moves nothing. The customer's account absorbs it,
-- and no cash or bank row is written at all.
create or replace function public.link_return_refund_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v_number text;
begin
  if new.refund_method = 'CUSTOMER_CREDIT' then
    return null;
  end if;

  select return_number into v_number from public.sales_returns where id = new.return_id;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (
    new.refund_date, 'SALE_REFUND',
    public.resolve_financial_account(new.financial_account_id, new.refund_method),
    new.amount, 'OUT', 'RETURN_REFUND', new.id,
    'استرداد على المرتجع ' || coalesce(v_number, ''), new.created_by
  )
  on conflict do nothing;

  return null;
end;
$fn$;

drop trigger if exists return_refunds_to_ledger on public.return_refunds;
create trigger return_refunds_to_ledger
  after insert on public.return_refunds
  for each row execute function public.link_return_refund_to_ledger();

-- An exchange settles only its difference, and only when it actually changes
-- hands; left on the customer's account it is not a cash movement.
create or replace function public.link_exchange_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.difference_amount is null or new.difference_amount <= 0
     or new.settlement_method is null
     or new.settlement_method not in ('CASH', 'BANK_TRANSFER')
     or new.difference_direction = 'EVEN' then
    return null;
  end if;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (
    new.exchange_date,
    case when new.difference_direction = 'CUSTOMER_PAYS' then 'CUSTOMER_PAYMENT' else 'CUSTOMER_REFUND' end,
    public.resolve_financial_account(new.financial_account_id, new.settlement_method),
    new.difference_amount,
    case when new.difference_direction = 'CUSTOMER_PAYS' then 'IN' else 'OUT' end,
    'EXCHANGE', new.id,
    'فرق الاستبدال ' || new.exchange_number, new.created_by
  )
  on conflict do nothing;

  return null;
end;
$fn$;

-- Fires on UPDATE because create_exchange inserts the header first and fills in
-- the settlement afterwards, once both legs are priced.
drop trigger if exists exchanges_to_ledger on public.exchanges;
create trigger exchanges_to_ledger
  after insert or update of difference_amount, settlement_method, difference_direction
  on public.exchanges
  for each row execute function public.link_exchange_to_ledger();

-- Cancelling a return that was paid out in cash means the money comes back.
create or replace function public.reverse_return_refunds_on_cancel()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare r record;
begin
  if new.status <> 'CANCELLED' or old.status = 'CANCELLED' then
    return null;
  end if;

  for r in
    select * from public.return_refunds
     where return_id = new.id and refund_method in ('CASH', 'BANK_TRANSFER')
  loop
    insert into public.financial_transactions (
      transaction_date, transaction_type, financial_account_id, amount, direction,
      reference_type, reference_id, description, created_by
    )
    values (
      current_date, 'REFUND_REVERSAL',
      public.resolve_financial_account(r.financial_account_id, r.refund_method),
      r.amount, 'IN', 'RETURN_REFUND', r.id,
      'عكس استرداد المرتجع ' || new.return_number, new.cancelled_by
    )
    on conflict do nothing;
  end loop;

  return null;
end;
$fn$;

drop trigger if exists sales_returns_reverse_refunds on public.sales_returns;
create trigger sales_returns_reverse_refunds
  after update of status on public.sales_returns
  for each row execute function public.reverse_return_refunds_on_cancel();

-- =============================================================================
-- 10. VIEWS
-- =============================================================================

-- §30: the ledger is the authority. An opening balance is itself a transaction,
-- so a balance is one SUM and nothing can drift.
create or replace view public.account_balances
with (security_invoker = on) as
select
  a.id                                             as account_id,
  a.account_number,
  a.name,
  a.account_type,
  a.opening_balance,
  a.is_active,
  a.is_default,
  coalesce(sum(t.amount) filter (where t.direction = 'IN'), 0)::numeric  as total_in,
  coalesce(sum(t.amount) filter (where t.direction = 'OUT'), 0)::numeric as total_out,
  coalesce(sum(t.signed_amount), 0)::numeric                             as balance
from public.financial_accounts a
left join public.financial_transactions t on t.financial_account_id = a.id
group by a.id, a.account_number, a.name, a.account_type, a.opening_balance, a.is_active, a.is_default;

comment on view public.account_balances is
  'Authoritative balance per account, derived from the ledger. financial_accounts.current_balance is only a cache.';

-- Customer receivables built on the Phase 4 ledger rather than a second sum.
create or replace view public.customer_receivables
with (security_invoker = on) as
select
  c.id                                                                     as customer_id,
  c.customer_number,
  c.name,
  c.phone,
  coalesce(b.total_sales, 0)::numeric                                      as total_sales,
  coalesce(b.total_paid, 0)::numeric                                       as total_paid,
  coalesce(b.total_returns, 0)::numeric                                    as total_returns,
  coalesce(b.total_refunded, 0)::numeric                                   as total_refunded,
  coalesce(b.balance, 0)::numeric                                          as outstanding,
  (select max(p.payment_date) from public.sale_payments p
    join public.sales s on s.id = p.sale_id where s.customer_id = c.id)    as last_payment_date
from public.customers c
left join public.customer_balance b on b.customer_id = c.id;

-- Supplier payables, likewise from the Phase 3 ledger.
create or replace view public.supplier_payables
with (security_invoker = on) as
select
  s.id                                                                       as supplier_id,
  s.name,
  s.phone,
  coalesce(b.total_purchases, 0)::numeric                                    as total_purchases,
  coalesce(b.total_paid, 0)::numeric                                         as total_paid,
  coalesce(b.balance, 0)::numeric                                            as outstanding,
  (select max(p.payment_date) from public.purchase_payments p
    join public.purchases pu on pu.id = p.purchase_id where pu.supplier_id = s.id) as last_payment_date
from public.suppliers s
left join public.supplier_balance b on b.supplier_id = s.id;

grant select on public.account_balances, public.customer_receivables, public.supplier_payables
  to authenticated;

-- =============================================================================
-- 11. ROLE GATES
-- =============================================================================

create or replace function public.can_view_finance()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false)
     and public.is_active_user();
$fn$;

create or replace function public.can_manage_finance()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false)
     and public.is_active_user();
$fn$;

-- Accounts and manual ledger corrections are the two things that can quietly
-- rewrite the shop's financial position, so both stay with the owner.
create or replace function public.can_administer_finance()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select coalesce(public.current_user_role() = 'ADMIN', false)
     and public.is_active_user();
$fn$;

revoke all on function public.can_view_finance()       from public;
revoke all on function public.can_manage_finance()     from public;
revoke all on function public.can_administer_finance() from public;
grant execute on function public.can_view_finance()       to authenticated, service_role;
grant execute on function public.can_manage_finance()     to authenticated, service_role;
grant execute on function public.can_administer_finance() to authenticated, service_role;

-- =============================================================================
-- 12. WRITE OPERATIONS
-- =============================================================================

create or replace function public.create_financial_account(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_id      uuid;
  v_number  text;
  v_type    text := upper(coalesce(p_payload ->> 'account_type', 'CASH'));
  v_opening numeric(12,2) := coalesce(nullif(p_payload ->> 'opening_balance', '')::numeric, 0);
  v_default boolean := coalesce((p_payload ->> 'is_default')::boolean, false);
begin
  if not public.can_administer_finance() then
    raise exception 'forbidden: insufficient permission to manage accounts' using errcode = '42501';
  end if;
  if v_type not in ('CASH', 'BANK') then
    raise exception 'invalid_account_type' using errcode = '22023';
  end if;
  if v_opening < 0 then
    raise exception 'invalid_opening_balance' using errcode = '22023';
  end if;

  -- One default per type; claiming it takes it from whoever held it.
  if v_default then
    update public.financial_accounts set is_default = false
     where account_type = v_type and is_default;
  end if;

  insert into public.financial_accounts (
    name, account_type, payment_method, opening_balance, is_default, is_active, notes
  )
  values (
    btrim(p_payload ->> 'name'), v_type,
    case when v_type = 'CASH' then 'CASH' else 'BANK_TRANSFER' end,
    v_opening, v_default,
    coalesce((p_payload ->> 'is_active')::boolean, true),
    nullif(btrim(p_payload ->> 'notes'), '')
  )
  returning id, account_number into v_id, v_number;

  -- §29: the opening balance is itself a movement, so the ledger alone explains
  -- every figure on the account.
  if v_opening > 0 then
    insert into public.financial_transactions (
      transaction_date, transaction_type, financial_account_id, amount, direction,
      reference_type, reference_id, description, created_by
    )
    values (current_date, 'OPENING_BALANCE', v_id, v_opening, 'IN',
            'FINANCIAL_ACCOUNT', v_id, 'رصيد افتتاحي — ' || btrim(p_payload ->> 'name'), v_actor);
  end if;

  return jsonb_build_object('id', v_id, 'account_number', v_number,
                            'name', btrim(p_payload ->> 'name'), 'account_type', v_type,
                            'opening_balance', v_opening);
end;
$fn$;

create or replace function public.update_financial_account(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_id      uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_type    text;
  v_default boolean := coalesce((p_payload ->> 'is_default')::boolean, false);
begin
  if not public.can_administer_finance() then
    raise exception 'forbidden: insufficient permission to manage accounts' using errcode = '42501';
  end if;

  select account_type into v_type from public.financial_accounts where id = v_id;
  if not found then raise exception 'financial_account_not_found' using errcode = 'P0002'; end if;

  if v_default then
    update public.financial_accounts set is_default = false
     where account_type = v_type and is_default and id <> v_id;
  end if;

  -- The opening balance is deliberately not editable here: it has already been
  -- posted to the ledger, and silently changing it would move money that no
  -- transaction accounts for. Post an adjustment instead.
  update public.financial_accounts
     set name       = coalesce(nullif(btrim(p_payload ->> 'name'), ''), name),
         is_default = v_default,
         is_active  = coalesce((p_payload ->> 'is_active')::boolean, is_active),
         notes      = nullif(btrim(p_payload ->> 'notes'), '')
   where id = v_id;

  return jsonb_build_object('id', v_id);
end;
$fn$;

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

-- §69: a completed expense is never deleted. Cancelling posts the money back.
create or replace function public.cancel_expense(p_expense_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_exp   record;
begin
  if not public.can_manage_finance() then
    raise exception 'forbidden: insufficient permission to cancel expenses' using errcode = '42501';
  end if;

  select * into v_exp from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'expense_not_found' using errcode = 'P0002'; end if;
  if v_exp.status <> 'COMPLETED' then
    raise exception 'expense_not_cancellable' using errcode = '22023';
  end if;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  values (current_date, 'EXPENSE_REVERSAL', v_exp.financial_account_id, v_exp.amount, 'IN',
          'EXPENSE', p_expense_id, 'إلغاء مصروف ' || v_exp.expense_number, v_actor);

  update public.expenses
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_expense_id;

  return jsonb_build_object('id', p_expense_id, 'expense_number', v_exp.expense_number,
                            'amount', v_exp.amount);
end;
$fn$;

-- §35: a transfer moves money between drawers. It is not income and not an
-- expense, which is why both legs carry TRANSFER_ types the reports exclude.
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

revoke all on function public.create_financial_account(jsonb)     from public;
revoke all on function public.update_financial_account(jsonb)     from public;
revoke all on function public.create_expense(jsonb)               from public;
revoke all on function public.cancel_expense(uuid, text)          from public;
revoke all on function public.create_financial_transfer(jsonb)    from public;
revoke all on function public.create_financial_adjustment(jsonb)  from public;
grant execute on function public.create_financial_account(jsonb)    to authenticated;
grant execute on function public.update_financial_account(jsonb)    to authenticated;
grant execute on function public.create_expense(jsonb)              to authenticated;
grant execute on function public.cancel_expense(uuid, text)         to authenticated;
grant execute on function public.create_financial_transfer(jsonb)   to authenticated;
grant execute on function public.create_financial_adjustment(jsonb) to authenticated;

-- =============================================================================
-- 13. HISTORICAL BACKFILL
-- =============================================================================
-- §73 and §99: maps payments that already existed before this phase into the
-- ledger. Idempotent by construction — every insert relies on the same unique
-- index the live triggers do, so running it twice creates nothing the second
-- time. The balance guard is stood down because this is replaying decisions
-- already taken, and a mid-replay ordering could dip below zero on the way.

create or replace function public.backfill_financial_transactions()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_before integer;
  v_after  integer;
  v_sale   integer;
  v_purch  integer;
  v_refund integer;
  v_exch   integer;
begin
  if not public.can_administer_finance() then
    raise exception 'forbidden: only an administrator may run the backfill' using errcode = '42501';
  end if;

  perform set_config('app.finance_backfill', 'on', true);
  select count(*) into v_before from public.financial_transactions;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  select p.payment_date, 'SALE_PAYMENT',
         public.resolve_financial_account(p.financial_account_id, p.payment_method),
         p.amount, 'IN', 'SALE_PAYMENT', p.id,
         'دفعة على البيع ' || coalesce(s.sale_number, ''), p.created_by
    from public.sale_payments p
    join public.sales s on s.id = p.sale_id
  on conflict do nothing;
  get diagnostics v_sale = row_count;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  select p.payment_date, 'PURCHASE_PAYMENT',
         public.resolve_financial_account(p.financial_account_id, p.payment_method),
         p.amount, 'OUT', 'PURCHASE_PAYMENT', p.id,
         'دفعة للمورد على الفاتورة ' || coalesce(pu.purchase_number, ''), p.created_by
    from public.purchase_payments p
    join public.purchases pu on pu.id = p.purchase_id
  on conflict do nothing;
  get diagnostics v_purch = row_count;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  select r.refund_date, 'SALE_REFUND',
         public.resolve_financial_account(r.financial_account_id, r.refund_method),
         r.amount, 'OUT', 'RETURN_REFUND', r.id,
         'استرداد على المرتجع ' || coalesce(sr.return_number, ''), r.created_by
    from public.return_refunds r
    join public.sales_returns sr on sr.id = r.return_id
   where r.refund_method in ('CASH', 'BANK_TRANSFER')
  on conflict do nothing;
  get diagnostics v_refund = row_count;

  insert into public.financial_transactions (
    transaction_date, transaction_type, financial_account_id, amount, direction,
    reference_type, reference_id, description, created_by
  )
  select e.exchange_date,
         case when e.difference_direction = 'CUSTOMER_PAYS' then 'CUSTOMER_PAYMENT' else 'CUSTOMER_REFUND' end,
         public.resolve_financial_account(e.financial_account_id, e.settlement_method),
         e.difference_amount,
         case when e.difference_direction = 'CUSTOMER_PAYS' then 'IN' else 'OUT' end,
         'EXCHANGE', e.id, 'فرق الاستبدال ' || e.exchange_number, e.created_by
    from public.exchanges e
   where e.status <> 'CANCELLED'
     and e.difference_amount > 0
     and e.settlement_method in ('CASH', 'BANK_TRANSFER')
     and e.difference_direction <> 'EVEN'
  on conflict do nothing;
  get diagnostics v_exch = row_count;

  select count(*) into v_after from public.financial_transactions;

  return jsonb_build_object(
    'created', v_after - v_before,
    'sale_payments', v_sale,
    'purchase_payments', v_purch,
    'return_refunds', v_refund,
    'exchange_differences', v_exch,
    'total_transactions', v_after
  );
end;
$fn$;

revoke all on function public.backfill_financial_transactions() from public;
grant execute on function public.backfill_financial_transactions() to authenticated;

-- =============================================================================
-- 14. REPORTING
-- =============================================================================
-- §39 and §64: period figures and point-in-time balances are different animals.
-- Revenue, expenses and cash flow honour the date range; account balances,
-- receivables and payables are what is true right now and ignore it. Mixing the
-- two is the mistake that makes a dashboard say profit equals cash.

drop function if exists public.finance_summary(date, date);
create or replace function public.finance_summary(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  gross_sales          numeric,
  sales_discounts      numeric,
  sales_returns        numeric,
  net_sales            numeric,
  cogs                 numeric,
  gross_profit         numeric,
  gross_margin         numeric,
  operating_expenses   numeric,
  operating_profit     numeric,
  total_purchases      numeric,
  purchase_payments    numeric,
  payments_received    numeric,
  payments_made        numeric,
  refunds_paid         numeric,
  cash_in              numeric,
  cash_out             numeric,
  net_cash_flow        numeric,
  cash_balance         numeric,
  bank_balance         numeric,
  customer_receivables numeric,
  supplier_payables    numeric
)
language sql stable set search_path = public as $fn$
  with s as (
    select * from public.sales
     where status = 'COMPLETED'
       and (p_date_from is null or sale_date >= p_date_from)
       and (p_date_to   is null or sale_date <= p_date_to)
  ),
  r as (
    select * from public.sales_returns
     where status <> 'CANCELLED'
       and (p_date_from is null or return_date >= p_date_from)
       and (p_date_to   is null or return_date <= p_date_to)
  ),
  p as (
    select * from public.purchases
     where status = 'COMPLETED'
       and (p_date_from is null or purchase_date >= p_date_from)
       and (p_date_to   is null or purchase_date <= p_date_to)
  ),
  e as (
    select * from public.expenses
     where status = 'COMPLETED'
       and (p_date_from is null or expense_date >= p_date_from)
       and (p_date_to   is null or expense_date <= p_date_to)
  ),
  ft as (
    select * from public.financial_transactions
     where (p_date_from is null or transaction_date >= p_date_from)
       and (p_date_to   is null or transaction_date <= p_date_to)
  ),
  base as (
    select
      coalesce((select sum(subtotal)     from s), 0) as gross,
      coalesce((select sum(discount)     from s), 0) as disc,
      coalesce((select sum(total_amount) from s), 0) as sold,
      coalesce((select sum(total_cost)   from s), 0) as cost,
      coalesce((select sum(refund_amount) from r), 0) as ret,
      coalesce((select sum(total_cost)    from r), 0) as retcost,
      coalesce((select sum(amount)       from e), 0) as exp
  ),
  calc as (
    select
      base.*,
      (base.sold - base.ret)              as net_sales,
      (base.cost - base.retcost)          as net_cogs
    from base
  )
  select
    calc.gross::numeric,
    calc.disc::numeric,
    calc.ret::numeric,
    calc.net_sales::numeric,
    calc.net_cogs::numeric,
    (calc.net_sales - calc.net_cogs)::numeric,
    case when calc.net_sales > 0
      then round(((calc.net_sales - calc.net_cogs) / calc.net_sales) * 100, 2)
      else 0 end::numeric,
    calc.exp::numeric,
    (calc.net_sales - calc.net_cogs - calc.exp)::numeric,
    coalesce((select sum(total_amount) from p), 0)::numeric,
    coalesce((select sum(amount) from ft where transaction_type = 'PURCHASE_PAYMENT'), 0)::numeric,
    coalesce((select sum(amount) from ft
               where transaction_type in ('SALE_PAYMENT', 'CUSTOMER_PAYMENT')), 0)::numeric,
    coalesce((select sum(amount) from ft
               where transaction_type in ('PURCHASE_PAYMENT', 'SUPPLIER_PAYMENT')), 0)::numeric,
    coalesce((select sum(amount) from ft
               where transaction_type in ('SALE_REFUND', 'CUSTOMER_REFUND')), 0)::numeric,
    -- §47: transfers and opening balances are not business cash flow. Moving
    -- money between your own drawers is not income, and neither is declaring
    -- what was already in one.
    coalesce((select sum(amount) from ft
               where direction = 'IN'
                 and transaction_type not in ('TRANSFER_IN', 'OPENING_BALANCE')), 0)::numeric,
    coalesce((select sum(amount) from ft
               where direction = 'OUT'
                 and transaction_type <> 'TRANSFER_OUT'), 0)::numeric,
    (coalesce((select sum(amount) from ft
                where direction = 'IN'
                  and transaction_type not in ('TRANSFER_IN', 'OPENING_BALANCE')), 0)
     - coalesce((select sum(amount) from ft
                  where direction = 'OUT'
                    and transaction_type <> 'TRANSFER_OUT'), 0))::numeric,
    -- Point-in-time: what is in the drawers right now, whatever range is shown.
    coalesce((select sum(balance) from public.account_balances
               where account_type = 'CASH' and is_active), 0)::numeric,
    coalesce((select sum(balance) from public.account_balances
               where account_type = 'BANK' and is_active), 0)::numeric,
    coalesce((select sum(outstanding) from public.customer_receivables where outstanding > 0), 0)::numeric,
    coalesce((select sum(outstanding) from public.supplier_payables where outstanding > 0), 0)::numeric
  from calc;
$fn$;

drop function if exists public.search_expenses(text, uuid, text, uuid, text, date, date, numeric, numeric, integer, integer);
create or replace function public.search_expenses(
  p_search     text default null,
  p_category   uuid default null,
  p_method     text default 'ALL',
  p_account    uuid default null,
  p_status     text default 'ALL',
  p_date_from  date default null,
  p_date_to    date default null,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_limit      integer default 20,
  p_offset     integer default 0
)
returns table (
  id             uuid,
  expense_number text,
  expense_date   date,
  category_id    uuid,
  category_name  text,
  amount         numeric,
  payment_method text,
  account_id     uuid,
  account_name   text,
  description    text,
  status         text,
  created_by_name text,
  created_at     timestamptz,
  total_count    bigint
)
language sql stable set search_path = public as $fn$
  with filtered as (
    select e.id, e.expense_number, e.expense_date, e.expense_category_id, c.name,
           e.amount, e.payment_method, e.financial_account_id, a.name,
           e.description, e.status, pr.full_name, e.created_at
    from public.expenses e
    join public.expense_categories c   on c.id = e.expense_category_id
    join public.financial_accounts a   on a.id = e.financial_account_id
    left join public.profiles pr       on pr.id = e.created_by
    where (p_category is null or e.expense_category_id = p_category)
      and (p_method = 'ALL' or e.payment_method = p_method)
      and (p_account is null or e.financial_account_id = p_account)
      and (p_status = 'ALL' or e.status = p_status)
      and (p_date_from is null or e.expense_date >= p_date_from)
      and (p_date_to   is null or e.expense_date <= p_date_to)
      and (p_min_amount is null or e.amount >= p_min_amount)
      and (p_max_amount is null or e.amount <= p_max_amount)
      and (
        p_search is null or btrim(p_search) = ''
        or e.expense_number ilike '%' || btrim(p_search) || '%'
        or coalesce(e.description, '') ilike '%' || btrim(p_search) || '%'
        or c.name ilike '%' || btrim(p_search) || '%'
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.expense_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

drop function if exists public.search_financial_transactions(text, uuid, text, text, date, date, integer, integer);
create or replace function public.search_financial_transactions(
  p_search    text default null,
  p_account   uuid default null,
  p_type      text default 'ALL',
  p_direction text default 'ALL',
  p_date_from date default null,
  p_date_to   date default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns table (
  id                 uuid,
  transaction_number text,
  transaction_date   date,
  transaction_type   text,
  account_id         uuid,
  account_name       text,
  account_type       text,
  amount             numeric,
  direction          text,
  signed_amount      numeric,
  reference_type     text,
  reference_id       uuid,
  description        text,
  created_by_name    text,
  created_at         timestamptz,
  total_count        bigint
)
language sql stable set search_path = public as $fn$
  with filtered as (
    select t.id, t.transaction_number, t.transaction_date, t.transaction_type,
           t.financial_account_id, a.name, a.account_type,
           t.amount, t.direction, t.signed_amount,
           t.reference_type, t.reference_id, t.description, pr.full_name, t.created_at
    from public.financial_transactions t
    join public.financial_accounts a on a.id = t.financial_account_id
    left join public.profiles pr     on pr.id = t.created_by
    where (p_account is null or t.financial_account_id = p_account)
      and (p_type = 'ALL' or t.transaction_type = p_type)
      and (p_direction = 'ALL' or t.direction = p_direction)
      and (p_date_from is null or t.transaction_date >= p_date_from)
      and (p_date_to   is null or t.transaction_date <= p_date_to)
      and (
        p_search is null or btrim(p_search) = ''
        or t.transaction_number ilike '%' || btrim(p_search) || '%'
        or coalesce(t.description, '') ilike '%' || btrim(p_search) || '%'
        or a.name ilike '%' || btrim(p_search) || '%'
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.transaction_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

-- §51: one account's history with a running balance, oldest first so the
-- balance column reads the way a bank statement does.
drop function if exists public.account_ledger(uuid, integer);
create or replace function public.account_ledger(p_account_id uuid, p_limit integer default 200)
returns table (
  id                 uuid,
  transaction_number text,
  transaction_date   date,
  transaction_type   text,
  description        text,
  money_in           numeric,
  money_out          numeric,
  running_balance    numeric,
  reference_type     text,
  reference_id       uuid,
  created_at         timestamptz
)
language sql stable set search_path = public as $fn$
  select
    t.id, t.transaction_number, t.transaction_date, t.transaction_type, t.description,
    case when t.direction = 'IN'  then t.amount else 0 end::numeric,
    case when t.direction = 'OUT' then t.amount else 0 end::numeric,
    sum(t.signed_amount) over (
      order by t.transaction_date, t.created_at, t.id
      rows between unbounded preceding and current row
    )::numeric,
    t.reference_type, t.reference_id, t.created_at
  from public.financial_transactions t
  where t.financial_account_id = p_account_id
  order by t.transaction_date, t.created_at, t.id
  limit greatest(p_limit, 1);
$fn$;

drop function if exists public.expense_report(date, date);
create or replace function public.expense_report(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  category_id   uuid,
  category_name text,
  total         numeric,
  entry_count   integer,
  percentage    numeric
)
language sql stable set search_path = public as $fn$
  with e as (
    select * from public.expenses
     where status = 'COMPLETED'
       and (p_date_from is null or expense_date >= p_date_from)
       and (p_date_to   is null or expense_date <= p_date_to)
  ),
  total as (select coalesce(sum(amount), 0) as grand from e)
  select c.id, c.name,
         coalesce(sum(e.amount), 0)::numeric,
         count(e.id)::integer,
         case when (select grand from total) > 0
           then round((coalesce(sum(e.amount), 0) / (select grand from total)) * 100, 2)
           else 0 end::numeric
  from public.expense_categories c
  join e on e.expense_category_id = c.id
  group by c.id, c.name
  order by 3 desc;
$fn$;

-- §62: how the money actually arrived and left, split by method.
drop function if exists public.payment_method_breakdown(date, date);
create or replace function public.payment_method_breakdown(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  method        text,
  money_in      numeric,
  money_out     numeric,
  net           numeric,
  in_percentage numeric
)
language sql stable set search_path = public as $fn$
  with ft as (
    select t.*, a.account_type
    from public.financial_transactions t
    join public.financial_accounts a on a.id = t.financial_account_id
    where (p_date_from is null or t.transaction_date >= p_date_from)
      and (p_date_to   is null or t.transaction_date <= p_date_to)
      and t.transaction_type not in ('TRANSFER_IN', 'TRANSFER_OUT', 'OPENING_BALANCE')
  ),
  totals as (select coalesce(sum(amount) filter (where direction = 'IN'), 0) as grand_in from ft)
  select
    m.method,
    coalesce(sum(ft.amount) filter (where ft.direction = 'IN'), 0)::numeric,
    coalesce(sum(ft.amount) filter (where ft.direction = 'OUT'), 0)::numeric,
    coalesce(sum(ft.signed_amount), 0)::numeric,
    case when (select grand_in from totals) > 0
      then round((coalesce(sum(ft.amount) filter (where ft.direction = 'IN'), 0)
                  / (select grand_in from totals)) * 100, 2)
      else 0 end::numeric
  from (values ('CASH'), ('BANK_TRANSFER')) as m(method)
  left join ft on ft.account_type = case when m.method = 'CASH' then 'CASH' else 'BANK' end
  group by m.method;
$fn$;

-- §60 and §61: sales, expenses and gross profit over time for the charts.
drop function if exists public.finance_series(date, date, text);
create or replace function public.finance_series(
  p_date_from date default null,
  p_date_to   date default null,
  p_bucket    text default 'day'
)
returns table (
  bucket       date,
  net_sales    numeric,
  cogs         numeric,
  gross_profit numeric,
  expenses     numeric
)
language sql stable set search_path = public as $fn$
  with span as (
    select coalesce(p_date_from, (select min(sale_date) from public.sales), current_date) as d0,
           coalesce(p_date_to, current_date) as d1
  ),
  step as (
    select case when p_bucket = 'month' then '1 month'::interval
                when p_bucket = 'week'  then '1 week'::interval
                else '1 day'::interval end as iv
  ),
  buckets as (
    select generate_series(
             date_trunc(case when p_bucket = 'month' then 'month'
                             when p_bucket = 'week'  then 'week' else 'day' end,
                        (select d0 from span))::date,
             (select d1 from span),
             (select iv from step)
           )::date as bucket
  )
  select
    b.bucket,
    coalesce((select sum(s.total_amount) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket and s.sale_date < b.bucket + (select iv from step)), 0)
    - coalesce((select sum(r.refund_amount) from public.sales_returns r
                 where r.status <> 'CANCELLED'
                   and r.return_date >= b.bucket and r.return_date < b.bucket + (select iv from step)), 0),
    coalesce((select sum(s.total_cost) from public.sales s
               where s.status = 'COMPLETED'
                 and s.sale_date >= b.bucket and s.sale_date < b.bucket + (select iv from step)), 0)
    - coalesce((select sum(r.total_cost) from public.sales_returns r
                 where r.status <> 'CANCELLED'
                   and r.return_date >= b.bucket and r.return_date < b.bucket + (select iv from step)), 0),
    0::numeric,
    coalesce((select sum(e.amount) from public.expenses e
               where e.status = 'COMPLETED'
                 and e.expense_date >= b.bucket and e.expense_date < b.bucket + (select iv from step)), 0)
  from buckets b
  order by b.bucket;
$fn$;

-- §52: one day's cash drawer, opening to closing.
drop function if exists public.daily_cash_summary(date);
create or replace function public.daily_cash_summary(p_date date default current_date)
returns table (
  opening_cash      numeric,
  sale_payments     numeric,
  customer_payments numeric,
  transfers_in      numeric,
  purchase_payments numeric,
  supplier_payments numeric,
  expenses          numeric,
  refunds           numeric,
  transfers_out     numeric,
  closing_cash      numeric
)
language sql stable set search_path = public as $fn$
  with cash_accounts as (
    select id from public.financial_accounts where account_type = 'CASH' and is_active
  ),
  before_day as (
    select coalesce(sum(signed_amount), 0) as bal
    from public.financial_transactions
    where financial_account_id in (select id from cash_accounts)
      and transaction_date < p_date
  ),
  day as (
    select * from public.financial_transactions
    where financial_account_id in (select id from cash_accounts)
      and transaction_date = p_date
  )
  select
    (select bal from before_day)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'SALE_PAYMENT'), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'CUSTOMER_PAYMENT'), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'TRANSFER_IN'), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'PURCHASE_PAYMENT'), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'SUPPLIER_PAYMENT'), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'EXPENSE'), 0)::numeric,
    coalesce((select sum(amount) from day
               where transaction_type in ('SALE_REFUND', 'CUSTOMER_REFUND')), 0)::numeric,
    coalesce((select sum(amount) from day where transaction_type = 'TRANSFER_OUT'), 0)::numeric,
    ((select bal from before_day) + coalesce((select sum(signed_amount) from day), 0))::numeric;
$fn$;

grant execute on function public.finance_summary(date, date) to authenticated;
grant execute on function public.search_expenses(text, uuid, text, uuid, text, date, date, numeric, numeric, integer, integer) to authenticated;
grant execute on function public.search_financial_transactions(text, uuid, text, text, date, date, integer, integer) to authenticated;
grant execute on function public.account_ledger(uuid, integer) to authenticated;
grant execute on function public.expense_report(date, date) to authenticated;
grant execute on function public.payment_method_breakdown(date, date) to authenticated;
grant execute on function public.finance_series(date, date, text) to authenticated;
grant execute on function public.daily_cash_summary(date) to authenticated;

-- =============================================================================
-- 15. ROW LEVEL SECURITY
-- =============================================================================
-- §83: finance is ADMIN and MANAGER. STAFF sees none of it — not balances, not
-- transactions, not expenses.

alter table public.financial_accounts     enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.expense_categories     enable row level security;
alter table public.expenses               enable row level security;
alter table public.financial_transfers    enable row level security;
alter table public.financial_adjustments  enable row level security;

drop policy if exists financial_accounts_select     on public.financial_accounts;
drop policy if exists financial_transactions_select on public.financial_transactions;
drop policy if exists expense_categories_select     on public.expense_categories;
drop policy if exists expenses_select               on public.expenses;
drop policy if exists financial_transfers_select    on public.financial_transfers;
drop policy if exists financial_adjustments_select  on public.financial_adjustments;

create policy financial_accounts_select on public.financial_accounts
  for select to authenticated using ((select public.can_view_finance()));
create policy financial_transactions_select on public.financial_transactions
  for select to authenticated using ((select public.can_view_finance()));
create policy expense_categories_select on public.expense_categories
  for select to authenticated using ((select public.can_view_finance()));
create policy expenses_select on public.expenses
  for select to authenticated using ((select public.can_view_finance()));
create policy financial_transfers_select on public.financial_transfers
  for select to authenticated using ((select public.can_view_finance()));
create policy financial_adjustments_select on public.financial_adjustments
  for select to authenticated using ((select public.can_administer_finance()));

revoke all on public.financial_accounts, public.financial_transactions,
              public.expense_categories, public.expenses,
              public.financial_transfers, public.financial_adjustments
  from authenticated, anon;

grant select on public.financial_accounts     to authenticated;
grant select on public.financial_transactions to authenticated;
grant select on public.expense_categories     to authenticated;
grant select on public.expenses               to authenticated;
grant select on public.financial_transfers    to authenticated;
grant select on public.financial_adjustments  to authenticated;

grant usage, select on sequence public.account_number_seq          to authenticated;
grant usage, select on sequence public.expense_number_seq          to authenticated;
grant usage, select on sequence public.financial_transaction_seq   to authenticated;
grant usage, select on sequence public.transfer_number_seq         to authenticated;
grant usage, select on sequence public.financial_adjustment_seq    to authenticated;

-- =============================================================================
-- 16. STORAGE — expense receipts
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts', 'expense-receipts', false, 5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

do $do$
begin
  drop policy if exists expense_receipts_read   on storage.objects;
  drop policy if exists expense_receipts_write  on storage.objects;
  drop policy if exists expense_receipts_update on storage.objects;
  drop policy if exists expense_receipts_delete on storage.objects;

  create policy expense_receipts_read
    on storage.objects for select to authenticated
    using (bucket_id = 'expense-receipts' and (select public.can_view_finance()));

  create policy expense_receipts_write
    on storage.objects for insert to authenticated
    with check (bucket_id = 'expense-receipts' and (select public.can_manage_finance()));

  create policy expense_receipts_update
    on storage.objects for update to authenticated
    using (bucket_id = 'expense-receipts' and (select public.can_manage_finance()))
    with check (bucket_id = 'expense-receipts' and (select public.can_manage_finance()));

  create policy expense_receipts_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'expense-receipts' and (select public.can_administer_finance()));
end
$do$;

-- =============================================================================
-- 17. SEED
-- =============================================================================
-- These two accounts are NOT optional decoration. Every sale payment now
-- resolves an account through resolve_financial_account(), and without a
-- default for each method that lookup raises and the sale fails. Seeding them
-- is what keeps Phases 3–5 working the moment this migration lands.

insert into public.financial_accounts (name, account_type, payment_method, opening_balance, is_default, is_active, notes)
select 'الصندوق', 'CASH', 'CASH', 0, true, true, 'صندوق المحل النقدي'
where not exists (select 1 from public.financial_accounts where account_type = 'CASH');

insert into public.financial_accounts (name, account_type, payment_method, opening_balance, is_default, is_active, notes)
select 'البنك', 'BANK', 'BANK_TRANSFER', 0, true, true, 'الحساب البنكي الافتراضي'
where not exists (select 1 from public.financial_accounts where account_type = 'BANK');

insert into public.expense_categories (name, description)
select v.name, v.description
from (values
  ('إيجار',          'إيجار المحل'),
  ('رواتب',          'رواتب الموظفين'),
  ('كهرباء',         'فاتورة الكهرباء'),
  ('ماء',            'فاتورة المياه'),
  ('إنترنت',         'اشتراك الإنترنت'),
  ('هاتف',           'فواتير الهاتف'),
  ('صيانة',          'صيانة المحل والمعدات'),
  ('نقل',            'مصاريف النقل والشحن الداخلي'),
  ('تسويق',          'إعلانات وتسويق'),
  ('تغليف',          'أكياس ومواد التغليف'),
  ('قرطاسية',        'أدوات مكتبية'),
  ('ضيافة',          'ضيافة العملاء'),
  ('عمولات بنكية',   'رسوم وعمولات البنك'),
  ('مصاريف تشغيلية', 'مصاريف تشغيلية متنوعة'),
  ('أخرى',           'مصاريف أخرى')
) as v(name, description)
where not exists (select 1 from public.expense_categories c where btrim(c.name) = v.name);
