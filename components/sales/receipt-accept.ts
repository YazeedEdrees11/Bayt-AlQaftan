/**
 * File-input `accept` list for customer payment receipts.
 *
 * Kept in its own module because the canonical list lives in
 * `lib/sales/receipts.ts`, which is server-only — importing it from a Client
 * Component would drag `server-only` into the browser bundle.
 */
export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
