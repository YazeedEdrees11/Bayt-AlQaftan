-- =============================================================================
-- بيت القفطان (Bayt Al-Qaftan) — Phase 3
-- Purchases, purchase payments, supplier balances, receiving inventory
-- Migration 0003
--
-- Paste into the Supabase SQL Editor and run once. Idempotent.
-- Requires 0001 (auth) and 0002 (catalog + inventory ledger).
--
--   suppliers ──< purchases ──< purchase_items ──> product_variants
--       │             │                                  │
--       │             └──< purchase_payments             └──> inventory_transactions
--       └──< supplier_balance_transactions                     (PURCHASE / PURCHASE_REVERSAL)
--
-- Neither stock nor supplier balance is ever a stored number: both are summed
-- from their append-only ledgers. Every multi-step write goes through one
-- SECURITY DEFINER function so it is a single database transaction.
-- =============================================================================

-- =============================================================================
-- 1. EXTEND THE INVENTORY LEDGER
--
-- PURCHASE already exists as an incoming type. Cancelling a purchase needs an
-- outgoing counterpart, and Phase 4+ will need supplier returns. Both are
-- absent from the "incoming" list in the generated signed_quantity column, so
-- they subtract automatically — no change to that column is required.
-- =============================================================================

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_type_check
  check (transaction_type in (
    'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'INITIAL_STOCK', 'PURCHASE_REVERSAL', 'PURCHASE_RETURN'
  ));

-- =============================================================================
-- 2. PURCHASE NUMBER SEQUENCE
--
-- A sequence, never count(*) + 1: two concurrent purchases must never be able
-- to claim the same number.
-- =============================================================================

create sequence if not exists public.purchase_number_seq
  as bigint start with 1 increment by 1 minvalue 1 no maxvalue cache 1;

create or replace function public.next_purchase_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'PUR-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0');
$$;

-- =============================================================================
-- 3. TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 purchases
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id               uuid          primary key default gen_random_uuid(),
  purchase_number  text          not null default public.next_purchase_number(),
  supplier_id      uuid          not null references public.suppliers (id) on delete restrict,
  purchase_date    date          not null default current_date,
  subtotal         numeric(12,2) not null default 0,
  discount         numeric(12,2) not null default 0,
  total_amount     numeric(12,2) not null default 0,
  paid_amount      numeric(12,2) not null default 0,
  remaining_amount numeric(12,2) not null default 0,
  payment_status   text          not null default 'UNPAID',
  notes            text          null,
  status           text          not null default 'COMPLETED',
  cancelled_at     timestamptz   null,
  cancelled_by     uuid          null references auth.users (id) on delete set null,
  cancel_reason    text          null,
  created_by       uuid          null references auth.users (id) on delete set null,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

