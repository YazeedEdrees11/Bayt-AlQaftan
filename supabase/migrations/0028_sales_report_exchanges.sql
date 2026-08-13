-- =============================================================================
-- 0028 — the second opinion on the same number
-- =============================================================================
--
-- 0027 taught `finance_summary` to see exchanges. `get_sales_report` keeps its
-- own copy of gross and net sales, so it did not learn anything, and the two
-- screens now disagree by exactly the exchange differences.
--
-- Worth being precise about what went wrong, because it is not "someone forgot
-- to delegate". This function *cannot* delegate: it filters by customer,
-- category and payment method, and `finance_summary` takes only dates. The
-- duplication is load-bearing. What that means is that any change to the shape
-- of revenue has to be made in both places, and 0027 was made in one.
--
-- The two were identical while both were wrong, which is why every
-- cross-report check in the suite passed for ten phases. Agreement between two
-- copies of the same mistake reads exactly like correctness.
--
-- Exchanges are filtered here the way returns already are — by date and
-- customer, not by category or payment method. An exchange spans two products
-- and settles by a method of its own, so neither filter has a single honest
-- answer for it; the returns leg made that call first and this follows it.
--
-- `reconciliation_summary` had the same copy and is fixed here too. A sweep of
-- all 99 live functions found exactly one more that keeps its own revenue —
-- `sales_summary`, behind the sales list — and that one is left alone on
-- purpose: it summarises the invoices shown beneath it, and folding exchanges
-- in would stop its total tying to the rows on screen. Its «الربح الإجمالي»
-- label is qualified in the UI instead, so it does not read as the shop's
-- profit.
-- =============================================================================

create or replace function public.get_sales_report(
  p_date_from date default null,
  p_date_to   date default null,
  p_customer  uuid default null,
  p_category  uuid default null,
  p_method    text default 'ALL'
)
returns table (
  gross_sales      numeric,
  discounts        numeric,
  returns_value    numeric,
  net_sales        numeric,
  invoice_count    integer,
  units_sold       integer,
  units_returned   integer,
  average_order    numeric,
  cash_sales       numeric,
  bank_sales       numeric,
  total_collected  numeric,
  total_outstanding numeric
)
language plpgsql stable set search_path = public as $fn$
#variable_conflict use_column
begin
  if not public.can_view_reports() then
    raise exception 'forbidden: insufficient permission to view reports'
      using errcode = '42501';
  end if;
  return query
with s as (
    select * from public.sales
     where status = 'COMPLETED'
       and (p_date_from is null or sale_date >= p_date_from)
       and (p_date_to   is null or sale_date <= p_date_to)
       and (p_customer is null or customer_id = p_customer)
       and (p_category is null or exists (
             select 1 from public.sale_items si
             join public.product_variants v on v.id = si.variant_id
             join public.products pr on pr.id = v.product_id
             where si.sale_id = sales.id and pr.category_id = p_category))
       and (p_method = 'ALL' or exists (
             select 1 from public.sale_payments sp
             where sp.sale_id = sales.id and sp.payment_method = p_method))
  ),
  r as (
    select * from public.sales_returns
     where status <> 'CANCELLED'
       and (p_date_from is null or return_date >= p_date_from)
       and (p_date_to   is null or return_date <= p_date_to)
       and (p_customer is null or customer_id = p_customer)
  ),
  x as (
    -- Filtered the way `r` above is filtered — by date and customer, not by
    -- category or payment method. An exchange spans two products and settles
    -- its difference by a method of its own, so neither of those filters has a
    -- single honest answer for it, and the returns leg already made that call.
    select * from public.exchanges
     where status <> 'CANCELLED'
       and (p_date_from is null or exchange_date >= p_date_from)
       and (p_date_to   is null or exchange_date <= p_date_to)
       and (p_customer is null or customer_id = p_customer)
  ),
  pay as (
    select sp.payment_method, sp.amount
    from public.sale_payments sp join s on s.id = sp.sale_id
  )
  select
    (coalesce((select sum(subtotal) from s), 0)
     + coalesce((select sum(new_items_amount - returned_amount) from x), 0))::numeric,
    coalesce((select sum(discount) from s), 0)::numeric,
    coalesce((select sum(refund_amount) from r), 0)::numeric,
    (coalesce((select sum(total_amount) from s), 0)
     - coalesce((select sum(refund_amount) from r), 0)
     + coalesce((select sum(new_items_amount - returned_amount) from x), 0))::numeric,
    (select count(*) from s)::integer,
    coalesce((select sum(si.quantity) from public.sale_items si join s on s.id = si.sale_id), 0)::integer,
    coalesce((select sum(ri.quantity) from public.sales_return_items ri join r on r.id = ri.return_id), 0)::integer,
    -- Deliberately still invoice-only: an exchange is not an order, and the
    -- average invoice is the question this figure answers. It is the one number
    -- here that will not reproduce from net_sales / invoice_count.
    case when (select count(*) from s) > 0
      then round((coalesce((select sum(total_amount) from s), 0)
                  - coalesce((select sum(refund_amount) from r), 0)) / (select count(*) from s), 2)
      else 0 end::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'CASH'), 0)::numeric,
    coalesce((select sum(amount) from pay where payment_method = 'BANK_TRANSFER'), 0)::numeric,
    coalesce((select sum(paid_amount) from s), 0)::numeric,
    coalesce((select sum(remaining_amount) from s), 0)::numeric;
end;
$fn$;

create or replace function public.reconciliation_summary()
returns table (
  label       text,
  amount      numeric,
  reference   text
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.is_admin() then
    raise exception 'forbidden: reconciliation is administrator-only'
      using errcode = '42501';
  end if;

  return query
  select 'النقد في الصندوق',
         coalesce((select sum(balance) from public.account_balances
                    where account_type = 'CASH'), 0),
         '/finance/cash'
  union all
  select 'الرصيد البنكي',
         coalesce((select sum(balance) from public.account_balances
                    where account_type = 'BANK'), 0),
         '/finance/banks'
  union all
  select 'ذمم العملاء',
         coalesce((select sum(balance) from public.customer_balance where balance > 0), 0),
         '/reports/customers/debt'
  union all
  select 'ذمم الموردين',
         coalesce((select sum(balance) from public.supplier_balance where balance > 0), 0),
         '/reports/suppliers/debt'
  union all
  select 'قيمة المخزون بالتكلفة',
         coalesce((select stock_cost from public.get_inventory_value_report()), 0),
         '/reports/inventory/value'
  union all
  -- Every row here exists to tie to the screen it links to. /reports/sales
  -- counts the exchange differences as of 0027, so this has to as well, or the
  -- reconciliation screen becomes the one place that disagrees.
  select 'إجمالي المبيعات المكتملة',
         coalesce((select sum(total_amount) from public.sales
                    where status = 'COMPLETED'), 0)
         + coalesce((select sum(new_items_amount - returned_amount)
                       from public.exchanges where status <> 'CANCELLED'), 0),
         '/reports/sales'
  union all
  select 'إجمالي المشتريات المكتملة',
         coalesce((select sum(total_amount) from public.purchases where status = 'COMPLETED'), 0),
         '/reports/purchases';
end;
$fn$;
