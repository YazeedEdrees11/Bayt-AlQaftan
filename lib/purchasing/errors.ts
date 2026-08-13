import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps the exceptions raised by the purchasing RPCs onto Arabic messages.
 *
 * Every one of these aborts the whole database transaction, which is why the
 * fallback says explicitly that nothing was saved — the user can retry without
 * worrying about half-written stock or balances.
 */

export const PURCHASE_SAVE_ERROR = "تعذر حفظ المشتريات.";
export const PAYMENT_SAVE_ERROR = "تعذر تسجيل الدفعة.";
export const STOCK_UPDATE_ERROR = "تعذر تحديث المخزون.";
export const ROLLED_BACK_ERROR =
  "حدث خطأ أثناء العملية، ولم يتم حفظ أي تغييرات.";

interface Mapped {
  error: string;
  field?: string;
}

/** Ordered so more specific tokens win over generic ones. */
const RULES: { match: RegExp; message: string; field?: string }[] = [
  { match: /forbidden/i, message: "ليس لديك صلاحية لتنفيذ هذه العملية." },

  { match: /supplier_not_found/i, message: "المورد غير موجود.", field: "supplier_id" },
  {
    match: /supplier_inactive/i,
    message: "هذا المورد غير مفعّل. فعّله أولاً قبل تسجيل مشتريات.",
    field: "supplier_id",
  },

  { match: /variant_not_found/i, message: "المنتج غير موجود.", field: "items" },
  {
    match: /variant_inactive/i,
    message: "أحد الموديلات غير مفعّل ولا يمكن شراؤه.",
    field: "items",
  },
  { match: /no_items/i, message: "يجب إضافة منتج واحد على الأقل.", field: "items" },

  {
    match: /invalid_quantity/i,
    message: "الكمية يجب أن تكون أكبر من صفر.",
    field: "items",
  },
  { match: /invalid_unit_cost/i, message: "سعر الشراء غير صحيح.", field: "items" },
  {
    match: /invalid_discount/i,
    message: "الخصم غير صحيح — لا يمكن أن يتجاوز المجموع الفرعي.",
    field: "discount",
  },
  {
    match: /invalid_paid_amount|invalid_amount/i,
    message: "المبلغ المدفوع غير صحيح.",
    field: "amount",
  },
  {
    match: /overpayment/i,
    message: "المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي.",
    field: "amount",
  },
  {
    match: /payment_exceeds_outstanding/i,
    message: "أعلى مبلغ يمكن دفعه هو المبلغ المستحق على المورد.",
    field: "amount",
  },
  {
    match: /bank_details_required/i,
    message: "بيانات التحويل البنكي غير مكتملة.",
    field: "bank_name",
  },

  { match: /purchase_not_found/i, message: "المشتريات غير موجودة." },
  {
    match: /purchase_not_payable/i,
    message: "لا يمكن تسجيل دفعة على مشتريات غير مكتملة.",
  },
  {
    match: /purchase_not_cancellable/i,
    message: "لا يمكن إلغاء هذه المشتريات في حالتها الحالية.",
  },
  {
    match: /purchase_not_draft/i,
    message: "هذه العملية متاحة للمسودات فقط.",
  },
  {
    match: /draft_has_side_effects/i,
    message:
      "لا يمكن حذف هذه المسودة لأنها أثّرت على المخزون أو حساب المورد. استخدم الإلغاء بدلاً من ذلك.",
  },
  { match: /invalid_status/i, message: "حالة المشتريات غير صحيحة." },
  {
    match: /stock_already_consumed/i,
    message:
      "لا يمكن إلغاء هذه المشتريات لأن بعض الكميات تم بيعها أو خرجت من المخزون.",
  },

  { match: /insufficient_stock/i, message: "الكمية المطلوبة غير متوفرة في المخزون." },
  {
    match: /append-only/i,
    message: "لا يمكن تعديل الحركات المالية بعد تسجيلها.",
  },
];

export function translatePurchaseError(
  error: PostgrestError | null | undefined,
  fallback: string = ROLLED_BACK_ERROR,
): Mapped {
  if (!error) return { error: fallback };

  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");

  for (const rule of RULES) {
    if (rule.match.test(haystack)) {
      return { error: rule.message, field: rule.field };
    }
  }

  if (error.code === "42501" || /row-level security/i.test(haystack)) {
    return { error: "ليس لديك صلاحية لتنفيذ هذه العملية." };
  }

  console.error("[purchasing] untranslated error:", error.code, error.message);
  return { error: fallback };
}

/**
 * Pulls the SKU list out of a `stock_already_consumed: SKU1, SKU2` message so
 * the UI can name the exact items blocking a cancellation.
 */
export function extractBlockedSkus(
  error: PostgrestError | null | undefined,
): string[] {
  if (!error?.message) return [];
  const match = /stock_already_consumed:\s*(.+)$/i.exec(error.message);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((sku) => sku.trim())
    .filter(Boolean);
}
