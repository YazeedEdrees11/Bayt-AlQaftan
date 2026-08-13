import "server-only";

/**
 * Refund receipts.
 *
 * A third bucket, separate from supplier and customer payment receipts: money
 * leaving the till for a return is its own flow, and keeping the evidence apart
 * is what lets the finance phase tell inflow from outflow without guessing.
 */

export const REFUND_RECEIPTS_BUCKET = "return-refund-receipts";

export const REFUND_RECEIPT_URL_TTL_SECONDS = 60 * 60;

export const MAX_REFUND_RECEIPT_BYTES = 5 * 1024 * 1024;

/** The bucket accepts images only — §67 does not list PDF for refunds. */
export const ACCEPTED_REFUND_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const ACCEPTED_REFUND_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

export const REFUND_ACCEPT_ATTRIBUTE = ACCEPTED_REFUND_MIME_TYPES.join(",");

/** `refunds/{returnOrCustomerKey}/{uuid}.{ext}` */
export function buildRefundReceiptPath(key: string, fileName: string): string {
  const extension = (fileName.split(".").pop() ?? "").toLowerCase();
  const safeExtension = (
    ACCEPTED_REFUND_EXTENSIONS as readonly string[]
  ).includes(extension)
    ? extension
    : "jpg";
  return `refunds/${key}/${crypto.randomUUID()}.${safeExtension}`;
}

export type RefundReceiptValidation = { ok: true } | { ok: false; error: string };

export function validateRefundReceipt(file: {
  size: number;
  type: string;
  name: string;
}): RefundReceiptValidation {
  if (!(ACCEPTED_REFUND_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "صيغة الإيصال غير مدعومة. الصيغ المقبولة: JPG، PNG، WEBP.",
    };
  }
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_REFUND_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: "امتداد الملف غير مدعوم." };
  }
  if (file.size <= 0) return { ok: false, error: "الملف فارغ." };
  if (file.size > MAX_REFUND_RECEIPT_BYTES) {
    const mb = Math.round(MAX_REFUND_RECEIPT_BYTES / (1024 * 1024));
    return { ok: false, error: `حجم الإيصال يجب ألا يتجاوز ${mb} ميجابايت.` };
  }
  return { ok: true };
}
