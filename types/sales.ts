/**
 * Customer, sale and customer-balance types for Phase 4.
 *
 * Row types are type aliases (not interfaces) so they satisfy Supabase's
 * `Record<string, unknown>` constraint — see types/auth.ts.
 */

/* -------------------------------------------------------------------------- */
/*                                  Enums                                     */
/* -------------------------------------------------------------------------- */

export const SALE_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_PAYMENT_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type SalePaymentStatus = (typeof SALE_PAYMENT_STATUSES)[number];

/** The shop takes cash and bank transfers. Nothing else. */
export const SALE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER"] as const;
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHODS)[number];

export const CUSTOMER_BALANCE_TRANSACTION_TYPES = [
  "SALE",
  "PAYMENT",
  "SALE_RETURN",
  "ADJUSTMENT",
] as const;
export type CustomerBalanceTransactionType =
  (typeof CUSTOMER_BALANCE_TRANSACTION_TYPES)[number];

/* -------------------------------------------------------------------------- */
/*                              Arabic labels                                 */
/* -------------------------------------------------------------------------- */

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  DRAFT: "مسودة",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

export const SALE_PAYMENT_STATUS_LABELS: Record<SalePaymentStatus, string> = {
  UNPAID: "غير مدفوع",
  PARTIALLY_PAID: "مدفوع جزئياً",
  PAID: "مدفوع",
};

export const SALE_PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
};

export const CUSTOMER_BALANCE_TYPE_LABELS: Record<
  CustomerBalanceTransactionType,
  string
> = {
  SALE: "بيع",
  PAYMENT: "دفعة",
  SALE_RETURN: "مرتجع",
  ADJUSTMENT: "تعديل",
};

/* -------------------------------------------------------------------------- */
/*                                  Rows                                      */
/* -------------------------------------------------------------------------- */

export type Customer = {
  id: string;
  customer_number: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  sale_number: string;
  /** NULL for a walk-in customer — no customer row is created for those. */
  customer_id: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  /** Summed item cost, frozen at sale time. */
  total_cost: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: SalePaymentStatus;
  status: SaleStatus;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  /** Cost basis captured at sale time; later purchases never rewrite it. */
  unit_cost: number;
  total_price: number;
  total_cost: number;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  created_at: string;
};

export type SalePayment = {
  id: string;
  sale_id: string;
  payment_method: SalePaymentMethod;
  amount: number;
  payment_date: string;
  bank_name: string | null;
  transfer_reference: string | null;
  receipt_image_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CustomerBalanceTransaction = {
  id: string;
  customer_id: string;
  transaction_type: CustomerBalanceTransactionType;
  amount: number;
  /** Derived in the database: amount with its direction applied. */
  signed_amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                             Query result shapes                            */
/* -------------------------------------------------------------------------- */

/** One row of `search_customers()`. */
export type CustomerListRow = {
  id: string;
  customer_number: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_active: boolean;
  sales_count: number;
  total_purchases: number;
  last_sale_date: string | null;
  created_at: string;
  total_count: number;
};

/** One row of `search_sales()`. */
export type SaleListRow = {
  id: string;
  sale_number: string;
  customer_id: string | null;
  customer_name: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  total_cost: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: SalePaymentStatus;
  status: SaleStatus;
  item_count: number;
  total_quantity: number;
  gross_profit: number;
  created_at: string;
  total_count: number;
};

/** `customer_balance` view. */
export type CustomerBalance = {
  customer_id: string;
  total_sales: number;
  total_paid: number;
  total_returns: number;
  /** > 0 owed by the customer, < 0 credit held for them. */
  balance: number;
};

/** One row of `customer_ledger()`, carrying its running balance. */
export type CustomerLedgerRow = {
  id: string;
  transaction_type: CustomerBalanceTransactionType;
  amount: number;
  signed_amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
  running_balance: number;
};

/** `sales_summary()` — the figures behind the sales dashboard cards. */
export type SalesSummary = {
  sales_count: number;
  gross_sales: number;
  total_discount: number;
  net_sales: number;
  total_cost: number;
  gross_profit: number;
  gross_margin: number;
  units_sold: number;
  total_paid: number;
  total_outstanding: number;
  cash_collected: number;
  bank_collected: number;
  /**
   * Returns for the same period (Phase 5). Reads as
   * gross − discount = net, net − returns = net after returns, and
   * (net after returns) − (cost after returns) = net profit.
   * Returned sales stay visible rather than being filtered out (§25).
   */
  returns_count: number;
  returns_value: number;
  returns_cost: number;
  units_returned: number;
  net_sales_after_returns: number;
  net_cost_after_returns: number;
  net_profit_after_returns: number;
};

export type TopProductRow = {
  variant_id: string;
  product_name: string;
  sku: string;
  units_sold: number;
  revenue: number;
  profit: number;
};

export type TopCustomerRow = {
  customer_id: string;
  customer_number: string;
  name: string;
  sales_count: number;
  total_amount: number;
};

/** A sale item enriched with the variant's current image. */
export type SaleItemWithMedia = SaleItem & {
  image_url: string | null;
  /**
   * Item profit after its proportional share of the sale-level discount, so
   * the per-line figures add up to the sale's gross profit.
   */
  net_revenue: number;
  gross_profit: number;
};

export type SalePaymentWithMedia = SalePayment & {
  receipt_url: string | null;
  actor_name: string | null;
};

/** Everything the sale detail page needs. */
export type SaleWithDetails = Sale & {
  customer: Pick<Customer, "id" | "customer_number" | "name" | "phone" | "whatsapp"> | null;
  items: SaleItemWithMedia[];
  payments: SalePaymentWithMedia[];
  created_by_name: string | null;
  gross_profit: number;
  gross_margin: number;
};

/** A variant as offered by the sale line-item picker. */
export type SellableVariant = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  selling_price: number;
  purchase_price: number;
  current_stock: number;
  image_url: string | null;
};

/** Result returned by `create_sale` / `complete_sale`. */
export type CreateSaleResult = {
  id: string;
  sale_number: string;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: SalePaymentStatus;
  item_count: number;
};

export type CancelSaleResult = {
  id: string;
  sale_number: string;
  reversed_amount: number;
  paid_amount: number;
  /** Money already collected that now sits as credit for the customer. */
  customer_credit: number;
};

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/**
 * Splits a sale-level discount across its items in proportion to line value,
 * so per-item profit sums to the sale's gross profit rather than overstating
 * revenue by the discount.
 */
export function allocateDiscount<
  T extends { total_price: number; total_cost: number },
>(items: T[], discount: number): (T & { net_revenue: number; gross_profit: number })[] {
  const subtotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);
  const round = (v: number) => Math.round(v * 100) / 100;

  return items.map((item) => {
    const share =
      subtotal > 0 ? (Number(item.total_price) / subtotal) * Number(discount) : 0;
    const netRevenue = round(Number(item.total_price) - share);
    return {
      ...item,
      net_revenue: netRevenue,
      gross_profit: round(netRevenue - Number(item.total_cost)),
    };
  });
}
