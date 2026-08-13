import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps the exceptions raised by the finance RPCs onto Arabic messages.
 *
 * Each one aborts the whole transaction — an expense and its ledger row are
 * written together or not at all — which is why the fallback says explicitly
 * that nothing was saved.
 */

export const EXPENSE_SAVE_ERROR = "تعذر حفظ المصروف.";
export const TRANSFER_SAVE_ERROR = "تعذر تنفيذ التحويل.";
export const ACCOUNT_SAVE_ERROR = "تعذر حفظ الحساب المالي.";
export const ADJUSTMENT_SAVE_ERROR = "تعذر حفظ التعديل المالي.";
export const ROLLED_BACK_ERROR = "حدث خطأ أثناء العملية، ولم يتم حفظ أي تغييرات.";

interface Mapped {
  error: string;
  field?: string;
}

const RULES: { match: RegExp; message: string; field?: string }[] = [
  { match: /forbidden/i, message: "ليس لديك صلاحية لتنفيذ هذه العملية." },

  // The one that will actually be hit day to day.
  {
    match: /insufficient_funds/i,
    message: "الرصيد غير كافٍ في هذا الحساب لإتمام العملية.",
    field: "amount",
  },
  {
    match: /no_default_account/i,
    message: "لا يوجد حساب افتراضي لطريقة الدفع هذه. أضف حساباً أولاً.",
    field: "financial_account_id",
  },
  {
    match: /financial_account_not_found/i,
    message: "الحساب المالي غير موجود أو غير مفعّل.",
    field: "financial_account_id",
  },
  {
    match: /account_method_mismatch/i,
    message: "طريقة الدفع لا تطابق نوع الحساب — النقد من الصندوق والتحويل من البنك.",
    field: "financial_account_id",
  },
  { match: /same_account/i, message: "لا يمكن التحويل من الحساب إلى نفسه.", field: "to_account_id" },
  { match: /account_required/i, message: "يجب اختيار الحسابين.", field: "from_account_id" },

  { match: /expense_not_found/i, message: "المصروف غير موجود." },
  { match: /expense_not_cancellable/i, message: "لا يمكن إلغاء هذا المصروف." },
  {
    match: /expense_category_not_found/i,
    message: "تصنيف المصروف غير موجود أو غير مفعّل.",
    field: "expense_category_id",
  },

  { match: /invalid_amount/i, message: "المبلغ غير صحيح.", field: "amount" },
  { match: /invalid_direction/i, message: "اتجاه الحركة غير صحيح.", field: "direction" },
  { match: /reason_required/i, message: "سبب التعديل مطلوب.", field: "reason" },
  { match: /invalid_account_type/i, message: "نوع الحساب غير صحيح.", field: "account_type" },
  { match: /invalid_opening_balance/i, message: "الرصيد الافتتاحي غير صحيح.", field: "opening_balance" },
  { match: /invalid_payment_method/i, message: "طريقة الدفع غير صحيحة.", field: "payment_method" },

  { match: /append-only/i, message: "لا يمكن تعديل حركة مالية محفوظة — سجّل حركة عكسية بدلاً من ذلك." },
];

export function translateFinanceError(
  error: PostgrestError | { message?: string } | null,
  fallback: string = ROLLED_BACK_ERROR,
): Mapped {
  const raw = `${error?.message ?? ""}`;
  if (!raw) return { error: fallback };
  for (const rule of RULES) {
    if (rule.match.test(raw)) return { error: rule.message, field: rule.field };
  }
  return { error: fallback };
}
