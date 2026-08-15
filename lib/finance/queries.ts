import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "@/lib/catalog/config";
import {
  EXPENSE_RECEIPTS_BUCKET,
  EXPENSE_RECEIPT_URL_TTL_SECONDS,
} from "./receipts";
import type { Paginated } from "@/types/catalog";
import type {
  AccountBalance,
  AccountLedgerRow,
  DailyCashSummary,
  Expense,
  ExpenseCategory,
  ExpenseReportRow,
  ExpenseRow,
  ExpenseWithDetails,
  FinanceSeriesPoint,
  FinanceSummary,
  FinancialAccount,
  FinancialTransactionRow,
  FinancialTransfer,
  PayableRow,
  PaymentMethodBreakdownRow,
  ReceivableRow,
} from "@/types/finance";

/**
 * Read-side data access for finance.
 *
 * Every figure is aggregated in the database (§79) — no screen pulls a
 * transaction list into the browser to add it up. All reads go through the
 * user-scoped client, so RLS decides visibility and STAFF sees nothing here.
 */

function paginate<T>(rows: T[], total: number, page: number, perPage: number): Paginated<T> {
  return { rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

const EMPTY_SUMMARY: FinanceSummary = {
  gross_sales: 0, sales_discounts: 0, sales_returns: 0, net_sales: 0,
  cogs: 0, gross_profit: 0, gross_margin: 0,
  operating_expenses: 0, operating_profit: 0,
  total_purchases: 0, purchase_payments: 0,
  payments_received: 0, payments_made: 0, refunds_paid: 0,
  cash_in: 0, cash_out: 0, net_cash_flow: 0,
  cash_balance: 0, bank_balance: 0,
  customer_receivables: 0, supplier_payables: 0,
};

export async function getFinanceSummary(
  from?: string,
  to?: string,
): Promise<FinanceSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_summary", {
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
  });

  if (error) {
    console.error("[finance] getFinanceSummary:", error.message);
    throw new Error("تعذر تحميل الملخص المالي.");
  }
  return ((data ?? [])[0] as FinanceSummary | undefined) ?? EMPTY_SUMMARY;
}

/* -------------------------------------------------------------------------- */
/*                                  Accounts                                  */
/* -------------------------------------------------------------------------- */

export async function listAccountBalances(): Promise<AccountBalance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_balances")
    .select("*")
    .order("account_type")
    .order("name");

  if (error) {
    console.error("[finance] listAccountBalances:", error.message);
    throw new Error("تعذر تحميل الحسابات المالية.");
  }
  return (data ?? []) as AccountBalance[];
}

/** Active accounts for a form's account picker. */
export async function listActiveAccounts(): Promise<
  Pick<FinancialAccount, "id" | "name" | "account_type" | "is_default">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("id, name, account_type, is_default")
    .eq("is_active", true)
    .order("account_type")
    .order("name");

  if (error) {
    console.error("[finance] listActiveAccounts:", error.message);
    return [];
  }
  return (data ?? []) as Pick<
    FinancialAccount,
    "id" | "name" | "account_type" | "is_default"
  >[];
}

export async function getAccountById(id: string): Promise<AccountBalance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_balances")
    .select("*")
    .eq("account_id", id)
    .maybeSingle();

  if (error) {
    console.error("[finance] getAccountById:", error.message);
    throw new Error("تعذر تحميل الحساب.");
  }
  return (data as AccountBalance | null) ?? undefined;
}

export async function getAccountLedger(
  accountId: string,
  limit = 200,
): Promise<AccountLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_ledger", {
    p_account_id: accountId,
    p_limit: limit,
  });

  if (error) {
    console.error("[finance] getAccountLedger:", error.message);
    throw new Error("تعذر تحميل حركة الحساب.");
  }
  return (data ?? []) as AccountLedgerRow[];
}

/* -------------------------------------------------------------------------- */
/*                            Financial transactions                          */
/* -------------------------------------------------------------------------- */

export async function listFinancialTransactions({
  search,
  accountId,
  type = "ALL",
  direction = "ALL",
  from,
  to,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  accountId?: string;
  type?: string;
  direction?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<FinancialTransactionRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_financial_transactions", {
    p_search: search?.trim() || undefined,
    p_account: accountId ?? undefined,
    p_type: type,
    p_direction: direction,
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[finance] listFinancialTransactions:", error.message);
    throw new Error("تعذر تحميل الحركات المالية.");
  }

  const rows = (data ?? []) as FinancialTransactionRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

/* -------------------------------------------------------------------------- */
/*                                  Expenses                                  */
/* -------------------------------------------------------------------------- */

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[finance] listExpenseCategories:", error.message);
    return [];
  }
  return (data ?? []) as ExpenseCategory[];
}

