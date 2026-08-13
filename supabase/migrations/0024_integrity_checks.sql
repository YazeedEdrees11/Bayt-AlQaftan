-- =============================================================================
-- 0024 — Data integrity and reconciliation diagnostics (§71–§78)
--
-- Read-only, every one of them. §73 is explicit that a check must not repair
-- what it finds, and that is the right rule: a diagnostic that edits records is
-- a diagnostic nobody can trust the next time it reports "healthy". These
-- functions count and describe; correcting anything remains a deliberate,
-- audited act by a person who has read what the check said.
--
-- The reconciliations deliberately compare *existing* definitions against each
-- other rather than introducing a third. `customer_balance` and
-- `customer_performance` already both claim to know what a customer owes; the
-- check asserts they agree. Inventing a second calculation to check the first
-- would only produce a third number to disagree with.
-- =============================================================================

-- Severity is the shop's word for how worried to be, not the database's.
--   CRITICAL — money or stock is provably wrong somewhere
--   WARNING  — something is inconsistent and wants a human
--   OK       — nothing found
create or replace function public.integrity_checks()
returns table (
  check_key   text,
  title       text,
  severity    text,
  issue_count integer,
  detail      text,
  reference   text
)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_allow_negative boolean := public.setting_bool('allow_negative_stock', false);
begin
  if not public.is_admin() then
    raise exception 'forbidden: integrity checks are administrator-only'
      using errcode = '42501';
  end if;

  return query

  -- ---------------------------------------------------------------- stock --
  select 'NEGATIVE_STOCK', 'مخزون سالب',
         case when c > 0 and not v_allow_negative then 'CRITICAL'
              when c > 0 then 'WARNING' else 'OK' end,
         c::integer,
         case when c = 0 then 'لا توجد أرصدة سالبة.'
              when v_allow_negative then 'أرصدة سالبة، والمخزون السالب مسموح في الإعدادات.'
              else 'أرصدة سالبة رغم أن المخزون السالب معطّل — تحقق من الجرد.' end,
         '/reports/inventory/value'
    from (select count(*) c from public.variant_stock where current_stock < 0) t

  union all
  -- A completed sale must have moved stock. If a line exists with no movement
  -- behind it, the shelf and the system disagree and nobody was told.
  select 'SALE_WITHOUT_MOVEMENT', 'بيع بلا حركة مخزون',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'كل بند مبيع له حركة مخزون مقابلة.'
              else 'بنود مبيعة لا توجد لها حركة مخزون.' end,
         '/reports/inventory/movement'
    from (
      select count(*) c
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
       where s.status = 'COMPLETED'
         and not exists (
           select 1 from public.inventory_transactions t
            where t.reference_type = 'SALE' and t.reference_id = s.id
              and t.variant_id = si.variant_id)
    ) t

  -- ------------------------------------------------------------- orphans --
  union all
  select 'ORPHAN_SALE_ITEMS', 'بنود بيع بلا فاتورة',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'لا توجد بنود يتيمة.' else 'بنود بيع لا تنتمي لفاتورة.' end,
         null
    from (select count(*) c from public.sale_items si
           where not exists (select 1 from public.sales s where s.id = si.sale_id)) t

  union all
  select 'ORPHAN_PURCHASE_ITEMS', 'بنود شراء بلا فاتورة',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'لا توجد بنود يتيمة.' else 'بنود شراء لا تنتمي لفاتورة.' end,
         null
    from (select count(*) c from public.purchase_items pi
           where not exists (select 1 from public.purchases p where p.id = pi.purchase_id)) t

  union all
  select 'ORPHAN_PAYMENTS', 'دفعات بلا مستند',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'كل دفعة مرتبطة بمستند.' else 'دفعات لا تنتمي لفاتورة.' end,
         null
    from (
      select (select count(*) from public.sale_payments sp
               where not exists (select 1 from public.sales s where s.id = sp.sale_id))
           + (select count(*) from public.purchase_payments pp
               where not exists (select 1 from public.purchases p where p.id = pp.purchase_id))
        as c
    ) t

  union all
  select 'RETURN_WITHOUT_SALE', 'مرتجع بلا فاتورة',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'كل مرتجع مرتبط بفاتورة قائمة.'
              else 'مرتجعات لا تنتمي لفاتورة.' end,
         '/returns'
    from (select count(*) c from public.sales_returns r
           where not exists (select 1 from public.sales s where s.id = r.sale_id)) t

  union all
  select 'TRANSACTION_WITHOUT_ACCOUNT', 'حركة مالية بلا حساب',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'كل حركة مالية مرتبطة بحساب.'
              else 'حركات مالية لا تنتمي لحساب.' end,
         '/finance/transactions'
    from (
      select count(*) c from public.financial_transactions ft
       where not exists (select 1 from public.financial_accounts a
                          where a.id = ft.financial_account_id)
    ) t

  -- ------------------------------------------------------ numbering --------
  union all
  select 'DUPLICATE_NUMBERS', 'أرقام مستندات مكررة',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'لا يوجد رقم مستند مكرر.'
              else 'أرقام مستندات مكررة — راجع إعدادات الترقيم.' end,
         '/settings/numbering'
    from (
      select (select count(*) from (select sale_number from public.sales
                                     group by sale_number having count(*) > 1) a)
           + (select count(*) from (select purchase_number from public.purchases
                                     group by purchase_number having count(*) > 1) b)
           + (select count(*) from (select return_number from public.sales_returns
                                     group by return_number having count(*) > 1) c2)
           + (select count(*) from (select exchange_number from public.exchanges
                                     group by exchange_number having count(*) > 1) d)
           + (select count(*) from (select expense_number from public.expenses
                                     group by expense_number having count(*) > 1) e)
           + (select count(*) from (select transaction_number from public.financial_transactions
                                     group by transaction_number having count(*) > 1) f)
        as c
    ) t

  -- --------------------------------------------------- reconciliation ------
  union all
  -- §75. Two existing definitions of what a customer owes, asserted equal.
  select 'CUSTOMER_BALANCE', 'أرصدة العملاء',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'رصيد كل عميل يطابق دفتره.'
              else 'عملاء يختلف رصيدهم عن مجموع حركاتهم.' end,
         '/reports/customers/debt'
    from (
      select count(*) c
        from public.customer_balance b
        join public.customer_performance p on p.customer_id = b.customer_id
       where abs(coalesce(b.balance, 0) - coalesce(p.outstanding, 0)) > 0.01
    ) t

  union all
  select 'SUPPLIER_BALANCE', 'أرصدة الموردين',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'رصيد كل مورد يطابق دفتره.'
              else 'موردون يختلف رصيدهم عن مجموع حركاتهم.' end,
         '/reports/suppliers/debt'
    from (
      select count(*) c
        from public.supplier_balance b
        join public.supplier_performance p on p.supplier_id = b.supplier_id
       where abs(coalesce(b.balance, 0) - coalesce(p.outstanding, 0)) > 0.01
    ) t

  union all
  -- §78. Opening + inflows − outflows must be the balance the account reports.
  select 'ACCOUNT_BALANCE', 'أرصدة الحسابات المالية',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'كل حساب يساوي افتتاحه زائد وارده ناقص صادره.'
              else 'حسابات لا يتطابق رصيدها مع حركاتها.' end,
         '/finance/accounts'
    from (
      select count(*) c from public.account_balances a
       where abs(
         coalesce(a.balance, 0)
         - (coalesce(a.opening_balance, 0) + coalesce(a.total_in, 0) - coalesce(a.total_out, 0))
       ) > 0.01
    ) t

  union all
  -- §77. Stock is the sum of its movements, or the derivation is broken.
  select 'STOCK_VS_MOVEMENTS', 'المخزون مقابل حركاته',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'رصيد كل موديل يساوي مجموع حركاته.'
              else 'موديلات لا يطابق رصيدها مجموع حركاتها.' end,
         '/reports/inventory/movement'
    from (
      select count(*) c
        from public.variant_stock vs
        left join (
          select variant_id, sum(signed_quantity) qty
            from public.inventory_transactions
           where stock_state = 'AVAILABLE'
           group by variant_id
        ) mv on mv.variant_id = vs.variant_id
       where coalesce(vs.available_quantity, 0) <> coalesce(mv.qty, 0)
    ) t

  union all
  -- An exchange that does not balance is an exchange whose difference was
  -- written down wrong, which means somebody was charged the wrong amount.
  select 'EXCHANGE_BALANCE', 'اتساق الاستبدالات',
         case when c > 0 then 'WARNING' else 'OK' end, c::integer,
         case when c = 0 then 'كل استبدال يوازن قيمته.'
              else 'استبدالات لا يساوي فرقها قيمة الوارد ناقص المرتجع.' end,
         '/exchanges'
    from (
      select count(*) c from public.exchanges e
       where e.status <> 'CANCELLED'
         and abs(coalesce(e.difference_amount, 0)
                 - (coalesce(e.new_items_amount, 0) - coalesce(e.returned_amount, 0))) > 0.01
    ) t

  union all
  -- A sale's own arithmetic: paid plus remaining is the total, always.
  select 'SALE_PAYMENT_SPLIT', 'اتساق مبالغ الفواتير',
         case when c > 0 then 'CRITICAL' else 'OK' end, c::integer,
         case when c = 0 then 'المدفوع والمتبقي يساويان الإجمالي في كل فاتورة.'
              else 'فواتير لا يساوي فيها المدفوع والمتبقي الإجمالي.' end,
         '/sales'
    from (
      select count(*) c from public.sales
       where status = 'COMPLETED'
         and abs(coalesce(paid_amount, 0) + coalesce(remaining_amount, 0)
                 - coalesce(total_amount, 0)) > 0.01
    ) t;
end;
$fn$;

revoke all on function public.integrity_checks() from public;
grant execute on function public.integrity_checks() to authenticated;

comment on function public.integrity_checks() is
  'Read-only diagnostics. Counts and describes; never repairs (§73).';

-- =============================================================================
-- Reconciliation totals (§74) — the figures an owner checks by hand
-- =============================================================================

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
  select 'إجمالي المبيعات المكتملة',
         coalesce((select sum(total_amount) from public.sales where status = 'COMPLETED'), 0),
         '/reports/sales'
  union all
  select 'إجمالي المشتريات المكتملة',
         coalesce((select sum(total_amount) from public.purchases where status = 'COMPLETED'), 0),
         '/reports/purchases';
end;
$fn$;

revoke all on function public.reconciliation_summary() from public;
grant execute on function public.reconciliation_summary() to authenticated;
