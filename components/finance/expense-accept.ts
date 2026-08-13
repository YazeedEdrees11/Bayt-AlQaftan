/**
 * File-input `accept` list for expense receipts.
 *
 * Its own module because the canonical list lives in `lib/finance/receipts.ts`,
 * which is server-only — importing it from a Client Component would drag
 * `server-only` into the browser bundle.
 */
export const EXPENSE_RECEIPT_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
