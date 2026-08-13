import "server-only";

/**
 * Customer payment receipts.
 *
 * Separate bucket from supplier receipts so the two money flows never mix —
 * future finance reporting needs to tell inflow from outflow.
 */

export const SALE_RECEIPTS_BUCKET = "sale-payment-receipts";

export const RECEIPT_URL_TTL_SECONDS = 60 * 60;

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ACCEPTED_RECEIPT_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
] as const;

export const RECEIPT_ACCEPT_ATTRIBUTE = ACCEPTED_RECEIPT_MIME_TYPES.join(",");

/** `sales/{saleOrCustomerKey}/{uuid}.{ext}` */
export function buildSaleReceiptPath(key: string, fileName: string): string {
  const extension = (fileName.split(".").pop() ?? "").toLowerCase();
  const safeExtension = (
    ACCEPTED_RECEIPT_EXTENSIONS as readonly string[]
  ).includes(extension)
    ? extension
    : "jpg";
  return `sales/${key}/${crypto.randomUUID()}.${safeExtension}`;
}

export type ReceiptValidation = { ok: true } | { ok: false; error: string };

export function validateSaleReceipt(file: {
  size: number;
  type: string;
  name: string;
}): ReceiptValidation {
  if (!(ACCEPTED_RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "صيغة الإيصال غير مدعومة. الصيغ المقبولة: JPG، PNG، WEBP، PDF.",
    };
  }
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_RECEIPT_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: "امتداد الملف غير مدعوم." };
  }
  if (file.size <= 0) return { ok: false, error: "الملف فارغ." };
  if (file.size > MAX_RECEIPT_BYTES) {
    const mb = Math.round(MAX_RECEIPT_BYTES / (1024 * 1024));
    return { ok: false, error: `حجم الإيصال يجب ألا يتجاوز ${mb} ميجابايت.` };
  }
  return { ok: true };
}
