/**
 * Returns, exchanges and inventory adjustments (Phase 5).
 *
 * Money convention, so the numbers below read the same way everywhere:
 * a return's `refund_amount` is what the customer is owed for the goods —
 * the price they actually paid after the original sale's discount was shared
 * out across its lines. `refunded_amount` is how much of that has been settled.
 * Whatever is left sits on the customer's account as credit; it is never lost.
 */

/* -------------------------------------------------------------------------- */
/*                                  Returns                                   */
/* -------------------------------------------------------------------------- */

export const RETURN_STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REFUND_STATUSES = [
  "NO_REFUND",
  "REFUNDED",
  "CUSTOMER_CREDIT",
  "PARTIAL_REFUND",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_METHODS = ["CASH", "BANK_TRANSFER", "CUSTOMER_CREDIT"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const RETURN_REASONS = [
  "CUSTOMER_CHANGED_MIND",
  "WRONG_SIZE",
  "WRONG_COLOR",
  "DEFECTIVE_PRODUCT",
  "DAMAGED_PRODUCT",
  "WRONG_PRODUCT",
  "QUALITY_ISSUE",
  "OTHER",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const ITEM_CONDITIONS = ["GOOD", "DAMAGED"] as const;
export type InventoryItemCondition = (typeof ITEM_CONDITIONS)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  DRAFT: "مسودة",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  NO_REFUND: "بدون استرداد",
  REFUNDED: "تم الاسترداد",
  CUSTOMER_CREDIT: "رصيد للعميل",
  PARTIAL_REFUND: "استرداد جزئي",
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CUSTOMER_CREDIT: "رصيد للعميل",
};

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  CUSTOMER_CHANGED_MIND: "تغيير رأي العميل",
  WRONG_SIZE: "المقاس غير مناسب",
  WRONG_COLOR: "اللون غير مناسب",
  DEFECTIVE_PRODUCT: "المنتج فيه عيب",
  DAMAGED_PRODUCT: "المنتج تالف",
  WRONG_PRODUCT: "منتج غير صحيح",
  QUALITY_ISSUE: "مشكلة في الجودة",
  OTHER: "أخرى",
};

export const CONDITION_LABELS: Record<InventoryItemCondition, string> = {
  GOOD: "سليم",
  DAMAGED: "تالف",
};

export type SalesReturn = {
  id: string;
  return_number: string;
  sale_id: string;
  customer_id: string | null;
  return_date: string;
  subtotal: number;
  discount: number;
  refund_amount: number;
  refunded_amount: number;
  total_cost: number;
  status: ReturnStatus;
  refund_status: RefundStatus;
  reason: ReturnReason | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesReturnItem = {
  id: string;
  return_id: string;
  sale_item_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  /** Refundable value: unit price after the original sale's discount share. */
  total_amount: number;
  total_cost: number;
  condition: InventoryItemCondition;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  reason: string | null;
  created_at: string;
};

export type ReturnRefund = {
  id: string;
  return_id: string;
  refund_method: RefundMethod;
  amount: number;
  refund_date: string;
  bank_name: string | null;
  transfer_reference: string | null;
  receipt_image_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

/** One line of the original sale, with how much of it may still come back. */
export type ReturnableSaleItem = {
  sale_item_id: string;
  variant_id: string;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  unit_price: number;
  unit_cost: number;
  /** Unit price after the sale's discount was shared across its lines. */
  net_unit_price: number;
  sold_quantity: number;
  returned_quantity: number;
  returnable_quantity: number;
  image_path: string | null;
  image_url?: string | null;
};

export type ReturnRow = {
  id: string;
  return_number: string;
  sale_id: string;
  sale_number: string;
  customer_id: string | null;
  customer_name: string | null;
  return_date: string;
  item_count: number;
  total_quantity: number;
  refund_amount: number;
  refunded_amount: number;
  status: ReturnStatus;
  refund_status: RefundStatus;
  reason: ReturnReason | null;
  created_at: string;
  total_count: number;
};

export type ReturnWithDetails = SalesReturn & {
  sale_number: string;
  customer: { id: string; name: string; phone: string | null } | null;
  created_by_name: string | null;
  items: (SalesReturnItem & { image_url: string | null; gross_profit: number })[];
  refunds: (ReturnRefund & { receipt_url: string | null; actor_name: string | null })[];
  profit_reversal: number;
  outstanding_refund: number;
};

export type ReturnsSummary = {
  returns_count: number;
  returns_value: number;
  refunded_value: number;
  credited_value: number;
  units_returned: number;
  damaged_units: number;
  cost_returned: number;
  profit_reversal: number;
};

/* -------------------------------------------------------------------------- */
/*                                 Exchanges                                  */
/* -------------------------------------------------------------------------- */

export const EXCHANGE_DIRECTIONS = ["CUSTOMER_PAYS", "CUSTOMER_RECEIVES", "EVEN"] as const;
export type ExchangeDirection = (typeof EXCHANGE_DIRECTIONS)[number];

export const EXCHANGE_ITEM_TYPES = ["RETURNED", "NEW"] as const;
export type ExchangeItemType = (typeof EXCHANGE_ITEM_TYPES)[number];

/**
 * How the difference was settled. CUSTOMER_BALANCE means it was left on the
 * account rather than changing hands, which is why it is not a refund method.
 */
export const SETTLEMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CUSTOMER_BALANCE",
] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

export const EXCHANGE_DIRECTION_LABELS: Record<ExchangeDirection, string> = {
  CUSTOMER_PAYS: "العميل يدفع",
  CUSTOMER_RECEIVES: "العميل يستلم",
  EVEN: "بدون فرق",
};

export const EXCHANGE_ITEM_TYPE_LABELS: Record<ExchangeItemType, string> = {
  RETURNED: "مرتجع",
  NEW: "بديل",
};

export const SETTLEMENT_METHOD_LABELS: Record<SettlementMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CUSTOMER_BALANCE: "على حساب العميل",
};

export type Exchange = {
  id: string;
  exchange_number: string;
  sale_id: string;
  customer_id: string | null;
  exchange_date: string;
  returned_amount: number;
  new_items_amount: number;
  difference_amount: number;
  difference_direction: ExchangeDirection;
  settlement_method: SettlementMethod | null;
  bank_name: string | null;
  transfer_reference: string | null;
  receipt_image_path: string | null;
  /** Why the customer swapped — the same list of answers a return uses. */
  reason: ReturnReason | null;
  returned_cost: number;
  new_items_cost: number;
  status: ReturnStatus;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExchangeItem = {
  id: string;
  exchange_id: string;
  item_type: ExchangeItemType;
  sale_item_id: string | null;
  variant_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total_amount: number;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  condition: InventoryItemCondition;
  created_at: string;
};

export type ExchangeRow = {
  id: string;
  exchange_number: string;
  sale_id: string;
  sale_number: string;
  customer_id: string | null;
  customer_name: string | null;
  exchange_date: string;
  returned_amount: number;
  new_items_amount: number;
  difference_amount: number;
  difference_direction: ExchangeDirection;
  returned_quantity: number;
  new_quantity: number;
  status: ReturnStatus;
  created_at: string;
  total_count: number;
};

export type ExchangeWithDetails = Exchange & {
  sale_number: string;
  customer: { id: string; name: string; phone: string | null } | null;
  created_by_name: string | null;
  returned_items: (ExchangeItem & { image_url: string | null })[];
  new_items: (ExchangeItem & { image_url: string | null })[];
  receipt_url: string | null;
  profit_delta: number;
};

/* -------------------------------------------------------------------------- */
/*                            Inventory adjustments                           */
/* -------------------------------------------------------------------------- */

export const ADJUSTMENT_REASONS = [
  "STOCK_COUNT",
  "DAMAGED",
  "LOST",
  "FOUND",
  "DATA_CORRECTION",
  "OTHER",
] as const;
export type InventoryAdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<InventoryAdjustmentReason, string> = {
  STOCK_COUNT: "جرد المخزون",
  DAMAGED: "تالف",
  LOST: "فقدان",
  FOUND: "زيادة مكتشفة",
  DATA_CORRECTION: "تصحيح بيانات",
  OTHER: "أخرى",
};

export type InventoryAdjustment = {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason: InventoryAdjustmentReason;
  status: ReturnStatus;
  total_increase: number;
  total_decrease: number;
  items_count: number;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryAdjustmentItem = {
  id: string;
  adjustment_id: string;
  variant_id: string;
  /** Read by the server under the variant's lock, never sent by the browser. */
  system_quantity: number;
  actual_quantity: number;
  difference_quantity: number;
  product_name_snapshot: string;
  variant_sku_snapshot: string;
  color_snapshot: string | null;
  size_snapshot: string | null;
  reason: string | null;
  created_at: string;
};

export type AdjustmentRow = {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason: InventoryAdjustmentReason;
  status: ReturnStatus;
  items_count: number;
  total_increase: number;
  total_decrease: number;
  created_by_name: string | null;
  notes: string | null;
  created_at: string;
  total_count: number;
};

export type AdjustmentWithDetails = InventoryAdjustment & {
  created_by_name: string | null;
  items: (InventoryAdjustmentItem & { image_url: string | null })[];
};

export type DamagedStockRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  damaged_quantity: number;
  available_quantity: number;
  purchase_price: number;
  total_count: number;
};

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a set of chosen return lines is worth, using each line's net unit price
 * so the sale's discount is honoured. Mirrors the arithmetic in
 * `create_sales_return`; the database remains the authority.
 */
export function calculateReturnTotals(
  lines: { quantity: number; net_unit_price: number; unit_price: number; unit_cost: number }[],
): { subtotal: number; discount: number; refund: number; cost: number; profitReversal: number } {
  const round = (v: number) => Math.round(v * 100) / 100;
  const subtotal = round(
    lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0),
  );
  const refund = round(
    lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.net_unit_price), 0),
  );
  const cost = round(
    lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost), 0),
  );
  return {
    subtotal,
    discount: round(subtotal - refund),
    refund,
    cost,
    profitReversal: round(refund - cost),
  };
}

/** The difference an exchange leaves, and who owes it. */
export function calculateExchangeDifference(
  returnedTotal: number,
  newTotal: number,
): { difference: number; direction: ExchangeDirection } {
  const diff = Math.round((Number(newTotal) - Number(returnedTotal)) * 100) / 100;
  return {
    difference: Math.abs(diff),
    direction: diff > 0 ? "CUSTOMER_PAYS" : diff < 0 ? "CUSTOMER_RECEIVES" : "EVEN",
  };
}
