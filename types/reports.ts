/**
 * Reporting and analytics (Phase 7).
 *
 * Reports read the existing records; nothing here shadows a sale, a purchase or
 * a movement. Where Phase 6 already defined a figure — net sales, COGS, gross
 * profit, operating profit — the reports call that definition rather than
 * restating it, so two screens cannot disagree about what the shop earned (§75).
 */

/* -------------------------------------------------------------------------- */
/*                                  Filters                                   */
/* -------------------------------------------------------------------------- */

/** Buckets a time series can be grouped into. */
export const REPORT_BUCKETS = ["day", "week", "month"] as const;
export type ReportBucket = (typeof REPORT_BUCKETS)[number];

export const BUCKET_LABELS: Record<ReportBucket, string> = {
  day: "يومي",
  week: "أسبوعي",
  month: "شهري",
};

/**
 * Picks a sensible bucket for a range so a year does not render 365 columns.
 * Callers may override; this is only the default.
 */
export function bucketForRange(from?: string, to?: string): ReportBucket {
  if (!from || !to) return "month";
  const days = Math.round(
    (Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24),
  );
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

export const STOCK_ALERT_MODES = ["LOW", "OUT", "DEAD"] as const;
export type StockAlertMode = (typeof STOCK_ALERT_MODES)[number];

export const PRODUCT_SORTS = ["quantity", "revenue", "profit", "margin"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  quantity: "الكمية المباعة",
  revenue: "صافي المبيعات",
  profit: "الربح الإجمالي",
  margin: "هامش الربح",
};

export const PROFIT_DIMENSIONS = ["product", "category", "brand"] as const;
export type ProfitDimension = (typeof PROFIT_DIMENSIONS)[number];

export const PROFIT_DIMENSION_LABELS: Record<ProfitDimension, string> = {
  product: "حسب المنتج",
  category: "حسب التصنيف",
  brand: "حسب العلامة التجارية",
};

/* -------------------------------------------------------------------------- */
/*                              Report payloads                               */
/* -------------------------------------------------------------------------- */

export type SalesReport = {
  gross_sales: number;
  discounts: number;
  returns_value: number;
  net_sales: number;
  invoice_count: number;
  units_sold: number;
  units_returned: number;
  average_order: number;
  cash_sales: number;
  bank_sales: number;
  total_collected: number;
  total_outstanding: number;
};

export type SalesSeriesPoint = {
  bucket: string;
  gross_sales: number;
  returns_value: number;
  net_sales: number;
  invoice_count: number;
};

export type PurchaseReport = {
  total_purchases: number;
  purchase_count: number;
  units_purchased: number;
  paid_to_suppliers: number;
  outstanding: number;
  purchase_returns: number;
  net_purchases: number;
};

/** Delegates to `finance_summary`, so these figures are the finance figures. */
export type ProfitReport = {
  gross_sales: number;
  discounts: number;
  returns_value: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  operating_expenses: number;
  operating_profit: number;
  operating_margin: number;
};

export type ProfitDimensionRow = {
  dimension_id: string;
  dimension_name: string;
  units_sold: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  margin: number;
};

export type ProductReportRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  category_name: string | null;
  sold_quantity: number;
  returned_quantity: number;
  net_quantity: number;
  gross_revenue: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  margin: number;
  total_count: number;
};

export type StockAlertRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  category_name: string | null;
  supplier_name: string | null;
  current_stock: number;
  minimum_stock: number;
  shortfall: number;
  stock_cost: number;
  stock_retail: number;
  last_sale_date: string | null;
  last_purchase_date: string | null;
  days_since_sale: number | null;
  total_count: number;
};

export type InventoryValueReport = {
  total_variants: number;
  total_units: number;
  damaged_units: number;
  stock_cost: number;
  stock_retail: number;
  potential_profit: number;
  potential_margin: number;
  low_stock_count: number;
  out_of_stock_count: number;
};

export type InventoryMovementRow = {
  id: string;
  moved_at: string;
  variant_id: string;
  product_name: string;
  sku: string;
  transaction_type: string;
  stock_state: string;
  quantity_in: number;
  quantity_out: number;
  signed_quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  actor_name: string | null;
  total_count: number;
};

export type CustomerPerformanceRow = {
  customer_id: string;
  customer_number: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  sales_count: number;
  total_purchased: number;
  total_paid: number;
  total_returns: number;
  outstanding: number;
  average_order_value: number;
  last_sale_date: string | null;
  last_payment_date: string | null;
};

export type SupplierPerformanceRow = {
  supplier_id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  purchase_count: number;
  total_purchases: number;
  total_paid: number;
  total_returns: number;
  outstanding: number;
  last_purchase_date: string | null;
  last_payment_date: string | null;
};

/* -------------------------------------------------------------------------- */
/*                          Management KPIs and trends                        */
/* -------------------------------------------------------------------------- */

export type ManagementKpis = {
  net_sales: number;
  gross_profit: number;
  gross_margin: number;
  operating_profit: number;
  operating_margin: number;
  order_count: number;
  units_sold: number;
  average_order_value: number;
  units_per_order: number;
  return_rate: number;
  expense_ratio: number;
  inventory_cost: number;
  /** Approximation: closing inventory stands in for average inventory (§54). */
  inventory_turnover: number;
  customer_receivables: number;
  supplier_payables: number;
  low_stock_count: number;
};

