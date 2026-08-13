import { PERMISSIONS } from "./permissions";
import type { Permission } from "@/types/auth";

/**
 * The permission matrix, grouped for the screen that edits it (§13, §15).
 *
 * The grouping exists so an owner can reason about a role in terms of the parts
 * of the shop rather than seventy checkboxes in a column. Every permission
 * appears in exactly one group — a permission that is missing here would be
 * invisible on the matrix screen and therefore uneditable, which is why the
 * screen reports anything `ungroupedPermissions()` finds rather than dropping it.
 */
export type PermissionGroup = {
  key: string;
  title: string;
  description: string;
  permissions: readonly Permission[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: "general",
    title: "عام",
    description: "الوصول الأساسي للنظام.",
    permissions: [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_NOTIFICATIONS],
  },
  {
    key: "products",
    title: "المنتجات",
    description: "الموديلات والتصنيفات والأسعار.",
    permissions: [
      PERMISSIONS.VIEW_PRODUCTS,
      PERMISSIONS.CREATE_PRODUCTS,
      PERMISSIONS.UPDATE_PRODUCTS,
      PERMISSIONS.DELETE_PRODUCTS,
    ],
  },
  {
    key: "inventory",
    title: "المخزون",
    description: "الأرصدة والحركات وتعديلات الجرد.",
    permissions: [
      PERMISSIONS.VIEW_INVENTORY,
      PERMISSIONS.MANAGE_INVENTORY,
      PERMISSIONS.VIEW_INVENTORY_ADJUSTMENTS,
      PERMISSIONS.CREATE_INVENTORY_ADJUSTMENTS,
      PERMISSIONS.CANCEL_INVENTORY_ADJUSTMENTS,
    ],
  },
  {
    key: "purchases",
    title: "المشتريات",
    description: "فواتير الشراء ودفعات الموردين.",
    permissions: [
      PERMISSIONS.VIEW_PURCHASES,
      PERMISSIONS.CREATE_PURCHASES,
      PERMISSIONS.UPDATE_PURCHASES,
      PERMISSIONS.CANCEL_PURCHASES,
      PERMISSIONS.VIEW_SUPPLIER_BALANCES,
      PERMISSIONS.CREATE_SUPPLIER_PAYMENTS,
    ],
  },
  {
    key: "suppliers",
    title: "الموردون",
    description: "بيانات الموردين وأرصدتهم.",
    permissions: [
      PERMISSIONS.VIEW_SUPPLIERS,
      PERMISSIONS.CREATE_SUPPLIERS,
      PERMISSIONS.UPDATE_SUPPLIERS,
      PERMISSIONS.DELETE_SUPPLIERS,
      PERMISSIONS.MANAGE_SUPPLIERS,
    ],
  },
  {
    key: "sales",
    title: "المبيعات",
    description: "الفواتير والدفعات والإلغاء.",
    permissions: [
      PERMISSIONS.VIEW_SALES,
      PERMISSIONS.CREATE_SALES,
      PERMISSIONS.UPDATE_SALES,
      PERMISSIONS.CANCEL_SALES,
      PERMISSIONS.CREATE_CUSTOMER_PAYMENTS,
      PERMISSIONS.VIEW_PROFIT,
    ],
  },
  {
    key: "customers",
    title: "العملاء",
    description: "بيانات العملاء وأرصدتهم.",
    permissions: [
      PERMISSIONS.VIEW_CUSTOMERS,
      PERMISSIONS.CREATE_CUSTOMERS,
      PERMISSIONS.UPDATE_CUSTOMERS,
      PERMISSIONS.DELETE_CUSTOMERS,
      PERMISSIONS.MANAGE_CUSTOMERS,
      PERMISSIONS.VIEW_CUSTOMER_BALANCES,
    ],
  },
  {
    key: "returns",
    title: "المرتجعات والاستبدالات",
    description: "الاسترجاع والاسترداد والاستبدال.",
    permissions: [
      PERMISSIONS.VIEW_RETURNS,
      PERMISSIONS.CREATE_RETURNS,
      PERMISSIONS.CANCEL_RETURNS,
      PERMISSIONS.CREATE_REFUNDS,
      PERMISSIONS.VIEW_RETURN_VALUES,
      PERMISSIONS.VIEW_EXCHANGES,
      PERMISSIONS.CREATE_EXCHANGES,
      PERMISSIONS.CANCEL_EXCHANGES,
    ],
  },
  {
    key: "finance",
    title: "المالية",
    description: "الصندوق والبنك والمصاريف والتحويلات.",
    permissions: [
      PERMISSIONS.VIEW_FINANCE,
      PERMISSIONS.MANAGE_FINANCE,
      PERMISSIONS.VIEW_FINANCIAL_TRANSACTIONS,
      PERMISSIONS.VIEW_ACCOUNTS,
      PERMISSIONS.CREATE_ACCOUNT,
      PERMISSIONS.UPDATE_ACCOUNT,
      PERMISSIONS.VIEW_EXPENSES,
      PERMISSIONS.CREATE_EXPENSE,
      PERMISSIONS.UPDATE_EXPENSE,
      PERMISSIONS.CANCEL_EXPENSE,
      PERMISSIONS.CREATE_TRANSFER,
      PERMISSIONS.VIEW_RECEIVABLES,
      PERMISSIONS.VIEW_PAYABLES,
      PERMISSIONS.CREATE_FINANCIAL_ADJUSTMENT,
    ],
  },
  {
    key: "reports",
    title: "التقارير",
    description: "التقارير والتحليلات والتصدير.",
    permissions: [
      PERMISSIONS.VIEW_REPORTS,
      PERMISSIONS.VIEW_PROFIT_REPORTS,
      PERMISSIONS.VIEW_SALES_REPORT,
      PERMISSIONS.VIEW_PURCHASE_REPORT,
      PERMISSIONS.VIEW_INVENTORY_REPORT,
      PERMISSIONS.VIEW_PROFIT_REPORT,
      PERMISSIONS.VIEW_EXPENSE_REPORT,
      PERMISSIONS.VIEW_CUSTOMER_REPORT,
      PERMISSIONS.VIEW_SUPPLIER_REPORT,
      PERMISSIONS.VIEW_CASH_FLOW,
      PERMISSIONS.VIEW_DAILY_CLOSING,
      PERMISSIONS.VIEW_FINANCIAL_ANALYTICS,
      PERMISSIONS.EXPORT_REPORTS,
    ],
  },
  {
    key: "system",
    title: "النظام",
    description: "المستخدمون والإعدادات وسجل النشاط.",
    permissions: [
      PERMISSIONS.MANAGE_USERS,
      PERMISSIONS.MANAGE_SETTINGS,
      PERMISSIONS.VIEW_AUDIT_LOG,
    ],
  },
];

/**
 * Every permission that appears in a group, for the completeness check the
 * matrix screen runs before rendering. A permission missing from the groups
 * would silently become uneditable, so it is better to know.
 */
export const GROUPED_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions,
);

/** Permissions defined by the application but absent from the groups above. */
export function ungroupedPermissions(all: readonly Permission[]): Permission[] {
  const grouped = new Set<Permission>(GROUPED_PERMISSIONS);
  return all.filter((permission) => !grouped.has(permission));
}
