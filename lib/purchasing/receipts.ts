import "server-only";

/**
 * Bank-transfer receipt storage.
 *
 * The `payment-receipts` bucket is private and readable only by ADMIN and
 * MANAGER, so receipts are served through short-lived signed URLs.
 */

export const PAYMENT_RECEIPTS_BUCKET = "payment-receipts";

export const RECEIPT_URL_TTL_SECONDS = 60 * 60;

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB

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

export const RECEIPT_ACCEPT_ATTRIBUTE =
  ACCEPTED_RECEIPT_MIME_TYPES.join(",");

/** `receipts/{supplierId}/{uuid}.{ext}` — grouped so audits stay simple. */
export function buildReceiptStoragePath(
  supplierId: string,
  fileName: string,
): string {
  const extension = (fileName.split(".").pop() ?? "").toLowerCase();
  const safeExtension = (
    ACCEPTED_RECEIPT_EXTENSIONS as readonly string[]
  ).includes(extension)
    ? extension
    : "jpg";
  return `receipts/${supplierId}/${crypto.randomUUID()}.${safeExtension}`;
}

export type ReceiptValidation = { ok: true } | { ok: false; error: string };

export function validateReceiptFile(file: {
  size: number;
  type: string;
  name: string;
}): ReceiptValidation {
  if (
    !(ACCEPTED_RECEIPT_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
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
