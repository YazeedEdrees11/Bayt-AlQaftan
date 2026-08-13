import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps the exceptions raised by the sales RPCs onto Arabic messages.
 *
 * Every one of these aborts the whole transaction, which is why the fallback
 * says explicitly that nothing was saved.
 */

export const SALE_SAVE_ERROR = "تعذر حفظ عملية البيع.";
export const SALE_PAYMENT_ERROR = "تعذر تسجيل الدفعة.";
export const CUSTOMER_SAVE_ERROR = "تعذر حفظ بيانات العميل.";
export const ROLLED_BACK_ERROR = "حدث خطأ أثناء العملية، ولم يتم حفظ أي تغييرات.";

interface Mapped {
  error: string;
  field?: string;
}

const RULES: { match: RegExp; message: string; field?: string }[] = [
  { match: /forbidden/i, message: "ليس لديك صلاحية لتنفيذ هذه العملية." },

  { match: /customer_not_found/i, message: "العميل غير موجود أو غير مفعّل.", field: "customer_id" },
  { match: /variant_not_found/i, message: "المنتج غير موجود.", field: "items" },
  { match: /variant_inactive/i, message: "أحد الموديلات غير مفعّل ولا يمكن بيعه.", field: "items" },
  { match: /no_items/i, message: "يجب إضافة منتج واحد على الأقل.", field: "items" },

  // Raised when the basket no longer fits the shelf — including the case where
  // another till sold the last piece a moment earlier.
  {
    match: /insufficient_stock/i,
    message: "الكمية المطلوبة لم تعد متوفرة في المخزون.",
    field: "items",
  },

  { match: /invalid_quantity/i, message: "الكمية يجب أن تكون أكبر من صفر.", field: "items" },
  { match: /invalid_unit_price/i, message: "سعر البيع غير صحيح.", field: "items" },
  {
    match: /invalid_discount/i,
    message: "الخصم غير صحيح — لا يمكن أن يتجاوز المجموع الفرعي.",
    field: "discount",
  },
  { match: /invalid_amount/i, message: "المبلغ غير صحيح.", field: "amount" },
  {
    match: /overpayment/i,
    message: "المبلغ المدفوع لا يمكن أن يكون أكبر من الإجمالي.",
    field: "amount",
  },
  {
    match: /payment_exceeds_outstanding/i,
    message: "المبلغ المدفوع أكبر من الرصيد المستحق.",
    field: "amount",
  },
  {
    match: /bank_details_required/i,
    message: "بيانات التحويل البنكي غير مكتملة.",
    field: "bank_name",
  },

  { match: /sale_not_found/i, message: "عملية البيع غير موجودة." },

  // Raised by cancel_sale once Phase 5 exists: the goods on a returned line
  // have already gone back once, so reversing the whole sale would restore
  // them twice. Without these two the cashier only sees the generic failure.
  {
    match: /sale_has_returns/i,
    message: "لا يمكن إلغاء عملية بيع لها مرتجعات. ألغِ المرتجعات أولاً.",
  },
  {
    match: /sale_has_exchanges/i,
    message: "لا يمكن إلغاء عملية بيع لها عمليات استبدال. ألغِ الاستبدال أولاً.",
  },
  { match: /sale_not_payable/i, message: "لا يمكن تسجيل دفعة على عملية غير مكتملة." },
  { match: /sale_not_cancellable/i, message: "لا يمكن إلغاء هذه العملية في حالتها الحالية." },
  { match: /sale_not_draft/i, message: "هذه العملية متاحة للمسودات فقط." },
  {
    match: /draft_has_side_effects/i,
    message: "لا يمكن حذف هذه المسودة لأنها أثّرت على المخزون. استخدم الإلغاء بدلاً من ذلك.",
  },
  { match: /invalid_status/i, message: "حالة البيع غير صحيحة." },
  {
    match: /customer_has_history/i,
    message: "لا يمكن حذف عميل له عمليات بيع. يمكنك تعطيله بدلاً من ذلك.",
  },
  { match: /append-only/i, message: "لا يمكن تعديل الحركات المالية بعد تسجيلها." },
];

export function translateSaleError(
  error: PostgrestError | null | undefined,
  fallback: string = ROLLED_BACK_ERROR,
): Mapped {
  if (!error) return { error: fallback };

  const haystack = [error.message, error.details, error.hint].filter(Boolean).join(" ");

  for (const rule of RULES) {
    if (rule.match.test(haystack)) return { error: rule.message, field: rule.field };
  }

  if (error.code === "23505") {
    return { error: "هذه القيمة مستخدمة مسبقاً." };
  }
  if (error.code === "42501" || /row-level security/i.test(haystack)) {
    return { error: "ليس لديك صلاحية لتنفيذ هذه العملية." };
  }

  console.error("[sales] untranslated error:", error.code, error.message);
  return { error: fallback };
}

/** Pulls the SKU list out of `insufficient_stock: SKU1, SKU2`. */
export function extractShortSkus(error: PostgrestError | null | undefined): string[] {
  if (!error?.message) return [];
  const match = /insufficient_stock:\s*(.+)$/i.exec(error.message);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}
