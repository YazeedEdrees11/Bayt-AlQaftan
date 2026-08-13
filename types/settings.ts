/**
 * Settings, store configuration and system management (Phase 8).
 *
 * The shapes below mirror `system_settings` exactly. They are not a second
 * definition of the defaults — the database holds those — but they do pin the
 * *keys*, so a screen cannot read or write a setting that does not exist and a
 * typo becomes a compile error rather than a silently ignored update.
 */

import type { SalePaymentMethod } from "./sales";

/* -------------------------------------------------------------------------- */
/*                                Store profile                               */
/* -------------------------------------------------------------------------- */

export type StoreSettings = {
  id: boolean;
  store_name: string;
  store_name_ar: string | null;
  store_name_en: string | null;
  logo_path: string | null;
  phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  currency_symbol: string;
  timezone: string;
  date_format: string;
  created_at: string;
  updated_at: string;
};

export const DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Offered in the timezone picker. Jordan first; the rest are the neighbours. */
export const TIMEZONES = [
  "Asia/Amman",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Beirut",
  "Asia/Damascus",
  "Asia/Jerusalem",
  "Africa/Cairo",
  "UTC",
] as const;

/* -------------------------------------------------------------------------- */
/*                               System settings                              */
/* -------------------------------------------------------------------------- */

export const SETTING_CATEGORIES = [
  "business", "inventory", "sales", "purchases", "returns", "exchanges",
  "finance", "reports", "notifications", "receipts", "numbering", "system",
] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  business: "الإعدادات العامة",
  inventory: "المخزون",
  sales: "المبيعات",
  purchases: "المشتريات",
  returns: "المرتجعات",
  exchanges: "الاستبدالات",
  finance: "المالية",
  reports: "التقارير",
  notifications: "التنبيهات",
  receipts: "الإيصالات",
  numbering: "الترقيم",
  system: "النظام",
};

export type SettingValueType =
  | "boolean" | "number" | "text" | "enum" | "uuid" | "prefix";

/** A row of `system_settings`, carrying the rules its value must satisfy. */
export type SystemSetting = {
  key: SettingKey;
  value: unknown;
  value_type: SettingValueType;
  category: SettingCategory;
  min_value: number | null;
  max_value: number | null;
  allowed_values: string[] | null;
  description: string | null;
  updated_at: string;
};

