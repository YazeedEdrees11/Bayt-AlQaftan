/**
 * Finance (Phase 6).
 *
 * The distinction that governs everything here: **revenue is not cash**.
 * A sale of 100 with 60 collected is 100 of revenue, 60 of cash and 40 of
 * receivable. `financial_transactions` records only the 60 — the movement of
 * real money — and always points back at the record that caused it. Sales,
 * purchases, refunds and expenses stay where they were; nothing is duplicated.
 */

/* -------------------------------------------------------------------------- */
/*                                  Accounts                                  */
/* -------------------------------------------------------------------------- */

export const FINANCIAL_ACCOUNT_TYPES = ["CASH", "BANK"] as const;
export type FinancialAccountType = (typeof FINANCIAL_ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
  CASH: "صندوق",
  BANK: "بنك",
};

export type FinancialAccount = {
  id: string;
  account_number: string;
  name: string;
  account_type: FinancialAccountType;
  payment_method: string | null;
  opening_balance: number;
  /** Cached. `account_balances` is the authority. */
  current_balance: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Derived from the ledger — the figure the app trusts. */
export type AccountBalance = {
  account_id: string;
  account_number: string;
  name: string;
  account_type: FinancialAccountType;
  opening_balance: number;
  is_active: boolean;
  is_default: boolean;
  total_in: number;
  total_out: number;
  balance: number;
};

/* -------------------------------------------------------------------------- */
/*                             Financial ledger                               */
/* -------------------------------------------------------------------------- */

export const FINANCIAL_TRANSACTION_TYPES = [
  "SALE_PAYMENT",
  "CUSTOMER_PAYMENT",
  "PURCHASE_PAYMENT",
  "SUPPLIER_PAYMENT",
  "SALE_REFUND",
  "CUSTOMER_REFUND",
  "REFUND_REVERSAL",
  "EXPENSE",
  "EXPENSE_REVERSAL",
  "OPENING_BALANCE",
  "ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;
export type FinancialTransactionType = (typeof FINANCIAL_TRANSACTION_TYPES)[number];

export const FINANCIAL_DIRECTIONS = ["IN", "OUT"] as const;
export type FinancialTransactionDirection = (typeof FINANCIAL_DIRECTIONS)[number];

export const TRANSACTION_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  SALE_PAYMENT: "دفعة بيع",
  CUSTOMER_PAYMENT: "دفعة عميل",
  PURCHASE_PAYMENT: "دفعة شراء",
  SUPPLIER_PAYMENT: "دفعة مورد",
  SALE_REFUND: "مرتجع بيع",
  CUSTOMER_REFUND: "استرداد عميل",
  REFUND_REVERSAL: "عكس استرداد",
  EXPENSE: "مصروف",
  EXPENSE_REVERSAL: "إلغاء مصروف",
  OPENING_BALANCE: "رصيد افتتاحي",
  ADJUSTMENT: "تعديل مالي",
  TRANSFER_IN: "تحويل وارد",
  TRANSFER_OUT: "تحويل صادر",
};

export const DIRECTION_LABELS: Record<FinancialTransactionDirection, string> = {
  IN: "وارد",
  OUT: "صادر",
};

/**
 * Movements that are not business income or spending: shifting money between
 * your own accounts, and declaring what an account already held. Excluded from
 * cash-flow and profit so the figures mean what they say (§35, §46).
 */
export const NON_OPERATIONAL_TYPES: readonly FinancialTransactionType[] = [
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "OPENING_BALANCE",
];

export type FinancialTransaction = {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: FinancialTransactionType;
  financial_account_id: string;
  amount: number;
  direction: FinancialTransactionDirection;
  signed_amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type FinancialTransactionRow = {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: FinancialTransactionType;
  account_id: string;
  account_name: string;
  account_type: FinancialAccountType;
  amount: number;
  direction: FinancialTransactionDirection;
  signed_amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_by_name: string | null;
  created_at: string;
  total_count: number;
};

export type AccountLedgerRow = {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: FinancialTransactionType;
  description: string | null;
  money_in: number;
  money_out: number;
  running_balance: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                  Expenses                                  */
/* -------------------------------------------------------------------------- */

export const EXPENSE_STATUSES = ["COMPLETED", "CANCELLED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
};

export const EXPENSE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const EXPENSE_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  expense_number: string;
  expense_category_id: string;
  amount: number;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  financial_account_id: string;
  description: string | null;
  receipt_image_path: string | null;
  status: ExpenseStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseRow = {
  id: string;
  expense_number: string;
  expense_date: string;
  category_id: string;
  category_name: string;
  amount: number;
  payment_method: ExpensePaymentMethod;
  account_id: string;
  account_name: string;
  description: string | null;
  status: ExpenseStatus;
  created_by_name: string | null;
  created_at: string;
  total_count: number;
};

export type ExpenseWithDetails = Expense & {
  category_name: string;
  account_name: string;
  account_type: FinancialAccountType;
  created_by_name: string | null;
  receipt_url: string | null;
};

export type ExpenseReportRow = {
  category_id: string;
  category_name: string;
  total: number;
  entry_count: number;
  percentage: number;
};

/* -------------------------------------------------------------------------- */
/*                          Transfers and adjustments                         */
/* -------------------------------------------------------------------------- */

export type FinancialTransfer = {
  id: string;
  transfer_number: string;
  transfer_date: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type FinancialAdjustment = {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  financial_account_id: string;
  amount: number;
  direction: FinancialTransactionDirection;
  reason: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                             Reporting shapes                               */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard figures.
 *
 * Everything down to `net_cash_flow` is period-based and honours the selected
 * date range. From `cash_balance` onward the figures are point-in-time: what is
 * in the drawers and on the books right now, whatever range is on screen (§39).
 */
export type FinanceSummary = {
  gross_sales: number;
  sales_discounts: number;
  sales_returns: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  operating_expenses: number;
  operating_profit: number;
  total_purchases: number;
  purchase_payments: number;
  payments_received: number;
  payments_made: number;
  refunds_paid: number;
  cash_in: number;
  cash_out: number;
  net_cash_flow: number;
  cash_balance: number;
  bank_balance: number;
  customer_receivables: number;
  supplier_payables: number;
};

export type PaymentMethodBreakdownRow = {
  method: ExpensePaymentMethod;
  money_in: number;
  money_out: number;
  net: number;
  in_percentage: number;
};

export type FinanceSeriesPoint = {
  bucket: string;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
};

/**
 * One day's cash drawer.
 *
 * `other_in` and `other_out` are residuals — everything the named lines do not
 * explain, such as a manual adjustment. They exist so the statement balances by
 * construction: opening + inflows − outflows = closing, whatever movement kinds
 * are added later.
 */
export type DailyCashSummary = {
  opening_cash: number;
  sale_payments: number;
  customer_payments: number;
  transfers_in: number;
  other_in: number;
  purchase_payments: number;
  supplier_payments: number;
  expenses: number;
  refunds: number;
  transfers_out: number;
  other_out: number;
  closing_cash: number;
};

export type ReceivableRow = {
  customer_id: string;
  customer_number: string;
  name: string;
  phone: string | null;
  total_sales: number;
  total_paid: number;
  total_returns: number;
  total_refunded: number;
  outstanding: number;
  last_payment_date: string | null;
};

export type PayableRow = {
  supplier_id: string;
  name: string;
  phone: string | null;
  total_purchases: number;
  total_paid: number;
  outstanding: number;
  last_payment_date: string | null;
};

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/**
 * Gross profit less operating expenses.
 *
 * Kept apart from cost of goods on purpose: rent is not part of what a thobe
 * cost to buy, and folding it in would misstate the margin on every sale (§45).
 */
export function operatingProfit(grossProfit: number, expenses: number): number {
  return Math.round((Number(grossProfit) - Number(expenses)) * 100) / 100;
}

/** Margin as a percentage; zero revenue means zero margin, never a division. */
export function grossMargin(netSales: number, grossProfit: number): number {
  const sales = Number(netSales);
  if (!(sales > 0)) return 0;
  return Math.round((Number(grossProfit) / sales) * 100 * 100) / 100;
}

/** Whether a movement counts as business cash flow rather than an internal shuffle. */
export function isOperationalMovement(type: FinancialTransactionType): boolean {
  return !NON_OPERATIONAL_TYPES.includes(type);
}
