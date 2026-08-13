-- =============================================================================
-- 0027 — the money in the drawer that no report could explain
-- =============================================================================
--
-- `finance_summary` read sales, returns, purchases and expenses. It never read
-- `exchanges`. Every profit figure in the system single-sources from it (§75),
-- so every one of them was blind to the same thing.
--
-- What that cost, measured in the go-live simulation: a customer swapped a 150
-- piece for a 250 one and paid the 100 difference. The cash ledger recorded the
-- 100 — the drawer, the closing report and the reconciliation screen all agreed
-- it was there. No revenue line anywhere accounted for it, and the 50 of extra
-- cost that walked out of the shop was missing from cost of goods to match.
-- Gross profit for the day was understated by exactly the margin on the swap.
--
-- The four figures needed were already on the row: `exchanges` stores
-- returned_amount, new_items_amount, returned_cost and new_items_cost. Nothing
-- had to be recomputed or backfilled — the report simply had to look.
--
-- An exchange is a return and a sale in one movement. The right treatment is
-- the difference, not the replacement's full value: counting the whole 250
-- would inflate the day's sales by goods the shop was handed back. So revenue
-- takes (new - returned) and cost takes (new_cost - returned_cost), both
-- signed, because a customer swapping down is a refund wearing a different hat.
--
-- Cash was never wrong. Only the explanation of it was.
-- =============================================================================

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
  x as (
    select * from public.exchanges
     where status <> 'CANCELLED'
       and (p_date_from is null or exchange_date >= p_date_from)
       and (p_date_to   is null or exchange_date <= p_date_to)
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
      coalesce((select sum(amount)       from e), 0) as exp,
      -- Signed on purpose. A customer who swaps down takes money out of the
      -- day, and the same expression has to say so.
      coalesce((select sum(new_items_amount - returned_amount) from x), 0) as exdiff,
      coalesce((select sum(new_items_cost   - returned_cost)   from x), 0) as excost
  ),
  calc as (
    select
      base.*,
      (base.sold - base.ret + base.exdiff)      as net_sales,
      (base.cost - base.retcost + base.excost)  as net_cogs
    from base
  )
  select
    -- The difference is retail revenue that never carried a discount, so it
    -- joins the gross line as well as the net one. That keeps the identity a
    -- reader will check by hand — gross - discounts - returns = net — true.
    (calc.gross + calc.exdiff)::numeric,
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