export const SETTING_KEYS = [
  // business
  "default_payment_method", "default_cash_account_id", "default_bank_account_id",
  "default_expense_category_id",
  // inventory
  "default_minimum_stock", "allow_negative_stock", "track_damaged_stock",
  "require_adjustment_reason", "require_adjustment_notes", "require_adjustment_approval",
  // sales
  "default_discount_percent", "allow_manual_discount", "maximum_discount_percent",
  "require_customer_for_credit", "allow_walk_in_sales", "allow_editing_completed_sale",
  "allow_sale_cancellation", "require_cancellation_reason",
  // purchases
  "allow_purchase_editing", "require_supplier", "allow_partial_receiving",
  "require_purchase_cancellation_reason", "default_purchase_payment_method",
  // returns
  "allow_returns", "require_return_reason", "require_return_condition",
  "maximum_return_days", "allow_damaged_returns", "allow_cash_refund",
  "allow_bank_refund", "allow_customer_credit_refund",
  // exchanges
  "allow_exchanges", "require_exchange_reason", "allow_customer_pays_difference",
  "allow_customer_receives_difference", "maximum_exchange_days",
  // finance
  "allow_negative_account_balance", "require_expense_category",
  "require_expense_receipt", "require_transfer_notes",
  "require_financial_adjustment_reason", "allow_financial_adjustments",
  // reports
  "default_report_range", "default_rows_per_page", "default_export_format",
  "show_profit_on_dashboard", "show_customer_debt", "show_supplier_debt",
  // notifications
  "notify_low_stock", "notify_out_of_stock", "notify_customer_debt",
  "notify_supplier_debt", "notify_high_expenses", "notify_high_return_rate",
  "notify_cash_difference", "cash_difference_threshold",
  // receipts
  "receipt_show_logo", "receipt_show_phone", "receipt_show_address",
  "receipt_show_customer_name", "receipt_show_customer_phone",
  "receipt_show_payment_method", "receipt_show_salesperson",
  "receipt_show_return_policy", "receipt_footer_ar", "return_policy_ar",
  "return_policy_en",
  // numbering
  "prefix_sale", "prefix_purchase", "prefix_return", "prefix_exchange",
  "prefix_expense", "prefix_account", "prefix_financial", "prefix_transfer",
  "prefix_closing", "prefix_adjustment", "prefix_customer",
  "prefix_financial_adjustment",
  // system
  "maintenance_mode", "locale",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** A settings screen's working copy: key → value, before saving. */
export type SettingsDraft = Partial<Record<SettingKey, unknown>>;

/* -------------------------------------------------------------------------- */
/*                          Category-shaped read models                       */
/* -------------------------------------------------------------------------- */

export type BusinessSettings = {
  default_payment_method: SalePaymentMethod;
  default_cash_account_id: string | null;
  default_bank_account_id: string | null;
  default_expense_category_id: string | null;
};

export type InventorySettings = {
  default_minimum_stock: number;
  allow_negative_stock: boolean;
  track_damaged_stock: boolean;
  require_adjustment_reason: boolean;
  require_adjustment_notes: boolean;
  require_adjustment_approval: boolean;
};

export type SalesSettings = {
  default_discount_percent: number;
  allow_manual_discount: boolean;
  maximum_discount_percent: number;
  require_customer_for_credit: boolean;
  allow_walk_in_sales: boolean;
  allow_editing_completed_sale: boolean;
  allow_sale_cancellation: boolean;
  require_cancellation_reason: boolean;
};

export type PurchaseSettings = {
  allow_purchase_editing: boolean;
  require_supplier: boolean;
  allow_partial_receiving: boolean;
  require_purchase_cancellation_reason: boolean;
  default_purchase_payment_method: SalePaymentMethod;
};

export type ReturnSettings = {
  allow_returns: boolean;
  require_return_reason: boolean;
  require_return_condition: boolean;
  maximum_return_days: number;
  allow_damaged_returns: boolean;
  allow_cash_refund: boolean;
  allow_bank_refund: boolean;
  allow_customer_credit_refund: boolean;
};

export type ExchangeSettings = {
  allow_exchanges: boolean;
  require_exchange_reason: boolean;
  allow_customer_pays_difference: boolean;
  allow_customer_receives_difference: boolean;
  maximum_exchange_days: number;
};

export type FinanceSettings = {
  allow_negative_account_balance: boolean;
  require_expense_category: boolean;
  require_expense_receipt: boolean;
  require_transfer_notes: boolean;
  require_financial_adjustment_reason: boolean;
  allow_financial_adjustments: boolean;
};

export type ReportDisplaySettings = {
  default_report_range: string;
  default_rows_per_page: number;
  default_export_format: "csv" | "xlsx";
  show_profit_on_dashboard: boolean;
  show_customer_debt: boolean;
  show_supplier_debt: boolean;
};

export type NotificationSettings = {
  notify_low_stock: boolean;
  notify_out_of_stock: boolean;
  notify_customer_debt: boolean;
  notify_supplier_debt: boolean;
  notify_high_expenses: boolean;
  notify_high_return_rate: boolean;
  notify_cash_difference: boolean;
  cash_difference_threshold: number;
};

export type ReceiptSettings = {
  receipt_show_logo: boolean;
  receipt_show_phone: boolean;
  receipt_show_address: boolean;
  receipt_show_customer_name: boolean;
  receipt_show_customer_phone: boolean;
  receipt_show_payment_method: boolean;
  receipt_show_salesperson: boolean;
  receipt_show_return_policy: boolean;
  receipt_footer_ar: string;
  return_policy_ar: string;
  return_policy_en: string;
};

export type NumberingSettings = {
  prefix_sale: string;
  prefix_purchase: string;
  prefix_return: string;
  prefix_exchange: string;
  prefix_expense: string;
  prefix_account: string;
  prefix_financial: string;
  prefix_transfer: string;
  prefix_closing: string;
  prefix_adjustment: string;
  prefix_customer: string;
  prefix_financial_adjustment: string;
};

/** Which document each numbering prefix belongs to, for the screen. */
export const NUMBERING_LABELS: Record<keyof NumberingSettings, string> = {
  prefix_sale: "فواتير المبيعات",
  prefix_purchase: "فواتير المشتريات",
  prefix_return: "المرتجعات",
  prefix_exchange: "الاستبدالات",
  prefix_expense: "المصاريف",
  prefix_account: "الحسابات المالية",
  prefix_financial: "الحركات المالية",
  prefix_transfer: "التحويلات",
  prefix_closing: "إغلاق الصندوق",
  prefix_adjustment: "تعديلات المخزون",
  prefix_customer: "العملاء",
  prefix_financial_adjustment: "التسويات المالية",
};

/* -------------------------------------------------------------------------- */
/*                                Role matrix                                 */
/* -------------------------------------------------------------------------- */

export type RolePermissionRow = {
  role: string;
  permission: string;
  allowed: boolean;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                    Users                                   */
/* -------------------------------------------------------------------------- */

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "PENDING"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "نشط",
  INACTIVE: "موقوف",
  PENDING: "بانتظار القبول",
};

/** A row of the user-management table (§8). */
export type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  status: UserStatus;
  last_activity_at: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                Notifications                               */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  INFO: "معلومة",
  WARNING: "تحذير",
  CRITICAL: "حرج",
};

