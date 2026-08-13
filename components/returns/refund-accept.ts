/**
 * File-input `accept` list for refund receipts.
 *
 * Kept in its own module because the canonical list lives in
 * `lib/returns/receipts.ts`, which is server-only — importing it from a Client
 * Component would drag `server-only` into the browser bundle.
 *
 * Images only: §67 lists JPG, JPEG, PNG and WEBP for refund receipts, unlike
 * the payment receipts which also take PDF.
 */
export const REFUND_RECEIPT_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";