comment on table public.purchases is 'Goods received from a supplier. Completing one raises stock and the supplier balance.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_status_check') then
    alter table public.purchases add constraint purchases_status_check
      check (status in ('DRAFT', 'COMPLETED', 'CANCELLED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchases_payment_status_check') then
    alter table public.purchases add constraint purchases_payment_status_check
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchases_amounts_check') then
    alter table public.purchases add constraint purchases_amounts_check
      check (
        subtotal >= 0
        and discount >= 0
        and discount <= subtotal
        and total_amount >= 0
        and paid_amount >= 0
        and paid_amount <= total_amount   -- overpayment is impossible by construction
        and remaining_amount >= 0
      );
  end if;
end $$;

create unique index if not exists purchases_number_key       on public.purchases (purchase_number);
create index if not exists purchases_supplier_id_idx         on public.purchases (supplier_id);
create index if not exists purchases_purchase_date_idx       on public.purchases (purchase_date desc);
create index if not exists purchases_payment_status_idx      on public.purchases (payment_status);
create index if not exists purchases_status_idx              on public.purchases (status);
create index if not exists purchases_created_at_idx          on public.purchases (created_at desc);

-- ---------------------------------------------------------------------------
-- 3.2 purchase_items
--
-- Snapshots are intentional duplication: the variant may be renamed, re-SKU'd
-- or repriced later, and this document must still read the way it did the day
-- the goods arrived.
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_items (
  id                    uuid          primary key default gen_random_uuid(),
  purchase_id           uuid          not null references public.purchases (id)        on delete cascade,
  variant_id            uuid          not null references public.product_variants (id) on delete restrict,
  quantity              integer       not null,
  unit_cost             numeric(12,2) not null,
  total_cost            numeric(12,2) not null,
  product_name_snapshot text          not null,
  variant_sku_snapshot  text          not null,
  color_snapshot        text          null,
  size_snapshot         text          null,
  created_at            timestamptz   not null default now()
);

comment on column public.purchase_items.unit_cost is 'Historical cost. Never rewritten by later purchases or price edits.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_items_quantity_check') then
    alter table public.purchase_items add constraint purchase_items_quantity_check
      check (quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_items_cost_check') then
    alter table public.purchase_items add constraint purchase_items_cost_check
      check (unit_cost >= 0 and total_cost >= 0);
  end if;
end $$;

create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_variant_id_idx  on public.purchase_items (variant_id);

-- ---------------------------------------------------------------------------
-- 3.3 purchase_payments
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_payments (
  id                 uuid          primary key default gen_random_uuid(),
  purchase_id        uuid          not null references public.purchases (id) on delete cascade,
  payment_method     text          not null,
  amount             numeric(12,2) not null,
  payment_date       date          not null default current_date,
  bank_name          text          null,
  transfer_reference text          null,
  receipt_image_path text          null,
  notes              text          null,
  created_by         uuid          null references auth.users (id) on delete set null,
  created_at         timestamptz   not null default now()
);

comment on table public.purchase_payments is 'Money paid to a supplier against a specific purchase. Cash and bank transfer only.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_payments_method_check') then
    alter table public.purchase_payments add constraint purchase_payments_method_check
      check (payment_method in ('CASH', 'BANK_TRANSFER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_payments_amount_check') then
    alter table public.purchase_payments add constraint purchase_payments_amount_check
      check (amount > 0);
  end if;
  -- A bank transfer without a bank and a reference is not traceable.
  if not exists (select 1 from pg_constraint where conname = 'purchase_payments_bank_fields_check') then
    alter table public.purchase_payments add constraint purchase_payments_bank_fields_check
      check (
        payment_method <> 'BANK_TRANSFER'
        or (
          bank_name is not null and btrim(bank_name) <> ''
          and transfer_reference is not null and btrim(transfer_reference) <> ''
        )
      );
  end if;
end $$;

create index if not exists purchase_payments_purchase_id_idx  on public.purchase_payments (purchase_id);
create index if not exists purchase_payments_payment_date_idx on public.purchase_payments (payment_date desc);
create index if not exists purchase_payments_method_idx       on public.purchase_payments (payment_method);

-- ---------------------------------------------------------------------------
-- 3.4 supplier_balance_transactions
--
-- The supplier balance is never stored. It is the running sum of this ledger:
-- positive means the shop owes the supplier.
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_balance_transactions (
  id               uuid          primary key default gen_random_uuid(),
  supplier_id      uuid          not null references public.suppliers (id) on delete restrict,
  transaction_type text          not null,
  amount           numeric(12,2) not null,
  reference_type   text          null,
  reference_id     uuid          null,
  description      text          null,
  created_by       uuid          null references auth.users (id) on delete set null,
  created_at       timestamptz   not null default now(),

  -- Direction derives from the type, so a payment can never be recorded as a
  -- charge. ADJUSTMENT is the one type that carries its own sign.
  signed_amount    numeric(12,2) generated always as (
    case transaction_type
      when 'PURCHASE'        then amount
      when 'PAYMENT'         then -amount
      when 'PURCHASE_RETURN' then -amount
      else amount
    end
  ) stored
);

comment on table public.supplier_balance_transactions is 'Append-only supplier account ledger. Positive balance = owed to the supplier.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_balance_type_check') then
    alter table public.supplier_balance_transactions add constraint supplier_balance_type_check
      check (transaction_type in ('PURCHASE', 'PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_balance_amount_check') then
    alter table public.supplier_balance_transactions add constraint supplier_balance_amount_check
      check (
        (transaction_type = 'ADJUSTMENT' and amount <> 0)
        or (transaction_type <> 'ADJUSTMENT' and amount > 0)
      );
  end if;
end $$;

create index if not exists supplier_balance_supplier_id_idx on public.supplier_balance_transactions (supplier_id);
create index if not exists supplier_balance_created_at_idx  on public.supplier_balance_transactions (created_at desc);
create index if not exists supplier_balance_reference_idx   on public.supplier_balance_transactions (reference_type, reference_id);

-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

-- Both ledgers are append-only.
create or replace function public.prevent_supplier_balance_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'supplier_balance_transactions is append-only; post a correcting entry instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists supplier_balance_immutable on public.supplier_balance_transactions;
create trigger supplier_balance_immutable
  before update on public.supplier_balance_transactions
  for each row execute function public.prevent_supplier_balance_mutation();

-- =============================================================================
-- 5. VIEWS
-- =============================================================================

create or replace view public.supplier_balance
with (security_invoker = on) as
select
  s.id as supplier_id,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'PURCHASE'), 0)::numeric        as total_purchases,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'PAYMENT'), 0)::numeric         as total_paid,
  coalesce(sum(t.amount) filter (where t.transaction_type = 'PURCHASE_RETURN'), 0)::numeric as total_returns,
  coalesce(sum(t.signed_amount), 0)::numeric                                                as balance
