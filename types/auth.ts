/**
 * Core authentication & authorization types for Bayt Al-Qaftan.
 *
 * Note: business-facing labels are Arabic, but every identifier in the
 * codebase (types, fields, functions) stays English.
 */

/** Roles available in the system. Mirrors the `profiles.role` CHECK constraint. */
export type UserRole = "ADMIN" | "MANAGER" | "STAFF";

/** Every permission the application knows about. */
export type Permission =
  | "VIEW_DASHBOARD"
  | "VIEW_PRODUCTS"
  | "CREATE_PRODUCTS"
  | "UPDATE_PRODUCTS"
  | "DELETE_PRODUCTS"
  | "VIEW_INVENTORY"
  | "MANAGE_INVENTORY"
  | "VIEW_SUPPLIERS"
  | "CREATE_SUPPLIERS"
  | "UPDATE_SUPPLIERS"
  | "DELETE_SUPPLIERS"
  | "MANAGE_SUPPLIERS"
  | "VIEW_PURCHASES"
  | "CREATE_PURCHASES"
  | "UPDATE_PURCHASES"
  | "CANCEL_PURCHASES"
  | "VIEW_SUPPLIER_BALANCES"
  | "CREATE_SUPPLIER_PAYMENTS"
  | "VIEW_SALES"
  | "CREATE_SALES"
  | "UPDATE_SALES"
  | "CANCEL_SALES"
  | "VIEW_CUSTOMERS"
  | "CREATE_CUSTOMERS"
  | "UPDATE_CUSTOMERS"
  | "DELETE_CUSTOMERS"
  | "MANAGE_CUSTOMERS"
  | "VIEW_CUSTOMER_BALANCES"
  | "CREATE_CUSTOMER_PAYMENTS"
  | "VIEW_PROFIT"
  | "VIEW_RETURNS"
  | "CREATE_RETURNS"
  | "CANCEL_RETURNS"
  | "CREATE_REFUNDS"
  | "VIEW_RETURN_VALUES"
  | "VIEW_EXCHANGES"
  | "CREATE_EXCHANGES"
  | "CANCEL_EXCHANGES"
  | "VIEW_INVENTORY_ADJUSTMENTS"
  | "CREATE_INVENTORY_ADJUSTMENTS"
  | "CANCEL_INVENTORY_ADJUSTMENTS"
  | "VIEW_FINANCE"
  | "MANAGE_FINANCE"
  | "VIEW_FINANCIAL_TRANSACTIONS"
  | "VIEW_ACCOUNTS"
  | "CREATE_ACCOUNT"
  | "UPDATE_ACCOUNT"
  | "VIEW_EXPENSES"
  | "CREATE_EXPENSE"
  | "UPDATE_EXPENSE"
  | "CANCEL_EXPENSE"
  | "CREATE_TRANSFER"
  | "VIEW_RECEIVABLES"
  | "VIEW_PAYABLES"
  | "CREATE_FINANCIAL_ADJUSTMENT"
  | "VIEW_REPORTS"
  | "VIEW_PROFIT_REPORTS"
  | "VIEW_SALES_REPORT"
  | "VIEW_PURCHASE_REPORT"
  | "VIEW_INVENTORY_REPORT"
  | "VIEW_PROFIT_REPORT"
  | "VIEW_EXPENSE_REPORT"
  | "VIEW_CUSTOMER_REPORT"
  | "VIEW_SUPPLIER_REPORT"
  | "VIEW_CASH_FLOW"
  | "VIEW_DAILY_CLOSING"
  | "VIEW_FINANCIAL_ANALYTICS"
  | "EXPORT_REPORTS"
  | "MANAGE_USERS"
  | "MANAGE_SETTINGS"
  | "VIEW_AUDIT_LOG"
  | "VIEW_NOTIFICATIONS";

/**
 * A row of `public.profiles`.
 *
 * Declared as a type alias rather than an interface on purpose: Supabase's
 * `Database` generic requires `Record<string, unknown>`, and only type aliases
 * get an implicit index signature.
 */
export type UserProfile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /**
   * The permissions this profile actually holds, resolved from the database
   * matrix at load time (Phase 8). Absent on profiles built outside a request —
   * `hasPermission` then falls back to the role's compiled-in defaults, which
   * are the same values the matrix was seeded with.
   */
  permissions?: readonly Permission[];
};

/** The authenticated Supabase user paired with its application profile. */
export interface AuthUser {
  id: string;
  email: string;
  profile: UserProfile;
}

/** Actions recorded in `public.audit_logs`. Extended by future modules. */
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "CHANGE_ROLE"
  | "RESET_USER_PASSWORD"
  | "ACTIVATE_USER"
  | "DEACTIVATE_USER"
  | "UPDATE_PROFILE"
  | (string & {});

/** A row of `public.audit_logs`. Type alias for the same reason as above. */
export type AuditLog = {
  id: string;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Payment methods the future finance/sales modules will support.
 * Deliberately limited: the store takes cash and bank transfers only.
 */
export type PaymentMethod = "CASH" | "BANK_TRANSFER";
