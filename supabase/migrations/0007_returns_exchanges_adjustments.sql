-- بيت القفطان (Bayt Al-Qaftan) — Phase 5
-- Returns, exchanges, inventory adjustments and damaged stock.
--
-- Depends on 0001–0006. Idempotent: safe to re-run.
--
-- This phase EXTENDS the existing inventory ledger rather than replacing it.
-- Two structural additions carry the whole phase:
--
--   1. STOCK STATE. A movement now says which bucket it belongs to —
--      AVAILABLE or DAMAGED. A damaged customer return still lands in the
--      ledger as a SALE_RETURN, but into the DAMAGED bucket, so the goods are
--      accounted for without ever becoming sellable. Sellable stock is the
--      AVAILABLE sum, and every existing row defaults to AVAILABLE, so all of
--      Phase 2–4 keeps its exact meaning.
--
--   2. ONE SOURCE OF DIRECTION. Until now the sign of a movement was written
--      twice — once in the generated column and once inside
--      enforce_non_negative_stock — and the two lists had to be kept in step by
--      hand. Phase 5 adds five more movement kinds, so the duplication is
--      replaced by a single IMMUTABLE function used by both. A new type can now
--      only be given a direction in one place.
-- =============================================================================

-- =============================================================================
-- 1. LEDGER EXTENSION
-- =============================================================================

-- Incoming or outgoing, decided once. IMMUTABLE so a generated column may use
-- it; the non-negative-stock trigger calls the same function, which is the
-- point — a BEFORE trigger cannot read a STORED generated column (it is
-- computed afterwards), which is exactly how the two lists drifted apart.
create or replace function public.inventory_direction(p_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_type in (
    'PURCHASE',
    'RETURN',
    'ADJUSTMENT_IN',
    'INITIAL_STOCK',
    'SALE_REVERSAL',
    'SALE_RETURN',      -- customer brought goods back
    'EXCHANGE_IN',      -- the leg of an exchange that comes back to us
    'DAMAGED'           -- into the damaged bucket
  ) then 1 else -1 end;
$$;

comment on function public.inventory_direction(text) is
  'Sign of a movement kind. The single source of truth for stock direction, used by both inventory_transactions.signed_quantity and enforce_non_negative_stock.';

alter table public.inventory_transactions
  add column if not exists stock_state text not null default 'AVAILABLE';

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_stock_state_check;
alter table public.inventory_transactions
  add constraint inventory_transactions_stock_state_check
  check (stock_state in ('AVAILABLE', 'DAMAGED'));

comment on column public.inventory_transactions.stock_state is
  'Which bucket the movement applies to. Damaged goods are tracked but never sellable.';

-- The generation expression of a column cannot be altered in place, so the
-- column is rebuilt with its dependants dropped and recreated around it.
drop view if exists public.product_overview;
drop view if exists public.variant_stock;
drop index if exists public.inventory_transactions_variant_sum_idx;

alter table public.inventory_transactions drop column if exists signed_quantity;

alter table public.inventory_transactions
  add column signed_quantity integer
  generated always as (public.inventory_direction(transaction_type) * quantity) stored;

comment on column public.inventory_transactions.signed_quantity is
  'quantity with its direction applied — see inventory_direction().';

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check
  check (transaction_type in (
    'INITIAL_STOCK',
    'PURCHASE', 'PURCHASE_REVERSAL', 'PURCHASE_RETURN',
    'SALE', 'SALE_REVERSAL', 'SALE_RETURN', 'RETURN_REVERSAL',
    'RETURN',
    'EXCHANGE_IN', 'EXCHANGE_OUT',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'DAMAGE',   -- leaves the available bucket
    'DAMAGED'   -- enters the damaged bucket
  ));

create index if not exists inventory_transactions_variant_sum_idx
  on public.inventory_transactions (variant_id) include (signed_quantity);
create index if not exists inventory_transactions_state_idx
  on public.inventory_transactions (variant_id, stock_state);
create index if not exists inventory_transactions_reference_idx
  on public.inventory_transactions (reference_type, reference_id);

-- `current_stock` deliberately keeps its name and its meaning: sellable stock.
-- Damaged units are reported alongside, never inside it.
create or replace view public.variant_stock
with (security_invoker = on) as
select
  v.id         as variant_id,
  v.product_id as product_id,
  coalesce(sum(t.signed_quantity) filter (where t.stock_state = 'AVAILABLE'), 0)::integer as current_stock,
  coalesce(sum(t.signed_quantity) filter (where t.stock_state = 'AVAILABLE'), 0)::integer as available_quantity,
  coalesce(sum(t.signed_quantity) filter (where t.stock_state = 'DAMAGED'), 0)::integer   as damaged_quantity
from public.product_variants v
left join public.inventory_transactions t on t.variant_id = v.id
group by v.id, v.product_id;

create or replace view public.product_overview
with (security_invoker = on) as
select
  p.id as product_id,
  count(v.id)::integer                                           as variants_count,
  coalesce(sum(vs.current_stock), 0)::integer                    as total_stock,
  coalesce(sum(vs.damaged_quantity), 0)::integer                 as damaged_stock,
  min(v.selling_price) filter (where v.is_active)                as min_selling_price,
  coalesce(sum(vs.current_stock * v.purchase_price), 0)::numeric as stock_value
from public.products p
left join public.product_variants v on v.product_id = p.id
left join public.variant_stock vs   on vs.variant_id = v.id
group by p.id;

grant select on public.variant_stock, public.product_overview to authenticated;

-- Stock may not go negative *within its own bucket*: taking damaged goods out
-- must not be satisfied by sellable stock, and vice versa.
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

-- =============================================================================
-- 2. CUSTOMER LEDGER — refunds
-- =============================================================================
-- A return reduces what the customer owes (SALE_RETURN, negative). Handing the
-- money back is the opposite movement (REFUND, positive) — it settles the credit
-- the return created. Whatever is not refunded stays on the account as credit,
-- which is how §21's partial refund keeps the remainder from vanishing.

alter table public.customer_balance_transactions
  drop constraint if exists customer_balance_transactions_type_check;
alter table public.customer_balance_transactions
  add constraint customer_balance_transactions_type_check
  check (transaction_type in ('SALE', 'PAYMENT', 'SALE_RETURN', 'REFUND', 'ADJUSTMENT'));

-- customer_balance reads this column, so it has to stand aside while the
-- column is rebuilt, exactly as variant_stock does for the inventory ledger.
drop view if exists public.customer_balance;

alter table public.customer_balance_transactions drop column if exists signed_amount;
alter table public.customer_balance_transactions
  add column signed_amount numeric(12,2) generated always as (
    case transaction_type
      when 'SALE'        then amount
      when 'PAYMENT'     then -amount
      when 'SALE_RETURN' then -amount
      when 'REFUND'      then amount
      else amount
    end
  ) stored;

create or replace view public.customer_balance
with (security_invoker = on) as
select
  c.id as customer_id,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'SALE'), 0)::numeric        as total_sales,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'PAYMENT'), 0)::numeric     as total_paid,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'SALE_RETURN'), 0)::numeric as total_returns,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'REFUND'), 0)::numeric      as total_refunded,
  coalesce(sum(t.signed_amount), 0)::numeric                                            as balance
from public.customers c
left join public.customer_balance_transactions t on t.customer_id = c.id
group by c.id;

