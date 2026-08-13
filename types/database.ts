/**
 * Hand-written database typing for the Supabase client.
 *
 * Covers the tables that exist today (Phase 1 auth + Phase 2 catalog). Future
 * phases extend this file, or it can be regenerated with
 * `supabase gen types typescript`.
 */

import type { AuditLog, UserProfile } from "./auth";
import type {
  AppConfig,
  AppNotification,
  AuditLogRow as SettingsAuditLogRow,
  DataStatistics,
  IntegrityCheck,
  ReconciliationLine,
  RolePermissionRow,
  StoreSettings,
  SystemSetting,
} from "./settings";
import type {
  Customer,
  CustomerBalance,
  CustomerBalanceTransaction,
  CustomerLedgerRow,
  CustomerListRow,
  Sale,
  SaleItem,
  SaleListRow,
  SalePayment,
  SalesSummary,
  TopCustomerRow,
  TopProductRow,
} from "./sales";
import type {
  Purchase,
  PurchaseItem,
  PurchaseListRow,
  PurchasePayment,
  SupplierBalance,
  SupplierBalanceTransaction,
  SupplierLedgerRow,
} from "./purchasing";
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
  ProfitDimensionRow,
  ProfitReport,
  PurchaseReport,
  ReportSettings,
  SalesReport,
  SalesSeriesPoint,
  StockAlertRow,
  SupplierPerformanceRow,
} from "./reports";
import type {
  AccountBalance,
  AccountLedgerRow,
  DailyCashSummary,
  Expense,
  ExpenseCategory,
  ExpenseReportRow,
  ExpenseRow,
  FinanceSeriesPoint,
  FinanceSummary,
  FinancialAccount,
  FinancialAdjustment,
  FinancialTransaction,
  FinancialTransactionRow,
  FinancialTransfer,
  PayableRow,
  PaymentMethodBreakdownRow,
  ReceivableRow,
} from "./finance";
import type {
  AdjustmentRow,
  DamagedStockRow,
  Exchange,
  ExchangeItem,
  ExchangeRow,
  InventoryAdjustment,
  InventoryAdjustmentItem,
  ReturnableSaleItem,
  ReturnRefund,
  ReturnRow,
  ReturnsSummary,
  SalesReturn,
  SalesReturnItem,
} from "./returns";
import type {
  Category,
  InventoryRow,
  InventorySummary,
  InventoryTransaction,
  Product,
  ProductImage,
  ProductListRow,
  ProductVariant,
  Supplier,
} from "./catalog";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Shape supabase-js uses to resolve `select("*, other(...)")` embeds. */
type Relationship<
  Name extends string,
  Column extends string,
  Target extends string,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

/**
 * Row + Insert + Update triple for a table whose PK and timestamps default.
 *
 * `Rels` must list the real foreign keys — without them supabase-js cannot
 * type an embedded select and every join degrades to `SelectQueryError`.
 */