export async function listExpenses({
  search,
  categoryId,
  method = "ALL",
  accountId,
  status = "ALL",
  from,
  to,
  minAmount,
  maxAmount,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  categoryId?: string;
  method?: string;
  accountId?: string;
  status?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ExpenseRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_expenses", {
    p_search: search?.trim() || undefined,
    p_category: categoryId ?? undefined,
    p_method: method,
    p_account: accountId ?? undefined,
    p_status: status,
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_min_amount: minAmount ?? undefined,
    p_max_amount: maxAmount ?? undefined,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[finance] listExpenses:", error.message);
    throw new Error("تعذر تحميل المصاريف.");
  }

  const rows = (data ?? []) as ExpenseRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

export async function getExpenseById(id: string): Promise<ExpenseWithDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("*, category:expense_categories(name), account:financial_accounts(name, account_type)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[finance] getExpenseById:", error.message);
    throw new Error("تعذر تحميل المصروف.");
  }
  if (!data) return null;

  const row = data as unknown as Expense & {
    category: { name: string } | null;
    account: { name: string; account_type: "CASH" | "BANK" } | null;
  };

  let receiptUrl: string | null = null;
  if (row.receipt_image_path) {
    const { data: signed } = await supabase.storage
      .from(EXPENSE_RECEIPTS_BUCKET)
      .createSignedUrl(row.receipt_image_path, EXPENSE_RECEIPT_URL_TTL_SECONDS);
    receiptUrl = signed?.signedUrl ?? undefined;
  }

  let actorName: string | null = null;
  if (row.created_by) {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", row.created_by)
        .maybeSingle();
      actorName = (profile as { full_name: string } | null)?.full_name ?? undefined;
    } catch (error) {
      console.error("[finance] actor lookup:", error);
    }
  }

  return {
    ...row,
    category_name: row.category?.name ?? "",
    account_name: row.account?.name ?? "",
    account_type: row.account?.account_type ?? "CASH",
    created_by_name: actorName,
    receipt_url: receiptUrl,
  };
}

export async function getExpenseReport(
  from?: string,
  to?: string,
): Promise<ExpenseReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expense_report", {
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
  });

  if (error) {
    console.error("[finance] getExpenseReport:", error.message);
    throw new Error("تعذر تحميل تقرير المصاريف.");
  }
  return (data ?? []) as ExpenseReportRow[];
}

/* -------------------------------------------------------------------------- */
/*                             Reports and charts                             */
/* -------------------------------------------------------------------------- */

export async function getPaymentMethodBreakdown(
  from?: string,
  to?: string,
): Promise<PaymentMethodBreakdownRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_method_breakdown", {
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
  });
  if (error) {
    console.error("[finance] getPaymentMethodBreakdown:", error.message);
    return [];
  }
  return (data ?? []) as PaymentMethodBreakdownRow[];
}

export async function getFinanceSeries(
  from?: string,
  to?: string,
  bucket: "day" | "week" | "month" = "day",
): Promise<FinanceSeriesPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_series", {
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_bucket: bucket,
  });
  if (error) {
    console.error("[finance] getFinanceSeries:", error.message);
    return [];
  }
  // gross_profit is derived here rather than in SQL so the two figures can
  // never disagree about which cost basis they used.
  return ((data ?? []) as FinanceSeriesPoint[]).map((point) => ({
    ...point,
    gross_profit:
      Math.round((Number(point.net_sales) - Number(point.cogs)) * 100) / 100,
  }));
}

export async function getDailyCashSummary(date?: string): Promise<DailyCashSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_cash_summary", {
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });

  if (error) {
    console.error("[finance] getDailyCashSummary:", error.message);
    throw new Error("تعذر تحميل حركة الصندوق.");
  }

  return (
    ((data ?? [])[0] as DailyCashSummary | undefined) ?? {
      opening_cash: 0, sale_payments: 0, customer_payments: 0, transfers_in: 0,
      other_in: 0, purchase_payments: 0, supplier_payments: 0, expenses: 0,
      refunds: 0, transfers_out: 0, other_out: 0, closing_cash: 0,
    }
  );
}

export async function listReceivables(): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_receivables")
    .select("*")
    .order("outstanding", { ascending: false });

  if (error) {
    console.error("[finance] listReceivables:", error.message);
    throw new Error("تعذر تحميل ذمم العملاء.");
  }
  return (data ?? []) as ReceivableRow[];
}

export async function listPayables(): Promise<PayableRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_payables")
    .select("*")
    .order("outstanding", { ascending: false });

  if (error) {
    console.error("[finance] listPayables:", error.message);
    throw new Error("تعذر تحميل ذمم الموردين.");
  }
  return (data ?? []) as PayableRow[];
}

export async function listTransfers(limit = 50): Promise<FinancialTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_transfers")
    .select("*")
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[finance] listTransfers:", error.message);
    return [];
  }
  return (data ?? []) as FinancialTransfer[];
}
