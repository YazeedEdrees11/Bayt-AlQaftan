/**
 * Purchasing, supplier-balance and payment types for Phase 3.
 *
 * Row types are type aliases (not interfaces) so they satisfy Supabase's
 * `Record<string, unknown>` constraint — see types/auth.ts.
 */

/* -------------------------------------------------------------------------- */
/*                                  Enums                                     */
/* -------------------------------------------------------------------------- */

export const PURCHASE_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The shop pays suppliers in cash or by bank transfer. Nothing else. */
export const PURCHASE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER"] as const;
export type PurchasePaymentMethod = (typeof PURCHASE_PAYMENT_METHODS)[number];

export const SUPPLIER_BALANCE_TRANSACTION_TYPES = [
  "PURCHASE",
  "PAYMENT",
  "PURCHASE_RETURN",
  "ADJUSTMENT",
] as const;
export type SupplierBalanceTransactionType =
  (typeof SUPPLIER_BALANCE_TRANSACTION_TYPES)[number];

/* -------------------------------------------------------------------------- */
/*                              Arabic labels                                 */
/* -------------------------------------------------------------------------- */

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: "مسودة",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "غير مدفوعة",
  PARTIALLY_PAID: "مدفوعة جزئياً",
  PAID: "مدفوعة",
};

export const PAYMENT_METHOD_LABELS: Record<PurchasePaymentMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
};

export const SUPPLIER_BALANCE_TYPE_LABELS: Record<
  SupplierBalanceTransactionType,
  string
> = {
  PURCHASE: "مشتريات",
  PAYMENT: "دفعة",
  PURCHASE_RETURN: "مرتجع",
  ADJUSTMENT: "تعديل",
};

/* -------------------------------------------------------------------------- */
/*                                  Rows                                      */
/* -------------------------------------------------------------------------- */

export type Purchase = {
  id: string;
  purchase_number: string;
  supplier_id: string;
  purchase_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  notes: string | null;
  status: PurchaseStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  variant_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  /** Frozen at purchase time so the document stays historically accurate. */
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  created_at: string;
};

export type PurchasePayment = {
  id: string;
  purchase_id: string;
  payment_method: PurchasePaymentMethod;
  amount: number;
  payment_date: string;
  bank_name: string | null;
  transfer_reference: string | null;
  receipt_image_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type SupplierBalanceTransaction = {
  id: string;
  supplier_id: string;
  transaction_type: SupplierBalanceTransactionType;
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

/** One row of `search_purchases()`. */
export type PurchaseListRow = {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  purchase_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  status: PurchaseStatus;
  item_count: number;
  total_quantity: number;
  created_at: string;
  total_count: number;
};

/** `supplier_balance` view. */
export type SupplierBalance = {
  supplier_id: string;
  total_purchases: number;
  total_paid: number;
  total_returns: number;
  /** > 0 owed to the supplier, < 0 credit held with them. */
  balance: number;
};

/** One row of `supplier_ledger()`, carrying its running balance. */
export type SupplierLedgerRow = {
  id: string;
  transaction_type: SupplierBalanceTransactionType;
  amount: number;
  signed_amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
  running_balance: number;
};

/** A purchase item enriched with the variant's *current* image and stock. */
export type PurchaseItemWithMedia = PurchaseItem & {
  image_url: string | null;
  current_stock: number | null;
};

/** A payment enriched with a signed receipt URL and the actor's name. */
export type PurchasePaymentWithMedia = PurchasePayment & {
  receipt_url: string | null;
  actor_name: string | null;
};

/** Everything the purchase detail page needs. */
export type PurchaseWithDetails = Purchase & {
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  items: PurchaseItemWithMedia[];
  payments: PurchasePaymentWithMedia[];
  created_by_name: string | null;
};

/** A variant as offered by the purchase line-item picker. */
export type PurchasableVariant = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  image_url: string | null;
};

/** Result returned by the `create_purchase` RPC. */
export type CreatePurchaseResult = {
  id: string;
  purchase_number: string;
  /** DRAFT when saved as a draft, COMPLETED once the goods are received. */
  status: PurchaseStatus;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  item_count: number;
};

/** Result returned by the `cancel_purchase` RPC. */
export type CancelPurchaseResult = {
  id: string;
  purchase_number: string;
  reversed_amount: number;
  paid_amount: number;
  /** Money already paid that the supplier now holds on the shop's behalf. */
  supplier_credit: number;
};
