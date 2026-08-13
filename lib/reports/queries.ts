import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "@/lib/catalog/config";
import type { Paginated } from "@/types/catalog";
import type {
  CashClosing,
  ComparisonRow,
  CustomerPerformanceRow,
  DailyClosingSummary,
  InventoryMovementRow,
  InventoryValueReport,
  ManagementAlert,
  ManagementKpis,
  PerformancePeriod,
  ProductReportRow,
  ProductSort,
  ProfitDimension,
  ProfitDimensionRow,
  ProfitReport,
  PurchaseReport,
  ReportBucket,
  ReportSettings,
  SalesReport,
  SalesSeriesPoint,
  StockAlertMode,
  StockAlertRow,
  SupplierPerformanceRow,
} from "@/types/reports";

/**
 * Read-side data access for reports.
 *
 * Every figure is aggregated in the database (§68) — no report pulls rows into
 * the browser to total them. All reads go through the user-scoped client, so
 * RLS decides visibility and a direct URL cannot bypass it.
 */

const FAILED = "تعذر تحميل التقرير.";

function paginate<T>(rows: T[], total: number, page: number, perPage: number): Paginated<T> {
  return { rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/** Every report resolves its window the same way; nothing invents its own. */
export type ReportRange = { from?: string; to?: string };

/* -------------------------------------------------------------------------- */
/*                              Sales and purchases                           */
/* -------------------------------------------------------------------------- */

const EMPTY_SALES: SalesReport = {
  gross_sales: 0, discounts: 0, returns_value: 0, net_sales: 0,
  invoice_count: 0, units_sold: 0, units_returned: 0, average_order: 0,
  cash_sales: 0, bank_sales: 0, total_collected: 0, total_outstanding: 0,
};

export async function getSalesReport(
  range: ReportRange = {},
  { customerId, categoryId, method = "ALL" }: {
    customerId?: string;
    categoryId?: string;
    method?: string;
  } = {},
): Promise<SalesReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sales_report", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_customer: customerId ?? null,
    p_category: categoryId ?? null,
    p_method: method,
  });
  if (error) {
    console.error("[reports] getSalesReport:", error.message);
    throw new Error(FAILED);
  }
  return ((data ?? [])[0] as SalesReport | undefined) ?? EMPTY_SALES;
}

export async function getSalesSeries(
  range: ReportRange = {},
  bucket: ReportBucket = "day",
): Promise<SalesSeriesPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sales_series", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_bucket: bucket,
  });
  if (error) {
    console.error("[reports] getSalesSeries:", error.message);
    return [];
  }
  return (data ?? []) as SalesSeriesPoint[];
}

const EMPTY_PURCHASES: PurchaseReport = {
  total_purchases: 0, purchase_count: 0, units_purchased: 0,
  paid_to_suppliers: 0, outstanding: 0, purchase_returns: 0, net_purchases: 0,
};

export async function getPurchaseReport(
  range: ReportRange = {},
  supplierId?: string,
): Promise<PurchaseReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_purchase_report", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_supplier: supplierId ?? null,
  });
  if (error) {
    console.error("[reports] getPurchaseReport:", error.message);
    throw new Error(FAILED);
  }
  return ((data ?? [])[0] as PurchaseReport | undefined) ?? EMPTY_PURCHASES;
}

/* -------------------------------------------------------------------------- */
/*                                    Profit                                  */
/* -------------------------------------------------------------------------- */

const EMPTY_PROFIT: ProfitReport = {
  gross_sales: 0, discounts: 0, returns_value: 0, net_sales: 0, cogs: 0,
  gross_profit: 0, gross_margin: 0, operating_expenses: 0,
  operating_profit: 0, operating_margin: 0,
};

export async function getProfitReport(range: ReportRange = {}): Promise<ProfitReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profit_report", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
  });
  if (error) {
    console.error("[reports] getProfitReport:", error.message);
    throw new Error(FAILED);
  }
  return ((data ?? [])[0] as ProfitReport | undefined) ?? EMPTY_PROFIT;
}

export async function getProfitByDimension(
  range: ReportRange = {},
  dimension: ProfitDimension = "product",
  limit = 50,
): Promise<ProfitDimensionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profit_by_dimension", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_dimension: dimension,
    p_limit: limit,
  });
  if (error) {
    console.error("[reports] getProfitByDimension:", error.message);
    return [];
  }
  return (data ?? []) as ProfitDimensionRow[];
}

/* -------------------------------------------------------------------------- */
/*                                  Products                                  */
/* -------------------------------------------------------------------------- */

