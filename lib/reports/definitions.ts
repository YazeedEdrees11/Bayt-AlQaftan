import "server-only";

import {
  getCustomerPerformance,
  getInventoryMovementReport,
  getProductReport,
  getStockAlertReport,
  getSupplierPerformance,
} from "./queries";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import type { Permission } from "@/types/auth";
import type { ExportColumn, ProductSort, StockAlertMode } from "@/types/reports";

/**
 * The registry of exportable reports.
 *
 * Each entry owns three things: the permission required to see it, the columns
 * that appear in a download, and how to fetch its rows. The export route reads
 * only from here, so a report can never be downloaded that the caller could not
 * open on screen, and no caller-supplied row data is ever trusted.
 */

export type ReportExportPayload = {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
  from?: string;
  to?: string;
  filters?: Record<string, string | undefined>;
};

type ReportDefinition = {
  title: string;
  permission: Permission;
  columns: ExportColumn[];
};

export const REPORT_EXPORTS: Record<string, ReportDefinition> = {
  products: {
    title: "تقرير المنتجات",
    permission: "VIEW_SALES_REPORT",
    columns: [
      { key: "product_name", header: "المنتج", width: 28 },
      { key: "sku", header: "SKU", width: 18 },
      { key: "color", header: "اللون", width: 12 },
      { key: "size", header: "المقاس", width: 10 },
      { key: "category_name", header: "التصنيف", width: 16 },
      { key: "brand", header: "العلامة", width: 16 },
      { key: "sold_quantity", header: "الكمية المباعة", kind: "number" },
      { key: "returned_quantity", header: "المرتجعة", kind: "number" },
      { key: "net_quantity", header: "صافي الكمية", kind: "number" },
      { key: "net_revenue", header: "صافي المبيعات", kind: "money" },
      { key: "cogs", header: "التكلفة", kind: "money" },
      { key: "gross_profit", header: "الربح الإجمالي", kind: "money" },
      { key: "margin", header: "الهامش %", kind: "percent" },
    ],
  },
  "inventory-low-stock": {
    title: "تقرير المخزون المنخفض",
    permission: "VIEW_INVENTORY_REPORT",
    columns: [
      { key: "product_name", header: "المنتج", width: 28 },
      { key: "sku", header: "SKU", width: 18 },
      { key: "color", header: "اللون", width: 12 },
      { key: "size", header: "المقاس", width: 10 },
      { key: "supplier_name", header: "المورد", width: 20 },
      { key: "current_stock", header: "المخزون الحالي", kind: "number" },
      { key: "minimum_stock", header: "الحد الأدنى", kind: "number" },
      { key: "shortfall", header: "النقص", kind: "number" },
      { key: "last_sale_date", header: "آخر بيع", kind: "date" },
      { key: "last_purchase_date", header: "آخر شراء", kind: "date" },
    ],
  },
  "inventory-out-of-stock": {
    title: "تقرير نفاد المخزون",
    permission: "VIEW_INVENTORY_REPORT",
    columns: [
      { key: "product_name", header: "المنتج", width: 28 },
      { key: "sku", header: "SKU", width: 18 },
      { key: "color", header: "اللون", width: 12 },
      { key: "size", header: "المقاس", width: 10 },
      { key: "category_name", header: "التصنيف", width: 16 },
      { key: "supplier_name", header: "المورد", width: 20 },
      { key: "last_sale_date", header: "آخر بيع", kind: "date" },
      { key: "last_purchase_date", header: "آخر شراء", kind: "date" },
    ],
  },
  "inventory-dead-stock": {
    title: "تقرير المخزون الراكد",
    permission: "VIEW_INVENTORY_REPORT",
    columns: [
      { key: "product_name", header: "المنتج", width: 28 },
      { key: "sku", header: "SKU", width: 18 },
      { key: "current_stock", header: "المخزون", kind: "number" },
      { key: "last_sale_date", header: "آخر بيع", kind: "date" },
      { key: "days_since_sale", header: "أيام منذ آخر بيع", kind: "number" },
      { key: "stock_cost", header: "تكلفة المخزون", kind: "money" },
      { key: "stock_retail", header: "القيمة البيعية", kind: "money" },
    ],
  },
  "inventory-movement": {
    title: "تقرير حركة المخزون",
    permission: "VIEW_INVENTORY_REPORT",
    columns: [
      { key: "moved_at", header: "التاريخ", kind: "date", width: 20 },
      { key: "product_name", header: "المنتج", width: 28 },
      { key: "sku", header: "SKU", width: 18 },
      { key: "transaction_type", header: "نوع الحركة", width: 18 },
      { key: "stock_state", header: "الحالة", width: 12 },
      { key: "quantity_in", header: "وارد", kind: "number" },
      { key: "quantity_out", header: "صادر", kind: "number" },
      { key: "actor_name", header: "المستخدم", width: 20 },
    ],
  },
  customers: {
    title: "تقرير العملاء",
    permission: "VIEW_CUSTOMER_REPORT",
    columns: [
      { key: "customer_number", header: "رقم العميل", width: 14 },
      { key: "name", header: "العميل", width: 26 },
      { key: "phone", header: "الهاتف", width: 16 },
      { key: "sales_count", header: "عدد الفواتير", kind: "number" },
      { key: "total_purchased", header: "إجمالي المشتريات", kind: "money" },
      { key: "total_paid", header: "المدفوع", kind: "money" },
      { key: "total_returns", header: "المرتجعات", kind: "money" },
      { key: "outstanding", header: "المستحق", kind: "money" },
      { key: "average_order_value", header: "متوسط الفاتورة", kind: "money" },
      { key: "last_sale_date", header: "آخر شراء", kind: "date" },
      { key: "last_payment_date", header: "آخر دفعة", kind: "date" },
    ],
  },
  suppliers: {
    title: "تقرير الموردين",
    permission: "VIEW_SUPPLIER_REPORT",
    columns: [
      { key: "name", header: "المورد", width: 26 },
      { key: "phone", header: "الهاتف", width: 16 },
      { key: "purchase_count", header: "عدد الفواتير", kind: "number" },
      { key: "total_purchases", header: "إجمالي المشتريات", kind: "money" },
      { key: "total_paid", header: "المدفوع", kind: "money" },
      { key: "total_returns", header: "المرتجعات", kind: "money" },
      { key: "outstanding", header: "المستحق", kind: "money" },
      { key: "last_purchase_date", header: "آخر شراء", kind: "date" },
      { key: "last_payment_date", header: "آخر دفعة", kind: "date" },
    ],
  },
};