type Table<
  Row,
  Generated extends keyof Row,
  Rels extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Omit<Row, Generated> & Partial<Pick<Row, Generated>>;
  Update: Partial<Omit<Row, "id">>;
  Relationships: Rels;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, "created_at" | "updated_at"> &
          Partial<Pick<UserProfile, "created_at" | "updated_at">>;
        Update: Partial<Omit<UserProfile, "id">>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, "id" | "created_at"> &
          Partial<Pick<AuditLog, "id" | "created_at">>;
        Update: Partial<Omit<AuditLog, "id">>;
        Relationships: [];
      };
      categories: Table<Category, "id" | "created_at" | "updated_at">;
      suppliers: Table<Supplier, "id" | "created_at" | "updated_at">;
      products: Table<
        Product,
        "id" | "created_at" | "updated_at",
        [
          Relationship<
            "products_category_id_fkey",
            "category_id",
            "categories"
          >,
        ]
      >;
      product_variants: Table<
        ProductVariant,
        "id" | "created_at" | "updated_at",
        [
          Relationship<
            "product_variants_product_id_fkey",
            "product_id",
            "products"
          >,
          Relationship<
            "product_variants_supplier_id_fkey",
            "supplier_id",
            "suppliers"
          >,
        ]
      >;
      product_images: Table<
        ProductImage,
        "id" | "created_at",
        [
          Relationship<
            "product_images_product_id_fkey",
            "product_id",
            "products"
          >,
          Relationship<
            "product_images_variant_id_fkey",
            "variant_id",
            "product_variants"
          >,
        ]
      >;
      purchases: Table<
        Purchase,
        "id" | "purchase_number" | "created_at" | "updated_at",
        [
          Relationship<
            "purchases_supplier_id_fkey",
            "supplier_id",
            "suppliers"
          >,
        ]
      >;
      purchase_items: Table<
        PurchaseItem,
        "id" | "created_at",
        [
          Relationship<
            "purchase_items_purchase_id_fkey",
            "purchase_id",
            "purchases"
          >,
          Relationship<
            "purchase_items_variant_id_fkey",
            "variant_id",
            "product_variants"
          >,
        ]
      >;
      purchase_payments: Table<
        PurchasePayment,
        "id" | "created_at",
        [
          Relationship<
            "purchase_payments_purchase_id_fkey",
            "purchase_id",
            "purchases"
          >,
        ]
      >;
      supplier_balance_transactions: {
        Row: SupplierBalanceTransaction;
        // signed_amount is generated — never written by the client.
        Insert: Omit<
          SupplierBalanceTransaction,
          "id" | "created_at" | "signed_amount"
        > &
          Partial<Pick<SupplierBalanceTransaction, "id" | "created_at">>;
        Update: never;
        Relationships: [];
      };
      customers: Table<
        Customer,
        "id" | "customer_number" | "created_at" | "updated_at"
      >;
      sales: Table<
        Sale,
        "id" | "sale_number" | "created_at" | "updated_at",
        [Relationship<"sales_customer_id_fkey", "customer_id", "customers">]
      >;
      sale_items: Table<
        SaleItem,
        "id" | "created_at",
        [
          Relationship<"sale_items_sale_id_fkey", "sale_id", "sales">,
          Relationship<"sale_items_variant_id_fkey", "variant_id", "product_variants">,
        ]
      >;
      sale_payments: Table<
        SalePayment,
        "id" | "created_at",
        [Relationship<"sale_payments_sale_id_fkey", "sale_id", "sales">]
      >;
      customer_balance_transactions: {
        Row: CustomerBalanceTransaction;
        Insert: Omit<
          CustomerBalanceTransaction,
          "id" | "created_at" | "signed_amount"
        > &
          Partial<Pick<CustomerBalanceTransaction, "id" | "created_at">>;
        Update: never;
        Relationships: [];
      };
      sales_returns: Table<
        SalesReturn,
        "id" | "return_number" | "created_at" | "updated_at",
        [
          Relationship<"sales_returns_sale_id_fkey", "sale_id", "sales">,
          Relationship<"sales_returns_customer_id_fkey", "customer_id", "customers">,
        ]
      >;
      sales_return_items: Table<
        SalesReturnItem,
        "id" | "created_at",
        [
          Relationship<"sales_return_items_return_id_fkey", "return_id", "sales_returns">,
          Relationship<"sales_return_items_sale_item_id_fkey", "sale_item_id", "sale_items">,
          Relationship<"sales_return_items_variant_id_fkey", "variant_id", "product_variants">,
        ]
      >;
      return_refunds: Table<
        ReturnRefund,
        "id" | "created_at",
        [Relationship<"return_refunds_return_id_fkey", "return_id", "sales_returns">]
      >;
      exchanges: Table<
        Exchange,
        "id" | "exchange_number" | "created_at" | "updated_at",
        [
          Relationship<"exchanges_sale_id_fkey", "sale_id", "sales">,
          Relationship<"exchanges_customer_id_fkey", "customer_id", "customers">,
        ]
      >;
      exchange_items: Table<
        ExchangeItem,
        "id" | "created_at",
        [
          Relationship<"exchange_items_exchange_id_fkey", "exchange_id", "exchanges">,
          Relationship<"exchange_items_variant_id_fkey", "variant_id", "product_variants">,
        ]
      >;
      inventory_adjustments: Table<
        InventoryAdjustment,
        "id" | "adjustment_number" | "created_at" | "updated_at",
        []
      >;
      inventory_adjustment_items: Table<
        InventoryAdjustmentItem,
        "id" | "created_at",
        [
          Relationship<
            "inventory_adjustment_items_adjustment_id_fkey",
            "adjustment_id",
            "inventory_adjustments"
          >,
          Relationship<
            "inventory_adjustment_items_variant_id_fkey",
            "variant_id",
            "product_variants"
          >,
        ]
      >;
      cash_closings: Table<
        CashClosing,
        "id" | "closing_number" | "closed_at",
        [
          Relationship<
            "cash_closings_financial_account_id_fkey",
            "financial_account_id",
            "financial_accounts"
          >,
        ]
      >;
      report_settings: {
        Row: ReportSettings;
        Insert: Partial<ReportSettings>;
        Update: Partial<Omit<ReportSettings, "id">>;
        Relationships: [];
      };

      // ---- Phase 8: settings and system management -------------------------
      // Every one of these is written through a SECURITY DEFINER function, so
      // Insert/Update are `never`: there is no direct write path to offer.
      store_settings: {
        Row: StoreSettings;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      system_settings: {
        Row: SystemSetting;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      app_config: {
        Row: AppConfig;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      financial_accounts: Table<
        FinancialAccount,
        "id" | "account_number" | "created_at" | "updated_at",
        []
      >;
      financial_transactions: {
        Row: FinancialTransaction;
        // signed_amount is generated; the table is append-only by trigger.
        Insert: Omit<FinancialTransaction, "id" | "created_at" | "signed_amount"> &
          Partial<Pick<FinancialTransaction, "id" | "created_at">>;
        Update: never;
        Relationships: [
          Relationship<
            "financial_transactions_financial_account_id_fkey",
            "financial_account_id",
            "financial_accounts"
          >,
        ];
      };
      expense_categories: Table<ExpenseCategory, "id" | "created_at" | "updated_at", []>;
      expenses: Table<
        Expense,
        "id" | "expense_number" | "created_at" | "updated_at",
        [
          Relationship<"expenses_expense_category_id_fkey", "expense_category_id", "expense_categories">,
          Relationship<"expenses_financial_account_id_fkey", "financial_account_id", "financial_accounts">,
        ]
      >;
      financial_transfers: Table<
        FinancialTransfer,
        "id" | "transfer_number" | "created_at",
        [
          Relationship<"financial_transfers_from_account_id_fkey", "from_account_id", "financial_accounts">,
          Relationship<"financial_transfers_to_account_id_fkey", "to_account_id", "financial_accounts">,
        ]
      >;
      financial_adjustments: Table<
        FinancialAdjustment,
        "id" | "adjustment_number" | "created_at",
        [
          Relationship<
            "financial_adjustments_financial_account_id_fkey",
            "financial_account_id",
            "financial_accounts"
          >,
        ]
      >;
      inventory_transactions: {
        Row: InventoryTransaction;
        // signed_quantity is a generated column — never written by the client.
        Insert: Omit<
          InventoryTransaction,
          "id" | "created_at" | "signed_quantity"
        > &
          Partial<Pick<InventoryTransaction, "id" | "created_at">>;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      variant_stock: {
        Row: {
          variant_id: string;
          product_id: string;
          /** Sellable stock. Damaged units are reported separately. */
          current_stock: number;
          available_quantity: number;
          damaged_quantity: number;
        };
        Relationships: [];
      };
      product_overview: {
        Row: {
          product_id: string;
          variants_count: number;
          total_stock: number;
          damaged_stock: number;
          min_selling_price: number | null;
          stock_value: number;
        };
        Relationships: [];
      };
      supplier_balance: {
        Row: SupplierBalance;
        Relationships: [];
      };
      purchase_overview: {
        Row: {
          purchase_id: string;
          item_count: number;
          total_quantity: number;
        };
        Relationships: [];
      };
      customer_balance: {
        Row: CustomerBalance;
        Relationships: [];
      };
      sale_overview: {
        Row: {
          sale_id: string;
          item_count: number;
          total_quantity: number;
          gross_profit: number;
          gross_margin: number;
        };
        Relationships: [];
      };
      customer_overview: {
        Row: {
          customer_id: string;
          sales_count: number;
          total_purchases: number;
          last_sale_date: string | null;
        };
        Relationships: [];
      };
      sale_item_returns: {
        Row: {
          sale_item_id: string;
          sale_id: string;
          variant_id: string;
          sold_quantity: number;
          returned_quantity: number;
          returnable_quantity: number;
        };
        Relationships: [];
      };
      return_overview: {
        Row: {
          return_id: string;
          item_count: number;
          total_quantity: number;
          profit_reversal: number;
        };
        Relationships: [];
      };
      exchange_overview: {
        Row: {
          exchange_id: string;
          returned_quantity: number;
          new_quantity: number;
          profit_delta: number;
        };
        Relationships: [];
      };
      adjustment_overview: {
        Row: {
          adjustment_id: string;
          item_count: number;
          increase_quantity: number;
          decrease_quantity: number;
        };
        Relationships: [];
      };
      product_performance: {
        Row: {
          variant_id: string;
          product_id: string;
          product_name: string;
          sku: string;
          color: string | null;
          size: string | null;
          brand: string | null;
          category_id: string | null;
          category_name: string | null;
          supplier_id: string | null;
          purchase_price: number;
          selling_price: number;
          minimum_stock: number;
          sold_quantity: number;
          returned_quantity: number;
          net_quantity: number;
          gross_revenue: number;
          returned_value: number;
          net_revenue: number;
          net_cost: number;
          gross_profit: number;
          last_sale_date: string | null;
          last_purchase_date: string | null;
        };
        Relationships: [];
      };
      inventory_valuation: {
        Row: {
          variant_id: string;
          product_id: string;
          product_name: string;
          sku: string;
          color: string | null;
          size: string | null;
          brand: string | null;
          category_id: string | null;
          category_name: string | null;
          supplier_id: string | null;
          supplier_name: string | null;
          is_active: boolean;
          minimum_stock: number;
          current_stock: number;
          damaged_quantity: number;
          purchase_price: number;
          selling_price: number;
          stock_cost: number;
          stock_retail: number;
          potential_profit: number;
        };
        Relationships: [];
      };
      customer_performance: {
        Row: CustomerPerformanceRow;
        Relationships: [];
      };
      supplier_performance: {
        Row: SupplierPerformanceRow;
        Relationships: [];
      };
      account_balances: {
        Row: AccountBalance;
        Relationships: [];
      };
      customer_receivables: {
        Row: ReceivableRow;
        Relationships: [];
      };
      supplier_payables: {
        Row: PayableRow;
        Relationships: [];
      };
      sale_net_overview: {
        Row: {
          sale_id: string;
          gross_amount: number;
          returned_amount: number;
          net_amount: number;
          net_cost: number;
          net_profit: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      search_products: {
        Args: {
          p_search?: string | null;
          p_category_id?: string | null;
          p_brand?: string | null;
          p_status?: string;
          p_stock_status?: string;
          p_min_price?: number | null;
          p_max_price?: number | null;
          p_sort?: string;
          p_low_stock_threshold?: number;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ProductListRow[];
      };
      search_inventory: {
        Args: {
          p_search?: string | null;
          p_category_id?: string | null;
          p_supplier_id?: string | null;
          p_color?: string | null;
          p_size?: string | null;
          p_stock_status?: string;
          p_low_stock_threshold?: number;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: InventoryRow[];
      };
      inventory_summary: {
        Args: { p_low_stock_threshold?: number };
        Returns: InventorySummary[];
      };
      create_product_with_variants: {
        Args: { p_product: Json; p_variants: Json };
        Returns: string;
      };
      create_variant_with_stock: {
        Args: { p_variant: Json };
        Returns: string;
      };
      search_purchases: {
        Args: {
          p_search?: string | null;
          p_supplier_id?: string | null;
          p_payment_status?: string;
          p_status?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_min_amount?: number | null;
          p_max_amount?: number | null;
          p_payment_method?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: PurchaseListRow[];
      };
      supplier_ledger: {
        Args: { p_supplier_id: string; p_limit?: number };
        Returns: SupplierLedgerRow[];
      };
      create_purchase: {
        Args: { p_payload: Json };
        Returns: Json;
      };
      add_purchase_payment: {
        Args: { p_payload: Json };
        Returns: Json;
      };
      cancel_purchase: {
        Args: { p_purchase_id: string; p_reason?: string | null };
        Returns: Json;
      };
      complete_purchase: {
        Args: { p_payload: Json };
        Returns: Json;
      };
      delete_draft_purchase: {
        Args: { p_purchase_id: string };
        Returns: Json;
      };
      search_customers: {
        Args: {
          p_search?: string | null;
          p_status?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: CustomerListRow[];
      };
      search_sales: {
        Args: {
          p_search?: string | null;
          p_customer_id?: string | null;
          p_payment_status?: string;
          p_status?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_min_amount?: number | null;
          p_max_amount?: number | null;
          p_payment_method?: string;
          p_category_id?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: SaleListRow[];
      };
      sales_summary: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: SalesSummary[];
      };
      top_selling_products: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
        };
        Returns: TopProductRow[];
      };
      top_customers: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
        };
        Returns: TopCustomerRow[];
      };
      customer_ledger: {
        Args: { p_customer_id: string; p_limit?: number };
        Returns: CustomerLedgerRow[];
      };
      create_sale: { Args: { p_payload: Json }; Returns: Json };
      complete_sale: { Args: { p_payload: Json }; Returns: Json };
      add_sale_payment: { Args: { p_payload: Json }; Returns: Json };
      cancel_sale: {
        Args: { p_sale_id: string; p_reason?: string | null };
        Returns: Json;
      };
      delete_draft_sale: { Args: { p_sale_id: string }; Returns: Json };
      create_customer: { Args: { p_payload: Json }; Returns: Json };

      sale_returnable_items: {
        Args: { p_sale_id: string };
        Returns: ReturnableSaleItem[];
      };
      search_returns: {
        Args: {
          p_search?: string | null;
          p_customer_id?: string | null;
          p_status?: string;
          p_refund_status?: string;
          p_reason?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ReturnRow[];
      };
      search_exchanges: {
        Args: {
          p_search?: string | null;
          p_customer_id?: string | null;
          p_status?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ExchangeRow[];
      };
      search_adjustments: {
        Args: {
          p_search?: string | null;
          p_reason?: string;
          p_status?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: AdjustmentRow[];
      };
      returns_summary: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: ReturnsSummary[];
      };
      damaged_stock: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: DamagedStockRow[];
      };
      create_sales_return: { Args: { p_payload: Json }; Returns: Json };
      add_return_refund: { Args: { p_payload: Json }; Returns: Json };
      cancel_sales_return: {
        Args: { p_return_id: string; p_reason?: string | null };
        Returns: Json;
      };
      create_exchange: { Args: { p_payload: Json }; Returns: Json };
      cancel_exchange: {
        Args: { p_exchange_id: string; p_reason?: string | null };
        Returns: Json;
      };
      create_inventory_adjustment: { Args: { p_payload: Json }; Returns: Json };
      cancel_inventory_adjustment: {
        Args: { p_adjustment_id: string; p_reason?: string | null };
        Returns: Json;
      };
      record_stock_damage: { Args: { p_payload: Json }; Returns: Json };

      finance_summary: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: FinanceSummary[];
      };
      search_expenses: {
        Args: {
          p_search?: string | null;
          p_category?: string | null;
          p_method?: string;
          p_account?: string | null;
          p_status?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_min_amount?: number | null;
          p_max_amount?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ExpenseRow[];
      };
      search_financial_transactions: {
        Args: {
          p_search?: string | null;
          p_account?: string | null;
          p_type?: string;
          p_direction?: string;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: FinancialTransactionRow[];
      };
      account_ledger: {
        Args: { p_account_id: string; p_limit?: number };
        Returns: AccountLedgerRow[];
      };
      expense_report: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: ExpenseReportRow[];
      };
      payment_method_breakdown: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: PaymentMethodBreakdownRow[];
      };
      finance_series: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_bucket?: string;
        };
        Returns: FinanceSeriesPoint[];
      };
      daily_cash_summary: {
        Args: { p_date?: string };
        Returns: DailyCashSummary[];
      };
      create_financial_account: { Args: { p_payload: Json }; Returns: Json };
      update_financial_account: { Args: { p_payload: Json }; Returns: Json };
      create_expense: { Args: { p_payload: Json }; Returns: Json };
      cancel_expense: {
        Args: { p_expense_id: string; p_reason?: string | null };
        Returns: Json;
      };
      create_financial_transfer: { Args: { p_payload: Json }; Returns: Json };
      create_financial_adjustment: { Args: { p_payload: Json }; Returns: Json };
      backfill_financial_transactions: { Args: Record<string, never>; Returns: Json };

      get_sales_report: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_customer?: string | null;
          p_category?: string | null;
          p_method?: string;
        };
        Returns: SalesReport[];
      };
      get_sales_series: {
        Args: { p_date_from?: string | null; p_date_to?: string | null; p_bucket?: string };
        Returns: SalesSeriesPoint[];
      };
      get_purchase_report: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_supplier?: string | null;
        };
        Returns: PurchaseReport[];
      };
      get_profit_report: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: ProfitReport[];
      };
      get_profit_by_dimension: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_dimension?: string;
          p_limit?: number;
        };
        Returns: ProfitDimensionRow[];
      };
      get_product_report: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_category?: string | null;
          p_brand?: string | null;
          p_supplier?: string | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ProductReportRow[];
      };
      get_stock_alert_report: {
        Args: {
          p_mode?: string;
          p_category?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: StockAlertRow[];
      };
      get_inventory_value_report: {
        Args: Record<string, never>;
        Returns: InventoryValueReport[];
      };
      get_inventory_movement_report: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_variant?: string | null;
          p_type?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: InventoryMovementRow[];
      };
      get_management_kpis: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: ManagementKpis[];
      };
      get_period_comparison: {
        Args: { p_date_from?: string | null; p_date_to?: string | null };
        Returns: ComparisonRow[];
      };
      get_daily_closing_summary: {
        Args: { p_date?: string };
        Returns: DailyClosingSummary[];
      };
      get_monthly_performance: {
        Args: { p_year?: number | null };
        Returns: PerformancePeriod[];
      };
      get_yearly_performance: {
        Args: { p_years?: number };
        Returns: PerformancePeriod[];
      };
      get_management_alerts: {
        Args: Record<string, never>;
        Returns: ManagementAlert[];
      };
      create_cash_closing: { Args: { p_payload: Json }; Returns: Json };
      update_report_settings: { Args: { p_payload: Json }; Returns: Json };

      // ---- Phase 8 ---------------------------------------------------------
      my_permissions: { Args: Record<string, never>; Returns: string[] };
      has_permission: { Args: { p_permission: string }; Returns: boolean };
      role_has_permission: {
        Args: { p_role: string; p_permission: string };
        Returns: boolean;
      };
      set_role_permission: {
        Args: { p_role: string; p_permission: string; p_allowed: boolean };
        Returns: Json;
      };
      get_setting: { Args: { p_key: string }; Returns: Json };
      get_settings_by_category: {
        Args: { p_category: string };
        Returns: SystemSetting[];
      };
      update_setting: { Args: { p_key: string; p_value: Json }; Returns: Json };
      update_store_settings: { Args: { p_payload: Json }; Returns: Json };
      can_manage_settings: { Args: Record<string, never>; Returns: boolean };
      can_manage_users: { Args: Record<string, never>; Returns: boolean };
      can_view_audit_log: { Args: Record<string, never>; Returns: boolean };

      // ---- Phase 9: idempotency -------------------------------------------
      idempotent: { Args: { p_operation: string; p_payload: Json }; Returns: Json };
      integrity_checks: { Args: Record<string, never>; Returns: IntegrityCheck[] };
      record_system_event: {
        Args: {
          p_severity: string; p_category: string; p_operation: string;
          p_message: string; p_code?: string | null; p_request_id?: string | null;
          p_metadata?: Json | null;
        };
        Returns: undefined;
      };
      system_event_summary: {
        Args: { p_hours?: number };
        Returns: {
          severity: string; category: string;
          event_count: number; latest_at: string;
        }[];
      };
      record_backup_verified: { Args: { p_payload: Json }; Returns: Json };
      reconciliation_summary: {
        Args: Record<string, never>;
        Returns: ReconciliationLine[];
      };
      idempotency_claim: {
        Args: { p_key: string; p_operation: string };
        Returns: Json;
      };

      // ---- Phase 8, migration 0016 ----------------------------------------
      generate_notifications: { Args: Record<string, never>; Returns: number };
      mark_notification_read: { Args: { p_id: string }; Returns: Json };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: number };
      unread_notification_count: { Args: Record<string, never>; Returns: number };
      get_data_statistics: { Args: Record<string, never>; Returns: DataStatistics[] };
      search_audit_logs: {
        Args: {
          p_search?: string | null;
          p_action?: string | null;
          p_entity?: string | null;
          p_user?: string | null;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: (SettingsAuditLogRow & { total_count: number })[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience aliases used across the app. */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type AuditLogInsert =
  Database["public"]["Tables"]["audit_logs"]["Insert"];