export const COMPARISON_METRICS = [
  "net_sales",
  "gross_profit",
  "operating_profit",
  "expenses",
  "orders",
  "returned_units",
] as const;
export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

export const COMPARISON_LABELS: Record<ComparisonMetric, string> = {
  net_sales: "صافي المبيعات",
  gross_profit: "الربح الإجمالي",
  operating_profit: "الربح التشغيلي",
  expenses: "المصاريف",
  orders: "عدد الفواتير",
  returned_units: "القطع المرتجعة",
};

export type ComparisonRow = {
  metric: ComparisonMetric;
  current_value: number;
  previous_value: number;
  change_value: number;
  /** Null when the previous period was zero — never Infinity (§49, §95). */
  change_percent: number | null;
};

/** Which way a metric moved. `flat` covers both no change and no comparison. */
export type TrendDirection = "up" | "down" | "flat";

export function trendOf(change: number | null | undefined): TrendDirection {
  if (change === null || change === undefined || Number(change) === 0) return "flat";
  return Number(change) > 0 ? "up" : "down";
}

/**
 * Whether a movement in this metric is good news.
 *
 * Rising sales are good; rising expenses and returns are not. Kept here so no
 * screen has to decide for itself, and so a colour is never chosen by guessing.
 */
export function isFavourable(metric: ComparisonMetric, direction: TrendDirection): boolean {
  if (direction === "flat") return true;
  const higherIsBetter = metric !== "expenses" && metric !== "returned_units";
  return higherIsBetter ? direction === "up" : direction === "down";
}

export type DailyClosingSummary = {
  closing_date: string;
  cash_opening: number;
  cash_in: number;
  cash_out: number;
  cash_closing: number;
  bank_opening: number;
  bank_in: number;
  bank_out: number;
  bank_closing: number;
  sales_total: number;
  returns_total: number;
  expenses_total: number;
  gross_profit: number;
  customer_outstanding: number;
  supplier_outstanding: number;
};

export type PerformancePeriod = {
  period_start: string;
  label: string;
  gross_sales?: number;
  net_sales: number;
  cogs?: number;
  gross_profit: number;
  expenses: number;
  operating_profit: number;
  cash_in?: number;
  cash_out?: number;
  net_cash_flow: number;
  total_purchases?: number;
};

export type CashClosing = {
  id: string;
  closing_number: string;
  closing_date: string;
  financial_account_id: string;
  expected_balance: number;
  actual_balance: number;
  difference: number;
  notes: string | null;
  status: "CLOSED" | "REOPENED";
  closed_by: string | null;
  closed_at: string;
};

export type ReportSettings = {
  id: boolean;
  dead_stock_days: number;
  high_return_rate_percent: number;
  customer_debt_threshold: number;
  supplier_debt_threshold: number;
  expense_growth_percent: number;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                   Alerts                                   */
/* -------------------------------------------------------------------------- */

export const ALERT_SEVERITIES = ["CRITICAL", "WARNING", "INFO"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type ManagementAlert = {
  alert_key: string;
  severity: AlertSeverity;
  metric: number;
  threshold: number | null;
  detail: string;
};

/** Where an alert sends you when clicked (§112). */
export const ALERT_LINKS: Record<string, string> = {
  LOW_STOCK: "/reports/inventory/low-stock",
  OUT_OF_STOCK: "/reports/inventory/out-of-stock",
  DEAD_STOCK: "/reports/inventory/dead-stock",
  CUSTOMER_DEBT: "/reports/customers/debt",
  SUPPLIER_DEBT: "/reports/suppliers/debt",
  HIGH_RETURN_RATE: "/reports/products/top",
};

export const ALERT_TITLES: Record<string, string> = {
  LOW_STOCK: "مخزون منخفض",
  OUT_OF_STOCK: "نفاد مخزون",
  DEAD_STOCK: "مخزون راكد",
  CUSTOMER_DEBT: "ذمم عملاء مرتفعة",
  SUPPLIER_DEBT: "ذمم موردين مرتفعة",
  HIGH_RETURN_RATE: "ارتفاع معدل المرتجعات",
};

/* -------------------------------------------------------------------------- */
/*                                  Exports                                   */
/* -------------------------------------------------------------------------- */

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
};

/** A column in an exported sheet. `kind` drives alignment and formatting. */
export type ExportColumn = {
  key: string;
  header: string;
  kind?: "text" | "number" | "money" | "date" | "percent";
  width?: number;
};

export type ExportRequest = {
  report: string;
  title: string;
  format: ExportFormat;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  from?: string;
  to?: string;
  filters?: Record<string, string | undefined>;
};

/**
 * A filename that survives Windows, macOS and Linux.
 *
 * Arabic is kept — it is what the shop reads — but the separators and
 * characters that break file systems or HTTP headers are removed.
 */
export function buildExportFilename(
  reportTitle: string,
  format: ExportFormat,
  date = new Date(),
): string {
  const stamp = date.toISOString().slice(0, 10);
  const safe = reportTitle
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `بيت-القفطان-${safe}-${stamp}.${format}`;
}
