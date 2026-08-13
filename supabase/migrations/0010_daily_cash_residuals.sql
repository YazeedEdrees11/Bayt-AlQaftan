-- بيت القفطان (Bayt Al-Qaftan) — Phase 6 follow-up
-- =============================================================================
-- The daily cash statement did not add up.
--
-- `daily_cash_summary` itemised the movement kinds it knew about — sales,
-- customer payments, purchases, supplier payments, expenses, refunds and
-- transfers — but derived `closing_cash` from the sum of ALL of the day's cash
-- movements. Anything outside that list, notably a manual ADJUSTMENT or an
-- EXPENSE_REVERSAL, changed the closing figure while appearing on no line.
-- A day with a 4,000 adjustment reported −330 of itemised movement against a
-- 3,770 closing balance.
--
-- The fix is not to add two more named types, which would only move the problem
-- to the next kind added. The two new columns are RESIDUALS: everything that
-- came in less what the named inflows account for, and likewise for outflows.
-- The statement therefore balances by construction —
--
--   opening + (all inflows) − (all outflows) = closing
--
-- — no matter what movement kinds exist now or later. §52 anticipated this with
-- its "Other Cash In" line.
-- =============================================================================

drop function if exists public.daily_cash_summary(date);
create or replace function public.daily_cash_summary(p_date date default current_date)
returns table (
  opening_cash      numeric,
  sale_payments     numeric,
  customer_payments numeric,
  transfers_in      numeric,
  other_in          numeric,
  purchase_payments numeric,
  supplier_payments numeric,
  expenses          numeric,
  refunds           numeric,
  transfers_out     numeric,
  other_out         numeric,
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
  ),
  named as (
    select
      coalesce(sum(amount) filter (where transaction_type = 'SALE_PAYMENT'), 0)     as sale_pay,
      coalesce(sum(amount) filter (where transaction_type = 'CUSTOMER_PAYMENT'), 0) as cust_pay,
      coalesce(sum(amount) filter (where transaction_type = 'TRANSFER_IN'), 0)      as tr_in,
      coalesce(sum(amount) filter (where transaction_type = 'PURCHASE_PAYMENT'), 0) as pur_pay,
      coalesce(sum(amount) filter (where transaction_type = 'SUPPLIER_PAYMENT'), 0) as sup_pay,
      coalesce(sum(amount) filter (where transaction_type = 'EXPENSE'), 0)          as exp,
      coalesce(sum(amount) filter (
        where transaction_type in ('SALE_REFUND', 'CUSTOMER_REFUND')), 0)           as refund,
      coalesce(sum(amount) filter (where transaction_type = 'TRANSFER_OUT'), 0)     as tr_out,
      coalesce(sum(amount) filter (where direction = 'IN'), 0)                      as all_in,
      coalesce(sum(amount) filter (where direction = 'OUT'), 0)                     as all_out
    from day
  )
  select
    (select bal from before_day)::numeric,
    n.sale_pay::numeric,
    n.cust_pay::numeric,
    n.tr_in::numeric,
    -- Whatever came in that the named lines do not explain: adjustments,
    -- opening balances, expense reversals, and anything added later.
    (n.all_in - n.sale_pay - n.cust_pay - n.tr_in)::numeric,
    n.pur_pay::numeric,
    n.sup_pay::numeric,
    n.exp::numeric,
    n.refund::numeric,
    n.tr_out::numeric,
    (n.all_out - n.pur_pay - n.sup_pay - n.exp - n.refund - n.tr_out)::numeric,
    ((select bal from before_day) + n.all_in - n.all_out)::numeric
  from named n;
$fn$;

grant execute on function public.daily_cash_summary(date) to authenticated;