comment on view public.customer_balance is
  'Per-customer totals. balance > 0 = owed by the customer, < 0 = credit held for them.';

grant select on public.customer_balance to authenticated;

-- =============================================================================
-- 3. SEQUENCES
-- =============================================================================

create sequence if not exists public.return_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.exchange_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;
create sequence if not exists public.adjustment_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create or replace function public.next_return_number()
returns text language sql volatile set search_path = '' as $$
  select 'RET-' || lpad(nextval('public.return_number_seq')::text, 6, '0');
$$;
create or replace function public.next_exchange_number()
returns text language sql volatile set search_path = '' as $$
  select 'EXC-' || lpad(nextval('public.exchange_number_seq')::text, 6, '0');
$$;
create or replace function public.next_adjustment_number()
returns text language sql volatile set search_path = '' as $$
  select 'ADJ-' || lpad(nextval('public.adjustment_number_seq')::text, 6, '0');
$$;

-- =============================================================================
-- 4. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 sales_returns
-- ---------------------------------------------------------------------------
create table if not exists public.sales_returns (
  id             uuid          primary key default gen_random_uuid(),
  return_number  text          not null default public.next_return_number(),
  sale_id        uuid          not null references public.sales (id)     on delete restrict,
  customer_id    uuid          null     references public.customers (id) on delete restrict,
  return_date    date          not null default current_date,
  subtotal       numeric(12,2) not null default 0,
  discount       numeric(12,2) not null default 0,
  refund_amount  numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  total_cost     numeric(12,2) not null default 0,
  status         text          not null default 'COMPLETED',
  refund_status  text          not null default 'NO_REFUND',
  reason         text          null,
  notes          text          null,
  cancelled_at   timestamptz   null,
  cancelled_by   uuid          null references auth.users (id) on delete set null,
  cancel_reason  text          null,
  created_by     uuid          null references auth.users (id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_returns_number_key') then
    alter table public.sales_returns add constraint sales_returns_number_key unique (return_number);
  end if;
end $$;

alter table public.sales_returns drop constraint if exists sales_returns_status_check;
alter table public.sales_returns add constraint sales_returns_status_check
  check (status in ('DRAFT', 'COMPLETED', 'CANCELLED'));

alter table public.sales_returns drop constraint if exists sales_returns_refund_status_check;
alter table public.sales_returns add constraint sales_returns_refund_status_check
  check (refund_status in ('NO_REFUND', 'REFUNDED', 'CUSTOMER_CREDIT', 'PARTIAL_REFUND'));

alter table public.sales_returns drop constraint if exists sales_returns_reason_check;
alter table public.sales_returns add constraint sales_returns_reason_check
  check (reason is null or reason in (
    'CUSTOMER_CHANGED_MIND', 'WRONG_SIZE', 'WRONG_COLOR', 'DEFECTIVE_PRODUCT',
    'DAMAGED_PRODUCT', 'WRONG_PRODUCT', 'QUALITY_ISSUE', 'OTHER'
  ));

alter table public.sales_returns drop constraint if exists sales_returns_amounts_check;
alter table public.sales_returns add constraint sales_returns_amounts_check
  check (subtotal >= 0 and discount >= 0 and refund_amount >= 0
         and refunded_amount >= 0 and refunded_amount <= refund_amount);

create index if not exists sales_returns_sale_idx     on public.sales_returns (sale_id);
create index if not exists sales_returns_customer_idx on public.sales_returns (customer_id);
create index if not exists sales_returns_date_idx     on public.sales_returns (return_date desc);
create index if not exists sales_returns_status_idx   on public.sales_returns (status);

-- ---------------------------------------------------------------------------
-- 4.2 sales_return_items
-- ---------------------------------------------------------------------------
-- unit_price / unit_cost are copied from the ORIGINAL sale item, never from the
-- product's current price (§8, §22). total_amount is the refundable value: the
-- unit price after this sale's discount has been allocated to the line (§23).
create table if not exists public.sales_return_items (
  id                    uuid          primary key default gen_random_uuid(),
  return_id             uuid          not null references public.sales_returns (id)   on delete cascade,
  sale_item_id          uuid          not null references public.sale_items (id)      on delete restrict,
  variant_id            uuid          not null references public.product_variants (id) on delete restrict,
  quantity              integer       not null,
  unit_price            numeric(12,2) not null,
  unit_cost             numeric(12,2) not null,
  total_amount          numeric(12,2) not null,
  total_cost            numeric(12,2) not null default 0,
  condition             text          not null default 'GOOD',
  product_name_snapshot text          not null,
  variant_sku_snapshot  text          not null,
  color_snapshot        text          null,
  size_snapshot         text          null,
  reason                text          null,
  created_at            timestamptz   not null default now()
);

alter table public.sales_return_items drop constraint if exists sales_return_items_quantity_check;
alter table public.sales_return_items add constraint sales_return_items_quantity_check
  check (quantity > 0);

alter table public.sales_return_items drop constraint if exists sales_return_items_condition_check;
alter table public.sales_return_items add constraint sales_return_items_condition_check
  check (condition in ('GOOD', 'DAMAGED'));

create index if not exists sales_return_items_return_idx    on public.sales_return_items (return_id);
create index if not exists sales_return_items_sale_item_idx on public.sales_return_items (sale_item_id);
create index if not exists sales_return_items_variant_idx   on public.sales_return_items (variant_id);

-- ---------------------------------------------------------------------------
-- 4.3 return_refunds
-- ---------------------------------------------------------------------------
create table if not exists public.return_refunds (
  id                 uuid          primary key default gen_random_uuid(),
  return_id          uuid          not null references public.sales_returns (id) on delete cascade,
  refund_method      text          not null,
  amount             numeric(12,2) not null,
  refund_date        date          not null default current_date,
  bank_name          text          null,
  transfer_reference text          null,
  receipt_image_path text          null,
  notes              text          null,
  created_by         uuid          null references auth.users (id) on delete set null,
  created_at         timestamptz   not null default now()
);

alter table public.return_refunds drop constraint if exists return_refunds_method_check;
alter table public.return_refunds add constraint return_refunds_method_check
  check (refund_method in ('CASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT'));

alter table public.return_refunds drop constraint if exists return_refunds_amount_check;
alter table public.return_refunds add constraint return_refunds_amount_check
  check (amount > 0);

alter table public.return_refunds drop constraint if exists return_refunds_bank_check;
alter table public.return_refunds add constraint return_refunds_bank_check
  check (
    refund_method <> 'BANK_TRANSFER'
    or (bank_name is not null and btrim(bank_name) <> ''
        and transfer_reference is not null and btrim(transfer_reference) <> '')
  );

create index if not exists return_refunds_return_idx on public.return_refunds (return_id);

-- ---------------------------------------------------------------------------
-- 4.4 exchanges
-- ---------------------------------------------------------------------------
-- The settlement of the difference lives on the exchange itself. §38 asks for a
-- proper financial record without inventing a fake sale, and an exchange is one
-- counter transaction, not a sale plus a return.
create table if not exists public.exchanges (
  id                   uuid          primary key default gen_random_uuid(),
  exchange_number      text          not null default public.next_exchange_number(),
  sale_id              uuid          not null references public.sales (id)     on delete restrict,
  customer_id          uuid          null     references public.customers (id) on delete restrict,
  exchange_date        date          not null default current_date,
  returned_amount      numeric(12,2) not null default 0,
  new_items_amount     numeric(12,2) not null default 0,
  difference_amount    numeric(12,2) not null default 0,
  difference_direction text          not null default 'EVEN',
  settlement_method    text          null,
  bank_name            text          null,
  transfer_reference   text          null,
  receipt_image_path   text          null,
  returned_cost        numeric(12,2) not null default 0,
  new_items_cost       numeric(12,2) not null default 0,
  status               text          not null default 'COMPLETED',
  notes                text          null,
  cancelled_at         timestamptz   null,
  cancelled_by         uuid          null references auth.users (id) on delete set null,
  cancel_reason        text          null,
  created_by           uuid          null references auth.users (id) on delete set null,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exchanges_number_key') then
    alter table public.exchanges add constraint exchanges_number_key unique (exchange_number);
  end if;
end $$;

alter table public.exchanges drop constraint if exists exchanges_direction_check;
alter table public.exchanges add constraint exchanges_direction_check
  check (difference_direction in ('CUSTOMER_PAYS', 'CUSTOMER_RECEIVES', 'EVEN'));

alter table public.exchanges drop constraint if exists exchanges_status_check;
alter table public.exchanges add constraint exchanges_status_check
  check (status in ('DRAFT', 'COMPLETED', 'CANCELLED'));

alter table public.exchanges drop constraint if exists exchanges_settlement_check;
alter table public.exchanges add constraint exchanges_settlement_check
  check (settlement_method is null
         or settlement_method in ('CASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT', 'CUSTOMER_BALANCE'));

alter table public.exchanges drop constraint if exists exchanges_bank_check;
alter table public.exchanges add constraint exchanges_bank_check
  check (
    coalesce(settlement_method, '') <> 'BANK_TRANSFER'
    or (bank_name is not null and btrim(bank_name) <> ''
        and transfer_reference is not null and btrim(transfer_reference) <> '')
  );

alter table public.exchanges drop constraint if exists exchanges_amounts_check;
alter table public.exchanges add constraint exchanges_amounts_check
  check (returned_amount >= 0 and new_items_amount >= 0 and difference_amount >= 0);

create index if not exists exchanges_sale_idx     on public.exchanges (sale_id);
create index if not exists exchanges_customer_idx on public.exchanges (customer_id);
create index if not exists exchanges_date_idx     on public.exchanges (exchange_date desc);
create index if not exists exchanges_status_idx   on public.exchanges (status);

-- ---------------------------------------------------------------------------
-- 4.5 exchange_items
-- ---------------------------------------------------------------------------
create table if not exists public.exchange_items (
  id                    uuid          primary key default gen_random_uuid(),
  exchange_id           uuid          not null references public.exchanges (id)        on delete cascade,
  item_type             text          not null,
  sale_item_id          uuid          null     references public.sale_items (id)       on delete restrict,
  variant_id            uuid          not null references public.product_variants (id) on delete restrict,
  quantity              integer       not null,
  unit_price            numeric(12,2) not null,
  unit_cost             numeric(12,2) not null,
  total_amount          numeric(12,2) not null default 0,
  product_name_snapshot text          not null,
  variant_sku_snapshot  text          not null,
  color_snapshot        text          null,
  size_snapshot         text          null,
  condition             text          not null default 'GOOD',
  created_at            timestamptz   not null default now()
);

alter table public.exchange_items drop constraint if exists exchange_items_type_check;
alter table public.exchange_items add constraint exchange_items_type_check
  check (item_type in ('RETURNED', 'NEW'));

alter table public.exchange_items drop constraint if exists exchange_items_condition_check;
alter table public.exchange_items add constraint exchange_items_condition_check
  check (condition in ('GOOD', 'DAMAGED'));

alter table public.exchange_items drop constraint if exists exchange_items_quantity_check;
alter table public.exchange_items add constraint exchange_items_quantity_check
  check (quantity > 0);

-- A returned leg must point at the sale item it came from; a new leg must not.
alter table public.exchange_items drop constraint if exists exchange_items_sale_item_check;
alter table public.exchange_items add constraint exchange_items_sale_item_check
  check ((item_type = 'RETURNED' and sale_item_id is not null)
      or (item_type = 'NEW'      and sale_item_id is null));

create index if not exists exchange_items_exchange_idx  on public.exchange_items (exchange_id);
create index if not exists exchange_items_sale_item_idx on public.exchange_items (sale_item_id);
create index if not exists exchange_items_variant_idx   on public.exchange_items (variant_id);

-- ---------------------------------------------------------------------------
-- 4.6 inventory_adjustments
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_adjustments (
  id                uuid          primary key default gen_random_uuid(),
  adjustment_number text          not null default public.next_adjustment_number(),
  adjustment_date   date          not null default current_date,
  reason            text          not null,
  status            text          not null default 'COMPLETED',
  total_increase    integer       not null default 0,
  total_decrease    integer       not null default 0,
  items_count       integer       not null default 0,
  notes             text          null,
  cancelled_at      timestamptz   null,
  cancelled_by      uuid          null references auth.users (id) on delete set null,
  cancel_reason     text          null,
  created_by        uuid          null references auth.users (id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_adjustments_number_key') then
    alter table public.inventory_adjustments
      add constraint inventory_adjustments_number_key unique (adjustment_number);
  end if;
end $$;

alter table public.inventory_adjustments drop constraint if exists inventory_adjustments_reason_check;
alter table public.inventory_adjustments add constraint inventory_adjustments_reason_check
  check (reason in ('STOCK_COUNT', 'DAMAGED', 'LOST', 'FOUND', 'DATA_CORRECTION', 'OTHER'));

alter table public.inventory_adjustments drop constraint if exists inventory_adjustments_status_check;
alter table public.inventory_adjustments add constraint inventory_adjustments_status_check
  check (status in ('DRAFT', 'COMPLETED', 'CANCELLED'));

create index if not exists inventory_adjustments_date_idx   on public.inventory_adjustments (adjustment_date desc);
create index if not exists inventory_adjustments_status_idx on public.inventory_adjustments (status);

-- ---------------------------------------------------------------------------
-- 4.7 inventory_adjustment_items
-- ---------------------------------------------------------------------------
-- system_quantity is read by the server inside the transaction, under the
-- variant's row lock — never accepted from the browser (§56).
create table if not exists public.inventory_adjustment_items (
  id                    uuid        primary key default gen_random_uuid(),
  adjustment_id         uuid        not null references public.inventory_adjustments (id) on delete cascade,
  variant_id            uuid        not null references public.product_variants (id)      on delete restrict,
  system_quantity       integer     not null,
  actual_quantity       integer     not null,
  difference_quantity   integer     not null,
  product_name_snapshot text        not null,
  variant_sku_snapshot  text        not null,
  color_snapshot        text        null,
  size_snapshot         text        null,
  reason                text        null,
  created_at            timestamptz not null default now()
);

alter table public.inventory_adjustment_items
  drop constraint if exists inventory_adjustment_items_actual_check;
alter table public.inventory_adjustment_items
  add constraint inventory_adjustment_items_actual_check check (actual_quantity >= 0);

alter table public.inventory_adjustment_items
  drop constraint if exists inventory_adjustment_items_difference_check;
alter table public.inventory_adjustment_items
  add constraint inventory_adjustment_items_difference_check
  check (difference_quantity = actual_quantity - system_quantity);

alter table public.inventory_adjustment_items
  drop constraint if exists inventory_adjustment_items_unique_variant;
alter table public.inventory_adjustment_items
  add constraint inventory_adjustment_items_unique_variant unique (adjustment_id, variant_id);

create index if not exists inventory_adjustment_items_adj_idx     on public.inventory_adjustment_items (adjustment_id);
create index if not exists inventory_adjustment_items_variant_idx on public.inventory_adjustment_items (variant_id);

-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array['sales_returns', 'exchanges', 'inventory_adjustments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

-- Money already recorded is never edited in place.
create or replace function public.prevent_refund_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'return_refunds is append-only; cancel the return instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists return_refunds_immutable on public.return_refunds;
create trigger return_refunds_immutable
  before update or delete on public.return_refunds
  for each row execute function public.prevent_refund_mutation();

-- =============================================================================
-- 6. VIEWS
-- =============================================================================

-- How much of each sale line is still returnable. Exchanges consume the same
-- allowance as returns — a piece swapped in an exchange has already come back,
-- so it cannot be returned a second time (§9, §58).
create or replace view public.sale_item_returns
with (security_invoker = on) as
select
  si.id                       as sale_item_id,
  si.sale_id                  as sale_id,
  si.variant_id               as variant_id,
  si.quantity                 as sold_quantity,
  coalesce(r.qty, 0) + coalesce(x.qty, 0)                    as returned_quantity,
  si.quantity - (coalesce(r.qty, 0) + coalesce(x.qty, 0))    as returnable_quantity
from public.sale_items si
left join lateral (
  select sum(ri.quantity) as qty
  from public.sales_return_items ri
  join public.sales_returns sr on sr.id = ri.return_id
  where ri.sale_item_id = si.id and sr.status <> 'CANCELLED'
) r on true
left join lateral (
  select sum(xi.quantity) as qty
  from public.exchange_items xi
  join public.exchanges ex on ex.id = xi.exchange_id
  where xi.sale_item_id = si.id and xi.item_type = 'RETURNED' and ex.status <> 'CANCELLED'
) x on true;

create or replace view public.return_overview
with (security_invoker = on) as
select
  sr.id                                  as return_id,
  count(ri.id)::integer                  as item_count,
  coalesce(sum(ri.quantity), 0)::integer as total_quantity,
  -- Reversing a sale reverses its cost too, so the profit given back is the
  -- net refundable value less the cost of the goods coming home (§24).
  (sr.refund_amount - sr.total_cost)::numeric as profit_reversal
from public.sales_returns sr
left join public.sales_return_items ri on ri.return_id = sr.id
group by sr.id, sr.refund_amount, sr.total_cost;

create or replace view public.exchange_overview
with (security_invoker = on) as
select
  ex.id as exchange_id,
  coalesce(sum(xi.quantity) filter (where xi.item_type = 'RETURNED'), 0)::integer as returned_quantity,
  coalesce(sum(xi.quantity) filter (where xi.item_type = 'NEW'), 0)::integer      as new_quantity,
  ((ex.new_items_amount - ex.new_items_cost)
   - (ex.returned_amount - ex.returned_cost))::numeric                            as profit_delta
from public.exchanges ex
left join public.exchange_items xi on xi.exchange_id = ex.id
group by ex.id, ex.new_items_amount, ex.new_items_cost, ex.returned_amount, ex.returned_cost;

create or replace view public.adjustment_overview
with (security_invoker = on) as
select
  a.id as adjustment_id,
  count(ai.id)::integer as item_count,
  coalesce(sum(ai.difference_quantity) filter (where ai.difference_quantity > 0), 0)::integer as increase_quantity,
  coalesce(-sum(ai.difference_quantity) filter (where ai.difference_quantity < 0), 0)::integer as decrease_quantity
from public.inventory_adjustments a
left join public.inventory_adjustment_items ai on ai.adjustment_id = a.id
group by a.id;

-- Sale-level net figures after returns, for the sale detail screen and for the
-- reporting phase. Cancelled returns are excluded.
create or replace view public.sale_net_overview
with (security_invoker = on) as
select
  s.id                                                          as sale_id,
  s.total_amount                                                as gross_amount,
  coalesce(r.refunded_value, 0)::numeric                        as returned_amount,
  (s.total_amount - coalesce(r.refunded_value, 0))::numeric     as net_amount,
  (s.total_cost - coalesce(r.returned_cost, 0))::numeric        as net_cost,
  ((s.total_amount - coalesce(r.refunded_value, 0))
   - (s.total_cost - coalesce(r.returned_cost, 0)))::numeric    as net_profit
from public.sales s
left join lateral (
  select sum(sr.refund_amount) as refunded_value, sum(sr.total_cost) as returned_cost
  from public.sales_returns sr
  where sr.sale_id = s.id and sr.status <> 'CANCELLED'
) r on true;

grant select on public.sale_item_returns, public.return_overview,
                public.exchange_overview, public.adjustment_overview,
                public.sale_net_overview
  to authenticated;

-- =============================================================================
-- 7. ROLE GATES
-- =============================================================================

-- STAFF may take goods back over the counter, but the money side — paying a
-- refund out, cancelling a completed return — stays with a manager (§51).
create or replace function public.can_return()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER', 'STAFF'), false)
     and public.is_active_user();
$$;

create or replace function public.can_manage_returns()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false)
     and public.is_active_user();
$$;

create or replace function public.can_adjust_inventory()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false)
     and public.is_active_user();
$$;

revoke all on function public.can_return()           from public;
revoke all on function public.can_manage_returns()   from public;
revoke all on function public.can_adjust_inventory() from public;
grant execute on function public.can_return()           to authenticated, service_role;
grant execute on function public.can_manage_returns()   to authenticated, service_role;
grant execute on function public.can_adjust_inventory() to authenticated, service_role;

-- =============================================================================
-- 8. LOOKUP & REPORTING FUNCTIONS
-- =============================================================================

-- Everything the return screen needs about one sale: what was sold, what has
-- already come back, and what may still be returned.
drop function if exists public.sale_returnable_items(uuid);
create or replace function public.sale_returnable_items(p_sale_id uuid)
returns table (
  sale_item_id          uuid,
  variant_id            uuid,
  product_name_snapshot text,
  variant_sku_snapshot  text,
  color_snapshot        text,
  size_snapshot         text,
  unit_price            numeric,
  unit_cost             numeric,
  net_unit_price        numeric,
  sold_quantity         integer,
  returned_quantity     integer,
  returnable_quantity   integer,
  image_path            text
)
language sql stable set search_path = public as $$
  with s as (select * from public.sales where id = p_sale_id),
  factor as (
    select case when s.subtotal > 0 then (s.subtotal - s.discount) / s.subtotal else 1 end as f
    from s
  )
  select
    si.id, si.variant_id, si.product_name_snapshot, si.variant_sku_snapshot,
    si.color_snapshot, si.size_snapshot,
    si.unit_price, si.unit_cost,
    round(si.unit_price * (select f from factor), 2) as net_unit_price,
    sir.sold_quantity, sir.returned_quantity, sir.returnable_quantity,
    (select pi.storage_path from public.product_images pi
      where pi.variant_id = si.variant_id or pi.product_id = (
        select v.product_id from public.product_variants v where v.id = si.variant_id)
      order by pi.is_primary desc nulls last, pi.sort_order asc limit 1) as image_path
  from public.sale_items si
  join public.sale_item_returns sir on sir.sale_item_id = si.id
  where si.sale_id = p_sale_id
  order by si.created_at;
$$;

drop function if exists public.search_returns(text, uuid, text, text, text, date, date, integer, integer);
create or replace function public.search_returns(
  p_search        text default null,
  p_customer_id   uuid default null,
  p_status        text default 'ALL',
  p_refund_status text default 'ALL',
  p_reason        text default 'ALL',
  p_date_from     date default null,
  p_date_to       date default null,
  p_limit         integer default 20,
  p_offset        integer default 0
)
returns table (
  id              uuid,
  return_number   text,
  sale_id         uuid,
  sale_number     text,
  customer_id     uuid,
  customer_name   text,
  return_date     date,
  item_count      integer,
  total_quantity  integer,
  refund_amount   numeric,
  refunded_amount numeric,
  status          text,
  refund_status   text,
  reason          text,
  created_at      timestamptz,
  total_count     bigint
)
language sql stable set search_path = public as $$
  with filtered as (
    select
      r.id, r.return_number, r.sale_id, s.sale_number, r.customer_id,
      c.name as customer_name, r.return_date,
      coalesce(o.item_count, 0)     as item_count,
      coalesce(o.total_quantity, 0) as total_quantity,
      r.refund_amount, r.refunded_amount, r.status, r.refund_status, r.reason,
      r.created_at
    from public.sales_returns r
    join public.sales s               on s.id = r.sale_id
    left join public.customers c      on c.id = r.customer_id
    left join public.return_overview o on o.return_id = r.id
    where
      (p_customer_id is null or r.customer_id = p_customer_id)
      and (p_status = 'ALL' or r.status = p_status)
      and (p_refund_status = 'ALL' or r.refund_status = p_refund_status)
      and (p_reason = 'ALL' or r.reason = p_reason)
      and (p_date_from is null or r.return_date >= p_date_from)
      and (p_date_to   is null or r.return_date <= p_date_to)
      and (
        p_search is null or btrim(p_search) = ''
        or r.return_number ilike '%' || btrim(p_search) || '%'
        or s.sale_number   ilike '%' || btrim(p_search) || '%'
        or coalesce(c.name, '')  ilike '%' || btrim(p_search) || '%'
        or coalesce(c.phone, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.sales_return_items ri
          where ri.return_id = r.id
            and (ri.product_name_snapshot ilike '%' || btrim(p_search) || '%'
                 or ri.variant_sku_snapshot ilike '%' || btrim(p_search) || '%')
        )
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.return_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

drop function if exists public.search_exchanges(text, uuid, text, date, date, integer, integer);
create or replace function public.search_exchanges(
  p_search      text default null,
  p_customer_id uuid default null,
  p_status      text default 'ALL',
  p_date_from   date default null,
  p_date_to     date default null,
  p_limit       integer default 20,
  p_offset      integer default 0
)
returns table (
  id                   uuid,
  exchange_number      text,
  sale_id              uuid,
  sale_number          text,
  customer_id          uuid,
  customer_name        text,
  exchange_date        date,
  returned_amount      numeric,
  new_items_amount     numeric,
  difference_amount    numeric,
  difference_direction text,
  returned_quantity    integer,
  new_quantity         integer,
  status               text,
  created_at           timestamptz,
  total_count          bigint
)
language sql stable set search_path = public as $$
  with filtered as (
    select
      e.id, e.exchange_number, e.sale_id, s.sale_number, e.customer_id,
      c.name as customer_name, e.exchange_date,
      e.returned_amount, e.new_items_amount, e.difference_amount, e.difference_direction,
      coalesce(o.returned_quantity, 0) as returned_quantity,
      coalesce(o.new_quantity, 0)      as new_quantity,
      e.status, e.created_at
    from public.exchanges e
    join public.sales s                  on s.id = e.sale_id
    left join public.customers c         on c.id = e.customer_id
    left join public.exchange_overview o on o.exchange_id = e.id
    where
      (p_customer_id is null or e.customer_id = p_customer_id)
      and (p_status = 'ALL' or e.status = p_status)
      and (p_date_from is null or e.exchange_date >= p_date_from)
      and (p_date_to   is null or e.exchange_date <= p_date_to)
      and (
        p_search is null or btrim(p_search) = ''
        or e.exchange_number ilike '%' || btrim(p_search) || '%'
        or s.sale_number     ilike '%' || btrim(p_search) || '%'
        or coalesce(c.name, '')  ilike '%' || btrim(p_search) || '%'
        or coalesce(c.phone, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.exchange_items xi
          where xi.exchange_id = e.id
            and (xi.product_name_snapshot ilike '%' || btrim(p_search) || '%'
                 or xi.variant_sku_snapshot ilike '%' || btrim(p_search) || '%')
        )
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.exchange_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

drop function if exists public.search_adjustments(text, text, text, date, date, integer, integer);
create or replace function public.search_adjustments(
  p_search    text default null,
  p_reason    text default 'ALL',
  p_status    text default 'ALL',
  p_date_from date default null,
  p_date_to   date default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns table (
  id                uuid,
  adjustment_number text,
  adjustment_date   date,
  reason            text,
  status            text,
  items_count       integer,
  total_increase    integer,
  total_decrease    integer,
  created_by_name   text,
  notes             text,
  created_at        timestamptz,
  total_count       bigint
)
language sql stable set search_path = public as $fn$
  with filtered as (
    select
      a.id, a.adjustment_number, a.adjustment_date, a.reason, a.status,
      a.items_count, a.total_increase, a.total_decrease,
      pr.full_name as created_by_name, a.notes, a.created_at
    from public.inventory_adjustments a
    left join public.profiles pr on pr.id = a.created_by
    where
      (p_reason = 'ALL' or a.reason = p_reason)
      and (p_status = 'ALL' or a.status = p_status)
      and (p_date_from is null or a.adjustment_date >= p_date_from)
      and (p_date_to   is null or a.adjustment_date <= p_date_to)
      and (
        p_search is null or btrim(p_search) = ''
        or a.adjustment_number ilike '%' || btrim(p_search) || '%'
        or coalesce(a.notes, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.inventory_adjustment_items ai
          where ai.adjustment_id = a.id
            and (ai.product_name_snapshot ilike '%' || btrim(p_search) || '%'
                 or ai.variant_sku_snapshot ilike '%' || btrim(p_search) || '%')
        )
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.adjustment_date desc, f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

-- Returns for a period, for the returns dashboard cards.
drop function if exists public.returns_summary(date, date);
create or replace function public.returns_summary(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  returns_count   integer,
  returns_value   numeric,
  refunded_value  numeric,
  credited_value  numeric,
  units_returned  integer,
  damaged_units   integer,
  cost_returned   numeric,
  profit_reversal numeric
)
language sql stable set search_path = public as $fn$
  with r as (
    select * from public.sales_returns
    where status <> 'CANCELLED'
      and (p_date_from is null or return_date >= p_date_from)
      and (p_date_to   is null or return_date <= p_date_to)
  )
  select
    (select count(*) from r)::integer,
    coalesce((select sum(refund_amount) from r), 0)::numeric,
    coalesce((select sum(rf.amount) from public.return_refunds rf join r on r.id = rf.return_id
              where rf.refund_method in ('CASH', 'BANK_TRANSFER')), 0)::numeric,
    coalesce((select sum(rf.amount) from public.return_refunds rf join r on r.id = rf.return_id
              where rf.refund_method = 'CUSTOMER_CREDIT'), 0)::numeric,
    coalesce((select sum(ri.quantity) from public.sales_return_items ri join r on r.id = ri.return_id), 0)::integer,
    coalesce((select sum(ri.quantity) from public.sales_return_items ri join r on r.id = ri.return_id
              where ri.condition = 'DAMAGED'), 0)::integer,
    coalesce((select sum(total_cost) from r), 0)::numeric,
    coalesce((select sum(refund_amount - total_cost) from r), 0)::numeric;
$fn$;

-- Sales figures now carry their returns, so a period reads as
-- gross - discount - returns = net, and net - net cost = net profit (§25, §60).
drop function if exists public.sales_summary(date, date);
create or replace function public.sales_summary(
  p_date_from date default null,
  p_date_to   date default null
)
returns table (
  sales_count              integer,
  gross_sales              numeric,
  total_discount           numeric,
  net_sales                numeric,
  total_cost               numeric,
  gross_profit             numeric,
  gross_margin             numeric,
  units_sold               integer,
  total_paid               numeric,
  total_outstanding        numeric,
  cash_collected           numeric,
  bank_collected           numeric,
  returns_count            integer,
  returns_value            numeric,
  returns_cost             numeric,
  units_returned           integer,
  net_sales_after_returns  numeric,
  net_cost_after_returns   numeric,
  net_profit_after_returns numeric
)
language sql stable set search_path = public as $fn$
  with s as (
    select * from public.sales
    where status = 'COMPLETED'
      and (p_date_from is null or sale_date >= p_date_from)
      and (p_date_to   is null or sale_date <= p_date_to)
  ),
  pay as (
    select sp.payment_method, sp.amount
    from public.sale_payments sp
    join s on s.id = sp.sale_id
  ),
  r as (
    select * from public.sales_returns
    where status <> 'CANCELLED'
      and (p_date_from is null or return_date >= p_date_from)
      and (p_date_to   is null or return_date <= p_date_to)
  ),
  agg as (
    select
      coalesce((select sum(total_amount) from s), 0)  as net_sales,
      coalesce((select sum(total_cost)   from s), 0)  as total_cost,
      coalesce((select sum(refund_amount) from r), 0) as ret_value,
      coalesce((select sum(total_cost)    from r), 0) as ret_cost
  )
  select
    (select count(*) from s)::integer,
    coalesce((select sum(subtotal) from s), 0)::numeric,
    coalesce((select sum(discount) from s), 0)::numeric,
    (select net_sales from agg)::numeric,
    (select total_cost from agg)::numeric,
    ((select net_sales from agg) - (select total_cost from agg))::numeric,
    case when (select net_sales from agg) > 0
      then round((((select net_sales from agg) - (select total_cost from agg))
                  / (select net_sales from agg)) * 100, 2)
      else 0 end::numeric,
    coalesce((select sum(i.quantity) from public.sale_items i join s on s.id = i.sale_id), 0)::integer,
    coalesce((select sum(paid_amount) from s), 0)::numeric,
    coalesce((select sum(remaining_amount) from s), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'CASH'), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'BANK_TRANSFER'), 0)::numeric,
    (select count(*) from r)::integer,
    (select ret_value from agg)::numeric,
    (select ret_cost from agg)::numeric,
    coalesce((select sum(ri.quantity) from public.sales_return_items ri join r on r.id = ri.return_id), 0)::integer,
    ((select net_sales from agg) - (select ret_value from agg))::numeric,
    ((select total_cost from agg) - (select ret_cost from agg))::numeric,
    (((select net_sales from agg) - (select ret_value from agg))
     - ((select total_cost from agg) - (select ret_cost from agg)))::numeric;
$fn$;

-- Damaged stock report.
drop function if exists public.damaged_stock(integer, integer);
create or replace function public.damaged_stock(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  variant_id         uuid,
  product_id         uuid,
  product_name       text,
  sku                text,
  color              text,
  size               text,
  damaged_quantity   integer,
  available_quantity integer,
  purchase_price     numeric,
  total_count        bigint
)
language sql stable set search_path = public as $fn$
  with filtered as (
    select v.id, v.product_id, p.name, v.sku, v.color, v.size,
           vs.damaged_quantity, vs.available_quantity, v.purchase_price
    from public.product_variants v
    join public.products p       on p.id = v.product_id
    join public.variant_stock vs on vs.variant_id = v.id
    where vs.damaged_quantity <> 0
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.damaged_quantity desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$fn$;

grant execute on function public.sale_returnable_items(uuid) to authenticated;
grant execute on function public.search_returns(text, uuid, text, text, text, date, date, integer, integer) to authenticated;
grant execute on function public.search_exchanges(text, uuid, text, date, date, integer, integer) to authenticated;
grant execute on function public.search_adjustments(text, text, text, date, date, integer, integer) to authenticated;
grant execute on function public.returns_summary(date, date) to authenticated;
grant execute on function public.sales_summary(date, date) to authenticated;
grant execute on function public.damaged_stock(integer, integer) to authenticated;

-- =============================================================================
-- 9. WRITE OPERATIONS (atomic, SECURITY DEFINER)
-- =============================================================================

-- Recompute what has actually been handed back and what that makes the return.
-- Money paid out and money left as credit are counted separately because they
-- mean different things on the customer's account.
create or replace function public.refresh_return_refund_status(p_return_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_value  numeric(12,2);
  v_paid   numeric(12,2);
  v_credit numeric(12,2);
  v_total  numeric(12,2);
  v_status text;
begin
  select refund_amount into v_value from public.sales_returns where id = p_return_id;

  select coalesce(sum(amount) filter (where refund_method in ('CASH', 'BANK_TRANSFER')), 0),
         coalesce(sum(amount) filter (where refund_method = 'CUSTOMER_CREDIT'), 0)
    into v_paid, v_credit
    from public.return_refunds where return_id = p_return_id;

  v_total := v_paid + v_credit;

  v_status := case
    when v_total = 0        then 'NO_REFUND'
    when v_total < v_value  then 'PARTIAL_REFUND'
    when v_paid  = 0        then 'CUSTOMER_CREDIT'
    else 'REFUNDED'
  end;

  update public.sales_returns
     set refunded_amount = v_total, refund_status = v_status
   where id = p_return_id;
end;
$fn$;

revoke all on function public.refresh_return_refund_status(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 9.1 create_sales_return
-- ---------------------------------------------------------------------------
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

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'sale_cancelled' using errcode = '22023';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_returnable' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- 9.2 add_return_refund — pay out against an existing return
-- ---------------------------------------------------------------------------
create or replace function public.add_return_refund(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor     uuid := (select auth.uid());
  v_return_id uuid := nullif(p_payload ->> 'return_id', '')::uuid;
  v_ret       record;
  v_amount    numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_method    text := coalesce(p_payload ->> 'refund_method', 'CASH');
  v_already   numeric(12,2);
begin
  if not public.can_manage_returns() then
    raise exception 'forbidden: insufficient permission to issue refunds' using errcode = '42501';
  end if;

  select * into v_ret from public.sales_returns where id = v_return_id for update;
  if not found then raise exception 'return_not_found' using errcode = 'P0002'; end if;
  if v_ret.status <> 'COMPLETED' then
    raise exception 'return_not_refundable' using errcode = '22023';
  end if;
  if v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_method not in ('CASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT') then
    raise exception 'invalid_refund_method' using errcode = '22023';
  end if;
  if v_method = 'CUSTOMER_CREDIT' and v_ret.customer_id is null then
    raise exception 'credit_requires_customer' using errcode = '22023';
  end if;
  if v_method = 'BANK_TRANSFER'
     and (coalesce(btrim(p_payload ->> 'bank_name'), '') = ''
          or coalesce(btrim(p_payload ->> 'transfer_reference'), '') = '') then
    raise exception 'bank_details_required' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_already
    from public.return_refunds where return_id = v_return_id;

  if v_already + v_amount > v_ret.refund_amount then
    raise exception 'refund_exceeds_return' using errcode = '22023';
  end if;

  insert into public.return_refunds (
    return_id, refund_method, amount, refund_date,
    bank_name, transfer_reference, receipt_image_path, notes, created_by
  )
  values (
    v_return_id, v_method, v_amount,
    coalesce(nullif(p_payload ->> 'refund_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'bank_name'), ''),
    nullif(btrim(p_payload ->> 'transfer_reference'), ''),
    nullif(btrim(p_payload ->> 'receipt_image_path'), ''),
    nullif(btrim(p_payload ->> 'notes'), ''),
    v_actor
  );

  if v_method in ('CASH', 'BANK_TRANSFER') and v_ret.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_ret.customer_id, 'REFUND', v_amount, 'SALES_RETURN', v_return_id,
            'استرداد على المرتجع ' || v_ret.return_number, v_actor);
  end if;

  perform public.refresh_return_refund_status(v_return_id);

  return (
    select jsonb_build_object(
      'return_id', r.id, 'return_number', r.return_number,
      'refund_amount', r.refund_amount, 'refunded_amount', r.refunded_amount,
      'refund_status', r.refund_status)
    from public.sales_returns r where r.id = v_return_id
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9.3 cancel_sales_return
-- ---------------------------------------------------------------------------
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
begin
  if not public.can_manage_returns() then
    raise exception 'forbidden: insufficient permission to cancel returns' using errcode = '42501';
  end if;

  select * into v_ret from public.sales_returns where id = p_return_id for update;
  if not found then raise exception 'return_not_found' using errcode = 'P0002'; end if;
  if v_ret.status <> 'COMPLETED' then
    raise exception 'return_not_cancellable' using errcode = '22023';
  end if;

  -- The goods have to still be here. If they were sold on after coming back,
  -- undoing the return would drive the bucket negative — refuse rather than
  -- create an impossible stock position (§39).
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

  -- Undo the account movements without deleting them: the return's credit goes
  -- back, and any money already paid out is charged back to the customer.
  if v_ret.customer_id is not null then
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_ret.customer_id, 'ADJUSTMENT', v_ret.refund_amount,
            'RETURN_CANCELLATION', p_return_id,
            'إلغاء مرتجع ' || v_ret.return_number, v_actor);

    if v_ret.refunded_amount > 0 then
      insert into public.customer_balance_transactions (
        customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
      )
      select v_ret.customer_id, 'ADJUSTMENT',
             -coalesce(sum(amount), 0), 'RETURN_CANCELLATION', p_return_id,
             'عكس استرداد المرتجع ' || v_ret.return_number, v_actor
        from public.return_refunds
       where return_id = p_return_id and refund_method in ('CASH', 'BANK_TRANSFER')
      having coalesce(sum(amount), 0) > 0;
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

revoke all on function public.create_sales_return(jsonb)        from public;
revoke all on function public.add_return_refund(jsonb)          from public;
revoke all on function public.cancel_sales_return(uuid, text)   from public;
grant execute on function public.create_sales_return(jsonb)      to authenticated;
grant execute on function public.add_return_refund(jsonb)        to authenticated;
grant execute on function public.cancel_sales_return(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9.4 create_exchange
-- ---------------------------------------------------------------------------
-- One counter transaction: goods come back, different goods go out, and only
-- the difference changes hands. Deliberately NOT modelled as a sale plus a
-- return, so the shop's sales figures are not inflated by a swap (§38).
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

  select * into v_sale from public.sales where id = v_sale_id for update;
  if not found then raise exception 'sale_not_found' using errcode = 'P0002'; end if;
  if v_sale.status = 'CANCELLED' then
    raise exception 'sale_cancelled' using errcode = '22023';
  end if;
  if v_sale.status <> 'COMPLETED' then
    raise exception 'sale_not_returnable' using errcode = '22023';
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

  if v_short is not null then
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

-- ---------------------------------------------------------------------------
-- 9.5 cancel_exchange
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
    insert into public.customer_balance_transactions (
      customer_id, transaction_type, amount, reference_type, reference_id, description, created_by
    )
    values (v_exc.customer_id, 'ADJUSTMENT', v_exc.returned_amount - v_exc.new_items_amount,
            'EXCHANGE_CANCELLATION', p_exchange_id,
            'إلغاء استبدال ' || v_exc.exchange_number, v_actor);

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
-- 9.6 create_inventory_adjustment
-- ---------------------------------------------------------------------------
-- The counted figure is the only number the browser sends. The system figure is
-- read here, inside the transaction, under the variant's lock — so a count
-- entered against a stale screen can never silently overwrite newer movements.
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

  if v_reason not in ('STOCK_COUNT', 'DAMAGED', 'LOST', 'FOUND', 'DATA_CORRECTION', 'OTHER') then
    raise exception 'invalid_reason' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- 9.7 cancel_inventory_adjustment
-- ---------------------------------------------------------------------------
create or replace function public.cancel_inventory_adjustment(p_adjustment_id uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_adj   record;
  v_item  record;
  v_stock integer;
  v_short text := null;
begin
  if not public.can_adjust_inventory() then
    raise exception 'forbidden: insufficient permission to cancel adjustments' using errcode = '42501';
  end if;

  select * into v_adj from public.inventory_adjustments where id = p_adjustment_id for update;
  if not found then raise exception 'adjustment_not_found' using errcode = 'P0002'; end if;
  if v_adj.status <> 'COMPLETED' then
    raise exception 'adjustment_not_cancellable' using errcode = '22023';
  end if;

  for v_item in
    select ai.variant_id, ai.difference_quantity, ai.variant_sku_snapshot
      from public.inventory_adjustment_items ai
     where ai.adjustment_id = p_adjustment_id and ai.difference_quantity > 0
     order by ai.variant_id
  loop
    perform 1 from public.product_variants where id = v_item.variant_id for update;
    select coalesce(sum(t.signed_quantity), 0) into v_stock
      from public.inventory_transactions t
     where t.variant_id = v_item.variant_id and t.stock_state = 'AVAILABLE';
    if v_stock < v_item.difference_quantity then
      v_short := coalesce(v_short || ', ', '') || v_item.variant_sku_snapshot;
    end if;
  end loop;

  if v_short is not null then
    raise exception 'cancel_would_oversell: %', v_short using errcode = '22023';
  end if;

  for v_item in
    select ai.variant_id, ai.difference_quantity
      from public.inventory_adjustment_items ai
     where ai.adjustment_id = p_adjustment_id and ai.difference_quantity <> 0
     order by ai.variant_id
  loop
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, stock_state,
      reference_type, reference_id, notes, created_by
    )
    values (
      v_item.variant_id,
      case when v_item.difference_quantity > 0 then 'ADJUSTMENT_OUT' else 'ADJUSTMENT_IN' end,
      abs(v_item.difference_quantity), 'AVAILABLE',
      'ADJUSTMENT_CANCELLATION', p_adjustment_id,
      'إلغاء تعديل مخزون ' || v_adj.adjustment_number, v_actor
    );
  end loop;

  update public.inventory_adjustments
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(btrim(p_reason), '')
   where id = p_adjustment_id;

  return jsonb_build_object('id', p_adjustment_id, 'adjustment_number', v_adj.adjustment_number);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9.8 record_stock_damage — move sellable units into the damaged bucket
-- ---------------------------------------------------------------------------
-- Two movements, one transaction: the units leave available and arrive in
-- damaged. Nothing is ever quietly removed (§47).
create or replace function public.record_stock_damage(p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_variant uuid := nullif(p_payload ->> 'variant_id', '')::uuid;
  v_qty     integer := coalesce(nullif(p_payload ->> 'quantity', '')::integer, 0);
  v_notes   text := nullif(btrim(p_payload ->> 'notes'), '');
  v_sku     text;
  v_stock   integer;
begin
  if not public.can_adjust_inventory() then
    raise exception 'forbidden: insufficient permission to record damage' using errcode = '42501';
  end if;
  if v_qty <= 0 then raise exception 'invalid_quantity' using errcode = '22023'; end if;

  select sku into v_sku from public.product_variants where id = v_variant for update;
  if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;

  select coalesce(sum(t.signed_quantity), 0) into v_stock
    from public.inventory_transactions t
   where t.variant_id = v_variant and t.stock_state = 'AVAILABLE';

  if v_stock < v_qty then
    raise exception 'insufficient_stock: %', v_sku using errcode = '22023';
  end if;

  insert into public.inventory_transactions (
    variant_id, transaction_type, quantity, stock_state,
    reference_type, reference_id, notes, created_by
  )
  values (v_variant, 'DAMAGE', v_qty, 'AVAILABLE', 'DAMAGE', null,
          coalesce(v_notes, 'تسجيل تلف'), v_actor);

  insert into public.inventory_transactions (
    variant_id, transaction_type, quantity, stock_state,
    reference_type, reference_id, notes, created_by
  )
  values (v_variant, 'DAMAGED', v_qty, 'DAMAGED', 'DAMAGE', null,
          coalesce(v_notes, 'تسجيل تلف'), v_actor);

  return jsonb_build_object('variant_id', v_variant, 'sku', v_sku, 'quantity', v_qty);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9.9 cancel_sale — must now account for returns (§59)
-- ---------------------------------------------------------------------------
-- Cancelling reverses the whole sale. If part of it has already come back
-- through a return or an exchange, that stock has been restored once already,
-- and reversing the sale as a whole would restore it twice. Refuse instead:
-- the returns are the record of what happened, and they stay.
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

revoke all on function public.create_exchange(jsonb)                     from public;
revoke all on function public.cancel_exchange(uuid, text)                from public;
revoke all on function public.create_inventory_adjustment(jsonb)         from public;
revoke all on function public.cancel_inventory_adjustment(uuid, text)    from public;
revoke all on function public.record_stock_damage(jsonb)                 from public;
revoke all on function public.cancel_sale(uuid, text)                    from public;
grant execute on function public.create_exchange(jsonb)                  to authenticated;
grant execute on function public.cancel_exchange(uuid, text)             to authenticated;
grant execute on function public.create_inventory_adjustment(jsonb)      to authenticated;
grant execute on function public.cancel_inventory_adjustment(uuid, text) to authenticated;
grant execute on function public.record_stock_damage(jsonb)              to authenticated;
grant execute on function public.cancel_sale(uuid, text)                 to authenticated;

-- =============================================================================
-- 10. ROW LEVEL SECURITY
-- =============================================================================
-- Same shape as every earlier phase: reads for active users, and no direct
-- write grants at all — every write goes through the functions above, which
-- authorise first.

alter table public.sales_returns              enable row level security;
alter table public.sales_return_items         enable row level security;
alter table public.return_refunds             enable row level security;
alter table public.exchanges                  enable row level security;
alter table public.exchange_items             enable row level security;
alter table public.inventory_adjustments      enable row level security;
alter table public.inventory_adjustment_items enable row level security;

drop policy if exists sales_returns_select              on public.sales_returns;
drop policy if exists sales_return_items_select         on public.sales_return_items;
drop policy if exists return_refunds_select             on public.return_refunds;
drop policy if exists exchanges_select                  on public.exchanges;
drop policy if exists exchange_items_select             on public.exchange_items;
drop policy if exists inventory_adjustments_select      on public.inventory_adjustments;
drop policy if exists inventory_adjustment_items_select on public.inventory_adjustment_items;

create policy sales_returns_select on public.sales_returns
  for select to authenticated using ((select public.is_active_user()));
create policy sales_return_items_select on public.sales_return_items
  for select to authenticated using ((select public.is_active_user()));
create policy exchanges_select on public.exchanges
  for select to authenticated using ((select public.is_active_user()));
create policy exchange_items_select on public.exchange_items
  for select to authenticated using ((select public.is_active_user()));
create policy inventory_adjustments_select on public.inventory_adjustments
  for select to authenticated using ((select public.is_active_user()));
create policy inventory_adjustment_items_select on public.inventory_adjustment_items
  for select to authenticated using ((select public.is_active_user()));

-- Money handed back is financial data, like customer balances: managers and up.
create policy return_refunds_select on public.return_refunds
  for select to authenticated using ((select public.can_manage_returns()));

revoke all on public.sales_returns, public.sales_return_items, public.return_refunds,
              public.exchanges, public.exchange_items,
              public.inventory_adjustments, public.inventory_adjustment_items
  from authenticated, anon;

grant select on public.sales_returns              to authenticated;
grant select on public.sales_return_items         to authenticated;
grant select on public.return_refunds             to authenticated;
grant select on public.exchanges                  to authenticated;
grant select on public.exchange_items             to authenticated;
grant select on public.inventory_adjustments      to authenticated;
grant select on public.inventory_adjustment_items to authenticated;

grant usage, select on sequence public.return_number_seq     to authenticated;
grant usage, select on sequence public.exchange_number_seq   to authenticated;
grant usage, select on sequence public.adjustment_number_seq to authenticated;

-- =============================================================================
-- 11. STORAGE — refund receipts
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'return-refund-receipts', 'return-refund-receipts', false, 5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

do $do$
begin
  drop policy if exists refund_receipts_read   on storage.objects;
  drop policy if exists refund_receipts_write  on storage.objects;
  drop policy if exists refund_receipts_update on storage.objects;
  drop policy if exists refund_receipts_delete on storage.objects;

  create policy refund_receipts_read
    on storage.objects for select to authenticated
    using (bucket_id = 'return-refund-receipts' and (select public.can_manage_returns()));

  create policy refund_receipts_write
    on storage.objects for insert to authenticated
    with check (bucket_id = 'return-refund-receipts' and (select public.can_manage_returns()));

  create policy refund_receipts_update
    on storage.objects for update to authenticated
    using (bucket_id = 'return-refund-receipts' and (select public.can_manage_returns()))
    with check (bucket_id = 'return-refund-receipts' and (select public.can_manage_returns()));

  create policy refund_receipts_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'return-refund-receipts' and (select public.can_manage_returns()));
end
$do$;