from public.suppliers s
left join public.supplier_balance_transactions t on t.supplier_id = s.id
group by s.id;

comment on view public.supplier_balance is 'Per-supplier totals. balance > 0 = owed to supplier, < 0 = credit held with them.';

create or replace view public.purchase_overview
with (security_invoker = on) as
select
  p.id as purchase_id,
  count(i.id)::integer                       as item_count,
  coalesce(sum(i.quantity), 0)::integer      as total_quantity
from public.purchases p
left join public.purchase_items i on i.purchase_id = p.id
group by p.id;

grant select on public.supplier_balance, public.purchase_overview to authenticated;

-- =============================================================================
-- 6. SEARCH FUNCTIONS
-- =============================================================================

drop function if exists public.search_purchases(text, uuid, text, text, date, date, numeric, numeric, text, integer, integer);
create or replace function public.search_purchases(
  p_search         text    default null,
  p_supplier_id    uuid    default null,
  p_payment_status text    default 'ALL',
  p_status         text    default 'ALL',
  p_date_from      date    default null,
  p_date_to        date    default null,
  p_min_amount     numeric default null,
  p_max_amount     numeric default null,
  p_payment_method text    default 'ALL',
  p_limit          integer default 20,
  p_offset         integer default 0
)
returns table (
  id               uuid,
  purchase_number  text,
  supplier_id      uuid,
  supplier_name    text,
  purchase_date    date,
  subtotal         numeric,
  discount         numeric,
  total_amount     numeric,
  paid_amount      numeric,
  remaining_amount numeric,
  payment_status   text,
  status           text,
  item_count       integer,
  total_quantity   integer,
  created_at       timestamptz,
  total_count      bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      p.id, p.purchase_number, p.supplier_id, s.name as supplier_name,
      p.purchase_date, p.subtotal, p.discount, p.total_amount,
      p.paid_amount, p.remaining_amount, p.payment_status, p.status,
      coalesce(o.item_count, 0) as item_count,
      coalesce(o.total_quantity, 0) as total_quantity,
      p.created_at
    from public.purchases p
    join public.suppliers s              on s.id = p.supplier_id
    left join public.purchase_overview o on o.purchase_id = p.id
    where
      (p_supplier_id is null or p.supplier_id = p_supplier_id)
      and (p_payment_status = 'ALL' or p.payment_status = p_payment_status)
      and (p_status = 'ALL' or p.status = p_status)
      and (p_date_from is null or p.purchase_date >= p_date_from)
      and (p_date_to   is null or p.purchase_date <= p_date_to)
      and (p_min_amount is null or p.total_amount >= p_min_amount)
      and (p_max_amount is null or p.total_amount <= p_max_amount)
      and (
        p_payment_method = 'ALL'
        or exists (
          select 1 from public.purchase_payments pay
          where pay.purchase_id = p.id and pay.payment_method = p_payment_method
        )
      )
      and (
        p_search is null or btrim(p_search) = ''
        or p.purchase_number ilike '%' || btrim(p_search) || '%'
        or s.name  ilike '%' || btrim(p_search) || '%'
        or coalesce(s.phone, '')    ilike '%' || btrim(p_search) || '%'
        or coalesce(s.whatsapp, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.purchase_items pi
          where pi.purchase_id = p.id
            and (
              pi.product_name_snapshot ilike '%' || btrim(p_search) || '%'
              or pi.variant_sku_snapshot ilike '%' || btrim(p_search) || '%'
              or exists (
                select 1 from public.product_variants v
                where v.id = pi.variant_id
                  and coalesce(v.barcode, '') ilike '%' || btrim(p_search) || '%'
              )
            )
        )
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.purchase_date desc, f.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- Running balance for the supplier ledger tab.
drop function if exists public.supplier_ledger(uuid, integer);
create or replace function public.supplier_ledger(
  p_supplier_id uuid,
  p_limit       integer default 200
)
returns table (
  id               uuid,
  transaction_type text,
  amount           numeric,
  signed_amount    numeric,
  reference_type   text,
  reference_id     uuid,
  description      text,
  created_at       timestamptz,
  running_balance  numeric
)
language sql
stable
set search_path = public
as $$
  select
    t.id, t.transaction_type, t.amount, t.signed_amount,
    t.reference_type, t.reference_id, t.description, t.created_at,
    sum(t.signed_amount) over (
      order by t.created_at, t.id
      rows between unbounded preceding and current row
    ) as running_balance
  from public.supplier_balance_transactions t
  where t.supplier_id = p_supplier_id
  order by t.created_at desc, t.id desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.search_purchases(text, uuid, text, text, date, date, numeric, numeric, text, integer, integer) to authenticated;
grant execute on function public.supplier_ledger(uuid, integer) to authenticated;

-- =============================================================================
-- 7. WRITE OPERATIONS (atomic, SECURITY DEFINER)
--
-- The purchase tables carry no INSERT/UPDATE/DELETE grants for `authenticated`
-- (see section 8). Every write happens here, inside one transaction, after an
-- explicit permission check — so paid_amount, remaining_amount, stock and the
-- supplier balance cannot be manipulated by a hand-crafted PostgREST call.
-- =============================================================================

create or replace function public.can_manage_purchases()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('ADMIN', 'MANAGER'), false);
$$;

revoke all on function public.can_manage_purchases() from public;
grant execute on function public.can_manage_purchases() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7.1 create_purchase
--
-- Records the document, raises stock, and posts to the supplier account in one
-- transaction. Totals are recomputed here from the items — anything the client
-- sent as a total is ignored.
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor          uuid := (select auth.uid());
  v_supplier_id    uuid := (p_payload ->> 'supplier_id')::uuid;
  v_purchase_id    uuid;
  v_purchase_no    text;
  v_item           jsonb;
  v_variant        record;
  v_quantity       integer;
  v_unit_cost      numeric(12,2);
  v_subtotal       numeric(12,2) := 0;
  v_discount       numeric(12,2) := coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0);
  v_total          numeric(12,2);
  v_paid           numeric(12,2) := 0;
  v_payment        jsonb := p_payload -> 'payment';
  v_method         text;
  v_status         text;
  v_update_cost    boolean := coalesce((p_payload ->> 'update_variant_cost')::boolean, true);
  v_item_count     integer := 0;