export const NOTIFICATION_TYPES = [
  "INVENTORY", "FINANCE", "CUSTOMER", "SUPPLIER", "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  INVENTORY: "تنبيهات المخزون",
  FINANCE: "التنبيهات المالية",
  CUSTOMER: "تنبيهات العملاء",
  SUPPLIER: "تنبيهات الموردين",
  SYSTEM: "تنبيهات النظام",
};

export type AppNotification = {
  id: string;
  notification_key: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  reference_type: string | null;
  reference_id: string | null;
  metric: number | null;
  threshold: number | null;
  user_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                 Audit log                                  */
/* -------------------------------------------------------------------------- */

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Actions the audit screen knows how to name (§49). Others show verbatim. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN: "تسجيل دخول",
  LOGOUT: "تسجيل خروج",
  CREATE: "إنشاء",
  UPDATE: "تعديل",
  CANCEL: "إلغاء",
  REFUND: "استرداد",
  RETURN: "مرتجع",
  EXCHANGE: "استبدال",
  PAYMENT: "دفعة",
  EXPENSE: "مصروف",
  TRANSFER: "تحويل",
  ADJUSTMENT: "تسوية",
  SETTINGS_UPDATE: "تعديل إعدادات",
  USER_ROLE_CHANGE: "تغيير دور",
  CHANGE_ROLE: "تغيير دور",
  RESET_USER_PASSWORD: "تعيين كلمة مرور",
  USER_DEACTIVATED: "إيقاف مستخدم",
  DEACTIVATE_USER: "إيقاف مستخدم",
  USER_REACTIVATED: "تفعيل مستخدم",
  ACTIVATE_USER: "تفعيل مستخدم",
  CREATE_USER: "إنشاء مستخدم",
  UPDATE_USER: "تعديل مستخدم",
  UPDATE_PROFILE: "تعديل ملف شخصي",
  EXPORT: "تصدير",
  REPORT_EXPORTED: "تصدير تقرير",
  USER_INVITED: "دعوة مستخدم",
};

/* -------------------------------------------------------------------------- */
/*                              System and health                             */
/* -------------------------------------------------------------------------- */

export type AppConfig = {
  id: boolean;
  app_version: string;
  schema_version: string;
  environment: string;
  last_backup_at: string | null;
  backup_status: string | null;
  /** When a restore was last actually tested (§68). A backup nobody has
   *  restored is a belief, so readiness distinguishes the two. */
  last_restore_test_at: string | null;
  last_backup_note: string | null;
  updated_at: string;
};

export type HealthState = "healthy" | "degraded" | "down";

export type HealthCheck = {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
};

/** One row of `integrity_checks()` (§71, §72). */
export type IntegrityCheck = {
  check_key: string;
  title: string;
  severity: "OK" | "WARNING" | "CRITICAL";
  issue_count: number;
  detail: string;
  reference: string | null;
};

/** One row of `reconciliation_summary()` (§74). */
export type ReconciliationLine = {
  label: string;
  amount: number;
  reference: string | null;
};

/** A readiness area and its verdict (§155). */
export type ReadinessArea = {
  key: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
  /** A FAIL here means the system cannot be declared ready (§156). */
  critical: boolean;
};

export type SystemHealth = {
  checks: HealthCheck[];
  checkedAt: string;
};

/** Row counts for the data screen (§64). Informational only. */
export type DataStatistics = {
  products: number;
  variants: number;
  customers: number;
  suppliers: number;
  sales: number;
  purchases: number;
  returns: number;
  exchanges: number;
  expenses: number;
  financial_transactions: number;
  inventory_transactions: number;
  audit_logs: number;
};