/** Resolves the range the same way every report screen does. */
function rangeFrom(filters: Record<string, string | undefined>) {
  const preset = isDatePreset(filters.range) ? filters.range : "month";
  return resolveDateRange(preset, { from: filters.from, to: filters.to });
}

/**
 * Re-runs a report server-side for export.
 *
 * Exports are capped well above any screen page but not unbounded — an
 * unlimited download of a movement ledger would be a denial-of-service on our
 * own database.
 */
const EXPORT_LIMIT = 5000;

export async function buildReportExport(
  report: string,
  filters: Record<string, string | undefined>,
): Promise<ReportExportPayload> {
  const definition = REPORT_EXPORTS[report];
  if (!definition) throw new Error("unknown report");

  const range = rangeFrom(filters);
  const base = {
    title: definition.title,
    columns: definition.columns,
    from: range.from,
    to: range.to,
    filters,
  };

  switch (report) {
    case "products": {
      const data = await getProductReport({
        range,
        categoryId: filters.category,
        brand: filters.brand,
        supplierId: filters.supplier,
        sort: (filters.sort as ProductSort) ?? "quantity",
        page: 1,
        perPage: EXPORT_LIMIT,
      });
      return { ...base, rows: data.rows };
    }

    case "inventory-low-stock":
    case "inventory-out-of-stock":
    case "inventory-dead-stock": {
      const mode: StockAlertMode =
        report === "inventory-dead-stock"
          ? "DEAD"
          : report === "inventory-out-of-stock"
            ? "OUT"
            : "LOW";
      const data = await getStockAlertReport({
        mode,
        categoryId: filters.category,
        page: 1,
        perPage: EXPORT_LIMIT,
      });
      // Stock levels are a point-in-time picture, so a date range would only
      // mislead — the header says "all periods" rather than implying a window.
      return { ...base, from: undefined, to: undefined, rows: data.rows };
    }

    case "inventory-movement": {
      const data = await getInventoryMovementReport({
        range,
        variantId: filters.variant,
        type: filters.type ?? "ALL",
        page: 1,
        perPage: EXPORT_LIMIT,
      });
      return { ...base, rows: data.rows };
    }

    case "customers": {
      const rows = await getCustomerPerformance({
        debtOnly: filters.debtOnly === "1",
        limit: EXPORT_LIMIT,
      });
      return { ...base, from: undefined, to: undefined, rows };
    }

    case "suppliers": {
      const rows = await getSupplierPerformance({
        debtOnly: filters.debtOnly === "1",
        limit: EXPORT_LIMIT,
      });
      return { ...base, from: undefined, to: undefined, rows };
    }

    default:
      throw new Error("unknown report");
  }
}