begin
  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to create purchases'
      using errcode = '42501';
  end if;

  -- --- supplier ------------------------------------------------------------
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

  -- --- document ------------------------------------------------------------
  insert into public.purchases (
    supplier_id, purchase_date, notes, status, created_by
  )
  values (
    v_supplier_id,
    coalesce(nullif(p_payload ->> 'purchase_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'notes'), ''),
    'COMPLETED',
    v_actor
  )
  returning id, purchase_number into v_purchase_id, v_purchase_no;

  -- --- items, snapshots, stock --------------------------------------------
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

    -- The purchase is the reason the stock exists; the ledger records why.
    insert into public.inventory_transactions (
      variant_id, transaction_type, quantity, reference_type, reference_id,
      notes, created_by
    )
    values (
      v_variant.id, 'PURCHASE', v_quantity, 'PURCHASE', v_purchase_id,
      'مشتريات ' || v_purchase_no, v_actor
    );

    -- The variant's default cost tracks the newest purchase; the historical
    -- unit_cost written above is never touched again.
    if v_update_cost then
      update public.product_variants
         set purchase_price = v_unit_cost
       where id = v_variant.id;
    end if;

    v_subtotal   := v_subtotal + round(v_quantity * v_unit_cost, 2);
    v_item_count := v_item_count + 1;
  end loop;

  -- --- totals --------------------------------------------------------------
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'invalid_discount' using errcode = '22023';
  end if;

  v_total := round(v_subtotal - v_discount, 2);

  -- --- opening payment -----------------------------------------------------
  if v_payment is not null and v_payment <> 'null'::jsonb then
    v_paid   := coalesce(nullif(v_payment ->> 'amount', '')::numeric, 0);
    v_method := coalesce(v_payment ->> 'payment_method', 'CASH');

    if v_paid < 0 then
      raise exception 'invalid_paid_amount' using errcode = '22023';
    end if;
    if v_paid > v_total then
      raise exception 'overpayment' using errcode = '22023';
    end if;

    if v_paid > 0 then
      if v_method = 'BANK_TRANSFER'
         and (
           coalesce(btrim(v_payment ->> 'bank_name'), '') = ''
           or coalesce(btrim(v_payment ->> 'transfer_reference'), '') = ''
         ) then
        raise exception 'bank_details_required' using errcode = '22023';
      end if;

      insert into public.purchase_payments (
        purchase_id, payment_method, amount, payment_date,
        bank_name, transfer_reference, receipt_image_path, notes, created_by
      )
      values (
        v_purchase_id, v_method, v_paid,
        coalesce(nullif(v_payment ->> 'payment_date', '')::date, current_date),
        nullif(btrim(v_payment ->> 'bank_name'), ''),
        nullif(btrim(v_payment ->> 'transfer_reference'), ''),
        nullif(btrim(v_payment ->> 'receipt_image_path'), ''),
        nullif(btrim(v_payment ->> 'notes'), ''),
        v_actor
      );
    end if;
  end if;

  v_status := case
    when v_paid = 0        then 'UNPAID'
    when v_paid >= v_total then 'PAID'
    else 'PARTIALLY_PAID'
  end;

  update public.purchases
     set subtotal         = v_subtotal,
         discount         = v_discount,
         total_amount     = v_total,
         paid_amount      = v_paid,
         remaining_amount = round(v_total - v_paid, 2),
         payment_status   = v_status
   where id = v_purchase_id;

  -- --- supplier account ----------------------------------------------------
  insert into public.supplier_balance_transactions (
    supplier_id, transaction_type, amount, reference_type, reference_id,
    description, created_by
  )
  values (
    v_supplier_id, 'PURCHASE', v_total, 'PURCHASE', v_purchase_id,
    'مشتريات ' || v_purchase_no, v_actor
  );

  if v_paid > 0 then
    insert into public.supplier_balance_transactions (
      supplier_id, transaction_type, amount, reference_type, reference_id,
      description, created_by
    )
    values (
      v_supplier_id, 'PAYMENT', v_paid, 'PURCHASE', v_purchase_id,
      'دفعة عند تسجيل مشتريات ' || v_purchase_no, v_actor
    );
  end if;

  return jsonb_build_object(
    'id', v_purchase_id,
    'purchase_number', v_purchase_no,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'total_amount', v_total,
    'paid_amount', v_paid,
    'remaining_amount', round(v_total - v_paid, 2),
    'payment_status', v_status,
    'item_count', v_item_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.2 add_purchase_payment
-- ---------------------------------------------------------------------------
create or replace function public.add_purchase_payment(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_purchase_id uuid := (p_payload ->> 'purchase_id')::uuid;
  v_amount      numeric(12,2) := coalesce(nullif(p_payload ->> 'amount', '')::numeric, 0);
  v_method      text := coalesce(p_payload ->> 'payment_method', 'CASH');
  v_purchase    record;
  v_new_paid    numeric(12,2);
  v_status      text;
begin
  if not public.can_manage_purchases() then
    raise exception 'forbidden: insufficient permission to record supplier payments'
      using errcode = '42501';
  end if;

  -- Lock the document so two concurrent payments cannot both pass the
  -- outstanding-amount check.
  select * into v_purchase
    from public.purchases
   where id = v_purchase_id
   for update;

  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;
  if v_purchase.status <> 'COMPLETED' then
    raise exception 'purchase_not_payable' using errcode = '22023';
  end if;
  if v_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_amount > v_purchase.remaining_amount then
    raise exception 'payment_exceeds_outstanding' using errcode = '22023';
  end if;

  if v_method = 'BANK_TRANSFER'
     and (
       coalesce(btrim(p_payload ->> 'bank_name'), '') = ''
       or coalesce(btrim(p_payload ->> 'transfer_reference'), '') = ''
     ) then
    raise exception 'bank_details_required' using errcode = '22023';
  end if;

  insert into public.purchase_payments (
    purchase_id, payment_method, amount, payment_date,
    bank_name, transfer_reference, receipt_image_path, notes, created_by
  )
  values (
    v_purchase_id, v_method, v_amount,
    coalesce(nullif(p_payload ->> 'payment_date', '')::date, current_date),
    nullif(btrim(p_payload ->> 'bank_name'), ''),
    nullif(btrim(p_payload ->> 'transfer_reference'), ''),
    nullif(btrim(p_payload ->> 'receipt_image_path'), ''),
    nullif(btrim(p_payload ->> 'notes'), ''),
    v_actor
  );

  v_new_paid := round(v_purchase.paid_amount + v_amount, 2);
  v_status := case
    when v_new_paid = 0                       then 'UNPAID'
    when v_new_paid >= v_purchase.total_amount then 'PAID'
    else 'PARTIALLY_PAID'
  end;

  update public.purchases
     set paid_amount      = v_new_paid,
         remaining_amount = round(v_purchase.total_amount - v_new_paid, 2),
         payment_status   = v_status
   where id = v_purchase_id;

  insert into public.supplier_balance_transactions (
    supplier_id, transaction_type, amount, reference_type, reference_id,
    description, created_by
  )
  values (
    v_purchase.supplier_id, 'PAYMENT', v_amount, 'PURCHASE', v_purchase_id,
    'دفعة لمشتريات ' || v_purchase.purchase_number, v_actor
  );

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'paid_amount', v_new_paid,
    'remaining_amount', round(v_purchase.total_amount - v_new_paid, 2),
    'payment_status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7.3 cancel_purchase
--
-- Nothing is deleted. Stock is reversed with PURCHASE_REVERSAL rows and the
-- supplier charge is reversed with an ADJUSTMENT. Payments already made are
-- deliberately left in place — the money really did leave the till, so the
-- balance goes negative and shows as a credit held with the supplier rather
-- than being silently erased.
-- ---------------------------------------------------------------------------
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

revoke all on function public.create_purchase(jsonb)        from public;
revoke all on function public.add_purchase_payment(jsonb)   from public;
revoke all on function public.cancel_purchase(uuid, text)   from public;

grant execute on function public.create_purchase(jsonb)      to authenticated;
grant execute on function public.add_purchase_payment(jsonb) to authenticated;
grant execute on function public.cancel_purchase(uuid, text) to authenticated;

-- =============================================================================
-- 8. ROW LEVEL SECURITY
--
-- Read: ADMIN + MANAGER (STAFF holds no purchase permissions at all).
-- Write: nobody directly — only the SECURITY DEFINER functions above, which
-- authorize first. That is why no INSERT/UPDATE/DELETE grants are issued.
-- =============================================================================

alter table public.purchases                     enable row level security;
alter table public.purchase_items                enable row level security;
alter table public.purchase_payments             enable row level security;
alter table public.supplier_balance_transactions enable row level security;

drop policy if exists purchases_select                     on public.purchases;
drop policy if exists purchase_items_select                on public.purchase_items;
drop policy if exists purchase_payments_select             on public.purchase_payments;
drop policy if exists supplier_balance_transactions_select on public.supplier_balance_transactions;

create policy purchases_select on public.purchases
  for select to authenticated using ((select public.can_manage_purchases()));

create policy purchase_items_select on public.purchase_items
  for select to authenticated using ((select public.can_manage_purchases()));

create policy purchase_payments_select on public.purchase_payments
  for select to authenticated using ((select public.can_manage_purchases()));

create policy supplier_balance_transactions_select on public.supplier_balance_transactions
  for select to authenticated using ((select public.can_manage_purchases()));

revoke all on public.purchases, public.purchase_items,
              public.purchase_payments, public.supplier_balance_transactions
  from authenticated, anon;

grant select on public.purchases                     to authenticated;
grant select on public.purchase_items                to authenticated;
grant select on public.purchase_payments             to authenticated;
grant select on public.supplier_balance_transactions to authenticated;

grant usage, select on sequence public.purchase_number_seq to authenticated;

-- =============================================================================
-- 9. STORAGE — payment receipts
--
-- The bucket was created in 0001. Re-assert its limits and policies here so
-- this migration is self-contained.
-- =============================================================================

update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
 where id = 'payment-receipts';

do $$
begin
  drop policy if exists payment_receipts_read   on storage.objects;
  drop policy if exists payment_receipts_write  on storage.objects;
  drop policy if exists payment_receipts_update on storage.objects;
  drop policy if exists payment_receipts_delete on storage.objects;

  create policy payment_receipts_read
    on storage.objects for select to authenticated
    using (bucket_id = 'payment-receipts' and (select public.can_manage_purchases()));

  create policy payment_receipts_write
    on storage.objects for insert to authenticated
    with check (bucket_id = 'payment-receipts' and (select public.can_manage_purchases()));

  create policy payment_receipts_update
    on storage.objects for update to authenticated
    using (bucket_id = 'payment-receipts' and (select public.can_manage_purchases()))
    with check (bucket_id = 'payment-receipts' and (select public.can_manage_purchases()));

  create policy payment_receipts_delete
    on storage.objects for delete to authenticated
    using (bucket_id = 'payment-receipts' and (select public.can_manage_purchases()));
exception
  when insufficient_privilege then
    raise notice 'Skipped payment-receipts storage policies: insufficient privilege.';
end;
$$;