export async function getProductReport({
  range = {},
  categoryId,
  brand,
  supplierId,
  sort = "quantity",
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  range?: ReportRange;
  categoryId?: string;
  brand?: string;
  supplierId?: string;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ProductReportRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("get_product_report", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_category: categoryId ?? null,
    p_brand: brand ?? null,
    p_supplier: supplierId ?? null,
    p_sort: sort,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[reports] getProductReport:", error.message);
    throw new Error(FAILED);
  }
  const rows = (data ?? []) as ProductReportRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

/* -------------------------------------------------------------------------- */
/*                                  Inventory                                 */
/* -------------------------------------------------------------------------- */

export async function getStockAlertReport({
  mode = "LOW",
  categoryId,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  mode?: StockAlertMode;
  categoryId?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<StockAlertRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("get_stock_alert_report", {
    p_mode: mode,
    p_category: categoryId ?? null,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[reports] getStockAlertReport:", error.message);
    throw new Error(FAILED);
  }
  const rows = (data ?? []) as StockAlertRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

const EMPTY_INVENTORY: InventoryValueReport = {
  total_variants: 0, total_units: 0, damaged_units: 0, stock_cost: 0,
  stock_retail: 0, potential_profit: 0, potential_margin: 0,
  low_stock_count: 0, out_of_stock_count: 0,
};

export async function getInventoryValueReport(): Promise<InventoryValueReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_inventory_value_report", {});
  if (error) {
    console.error("[reports] getInventoryValueReport:", error.message);
    throw new Error(FAILED);
  }
  return ((data ?? [])[0] as InventoryValueReport | undefined) ?? EMPTY_INVENTORY;
}

export async function getInventoryMovementReport({
  range = {},
  variantId,
  type = "ALL",
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  range?: ReportRange;
  variantId?: string;
  type?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<InventoryMovementRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("get_inventory_movement_report", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
    p_variant: variantId ?? null,
    p_type: type,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[reports] getInventoryMovementReport:", error.message);
    throw new Error(FAILED);
  }
  const rows = (data ?? []) as InventoryMovementRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

/* -------------------------------------------------------------------------- */
/*                          Customers and suppliers                           */
/* -------------------------------------------------------------------------- */

export async function getCustomerPerformance({
  debtOnly = false,
  limit = 200,
}: { debtOnly?: boolean; limit?: number } = {}): Promise<CustomerPerformanceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("customer_performance")
    .select("*")
    .order("outstanding", { ascending: false })
    .limit(limit);
  if (debtOnly) query = query.gt("outstanding", 0);

  const { data, error } = await query;
  if (error) {
    console.error("[reports] getCustomerPerformance:", error.message);
    throw new Error(FAILED);
  }
  return (data ?? []) as CustomerPerformanceRow[];
}

export async function getSupplierPerformance({
  debtOnly = false,
  limit = 200,
}: { debtOnly?: boolean; limit?: number } = {}): Promise<SupplierPerformanceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("supplier_performance")
    .select("*")
    .order("outstanding", { ascending: false })
    .limit(limit);
  if (debtOnly) query = query.gt("outstanding", 0);

  const { data, error } = await query;
  if (error) {
    console.error("[reports] getSupplierPerformance:", error.message);
    throw new Error(FAILED);
  }
  return (data ?? []) as SupplierPerformanceRow[];
}

/* -------------------------------------------------------------------------- */
/*                          Management KPIs and trends                        */
/* -------------------------------------------------------------------------- */

const EMPTY_KPIS: ManagementKpis = {
  net_sales: 0, gross_profit: 0, gross_margin: 0, operating_profit: 0,
  operating_margin: 0, order_count: 0, units_sold: 0, average_order_value: 0,
  units_per_order: 0, return_rate: 0, expense_ratio: 0, inventory_cost: 0,
  inventory_turnover: 0, customer_receivables: 0, supplier_payables: 0,
  low_stock_count: 0,
};

export async function getManagementKpis(range: ReportRange = {}): Promise<ManagementKpis> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_management_kpis", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
  });
  if (error) {
    console.error("[reports] getManagementKpis:", error.message);
    throw new Error(FAILED);
  }
  return ((data ?? [])[0] as ManagementKpis | undefined) ?? EMPTY_KPIS;
}

export async function getPeriodComparison(range: ReportRange = {}): Promise<ComparisonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_period_comparison", {
    p_date_from: range.from ?? null,
    p_date_to: range.to ?? null,
  });
  if (error) {
    console.error("[reports] getPeriodComparison:", error.message);
    return [];
  }
  return (data ?? []) as ComparisonRow[];
}

export async function getManagementAlerts(): Promise<ManagementAlert[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_management_alerts", {});
  if (error) {
    console.error("[reports] getManagementAlerts:", error.message);
    return [];
  }
  return (data ?? []) as ManagementAlert[];
}

/* -------------------------------------------------------------------------- */
/*                        Closing and period performance                      */
/* -------------------------------------------------------------------------- */

export async function getDailyClosingSummary(date?: string): Promise<DailyClosingSummary> {
  const supabase = await createClient();
  const day = date ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("get_daily_closing_summary", { p_date: day });
  if (error) {
    console.error("[reports] getDailyClosingSummary:", error.message);
    throw new Error(FAILED);
  }
  return (
    ((data ?? [])[0] as DailyClosingSummary | undefined) ?? {
      closing_date: day,
      cash_opening: 0, cash_in: 0, cash_out: 0, cash_closing: 0,
      bank_opening: 0, bank_in: 0, bank_out: 0, bank_closing: 0,
      sales_total: 0, returns_total: 0, expenses_total: 0, gross_profit: 0,
      customer_outstanding: 0, supplier_outstanding: 0,
    }
  );
}

export async function getMonthlyPerformance(year?: number): Promise<PerformancePeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_monthly_performance", {
    p_year: year ?? null,
  });
  if (error) {
    console.error("[reports] getMonthlyPerformance:", error.message);
    return [];
  }
  return (data ?? []) as PerformancePeriod[];
}

export async function getYearlyPerformance(years = 5): Promise<PerformancePeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_yearly_performance", { p_years: years });
  if (error) {
    console.error("[reports] getYearlyPerformance:", error.message);
    return [];
  }
  return (data ?? []) as PerformancePeriod[];
}

export async function listCashClosings(limit = 60): Promise<CashClosing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_closings")
    .select("*")
    .order("closing_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[reports] listCashClosings:", error.message);
    return [];
  }
  return (data ?? []) as CashClosing[];
}

export async function getReportSettings(): Promise<ReportSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_settings").select("*").maybeSingle();
  if (error) {
    console.error("[reports] getReportSettings:", error.message);
    return null;
  }
  return (data as ReportSettings | null) ?? null;
}
