import "server-only";

/**
 * Expense receipts.
 *
 * A fourth bucket, kept apart from supplier, customer and refund receipts so
 * each money flow keeps its own evidence and the finance reports never have to
 * guess which kind of document they are looking at.
 */

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

export const EXPENSE_RECEIPT_URL_TTL_SECONDS = 60 * 60;

export const MAX_EXPENSE_RECEIPT_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_EXPENSE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

export const ACCEPTED_EXPENSE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/** `expenses/{categoryOrMisc}/{uuid}.{ext}` */
export function buildExpenseReceiptPath(key: string, fileName: string): string {
  const extension = (fileName.split(".").pop() ?? "").toLowerCase();
  const safeExtension = (
    ACCEPTED_EXPENSE_EXTENSIONS as readonly string[]
  ).includes(extension)
    ? extension
    : "jpg";
  return `expenses/${key}/${crypto.randomUUID()}.${safeExtension}`;
}

export type ExpenseReceiptValidation = { ok: true } | { ok: false; error: string };

export function validateExpenseReceipt(file: {
  size: number;
  type: string;
  name: string;
}): ExpenseReceiptValidation {
  if (!(ACCEPTED_EXPENSE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "صيغة الإيصال غير مدعومة. الصيغ المقبولة: JPG، PNG، WEBP." };
  }
  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_EXPENSE_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: "امتداد الملف غير مدعوم." };
  }
  if (file.size <= 0) return { ok: false, error: "الملف فارغ." };
  if (file.size > MAX_EXPENSE_RECEIPT_BYTES) {
    const mb = Math.round(MAX_EXPENSE_RECEIPT_BYTES / (1024 * 1024));
    return { ok: false, error: `حجم الإيصال يجب ألا يتجاوز ${mb} ميجابايت.` };
  }
  return { ok: true };
}
