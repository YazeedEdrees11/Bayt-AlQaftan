import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps the exceptions raised by the Phase 5 RPCs onto Arabic messages.
 *
 * Every one of these aborts the whole transaction, which is why the fallback
 * says explicitly that nothing was saved.
 */

export const RETURN_SAVE_ERROR = "تعذر حفظ المرتجع.";
export const REFUND_SAVE_ERROR = "تعذر تسجيل الاسترداد.";
export const EXCHANGE_SAVE_ERROR = "تعذر حفظ الاستبدال.";
export const ADJUSTMENT_SAVE_ERROR = "تعذر حفظ تعديل المخزون.";
export const DAMAGE_SAVE_ERROR = "تعذر تسجيل التالف.";
export const ROLLED_BACK_ERROR = "حدث خطأ أثناء العملية، ولم يتم حفظ أي تغييرات.";

interface Mapped {
  error: string;
  field?: string;
}

const RULES: { match: RegExp; message: string; field?: string }[] = [
  { match: /forbidden/i, message: "ليس لديك صلاحية لتنفيذ هذه العملية." },

  // Returns
  {
    match: /return_exceeds_sold/i,
    message: "لا يمكن إرجاع كمية أكبر من الكمية المباعة.",
    field: "items",
  },
  {
    match: /nothing_returnable/i,
    message: "لا توجد كمية متبقية للإرجاع.",
    field: "items",
  },
  {
    match: /sale_cancelled/i,
    message: "لا يمكن إرجاع منتجات من عملية بيع ملغاة.",
  },
  {
    match: /sale_not_returnable/i,
    message: "لا يمكن الإرجاع من هذه العملية — يجب أن تكون مكتملة.",
  },
  { match: /sale_item_mismatch/i, message: "المنتج المختار لا ينتمي لعملية البيع." },
  { match: /sale_item_not_found/i, message: "بند البيع غير موجود." },
  { match: /return_not_found/i, message: "المرتجع غير موجود." },
  { match: /return_not_cancellable/i, message: "لا يمكن إلغاء هذا المرتجع." },
  { match: /return_not_refundable/i, message: "لا يمكن تسجيل استرداد على هذا المرتجع." },
  {
    match: /refund_exceeds_return/i,
    message: "المبلغ المسترد أكبر من قيمة المرتجع.",
    field: "amount",
  },
  {
    match: /credit_requires_customer/i,
    message: "لا يمكن إضافة رصيد لعميل غير مسجل.",
    field: "refund_method",
  },
  { match: /invalid_refund_method/i, message: "طريقة الاسترداد غير صحيحة.", field: "refund_method" },
  { match: /invalid_condition/i, message: "حالة المنتج غير صحيحة.", field: "items" },

  // Exchanges
  { match: /exchange_not_found/i, message: "الاستبدال غير موجود." },
  { match: /exchange_not_cancellable/i, message: "لا يمكن إلغاء هذا الاستبدال." },

  // Cancelling something whose goods have already moved on again.
  {
    match: /cancel_would_oversell/i,
    message: "لا يمكن إلغاء هذه العملية بسبب وجود حركات مرتبطة بها.",
  },
  {
    match: /sale_has_returns/i,
    message: "لا يمكن إلغاء عملية بيع لها مرتجعات. ألغِ المرتجعات أولاً.",
  },
  {
    match: /sale_has_exchanges/i,
    message: "لا يمكن إلغاء عملية بيع لها عمليات استبدال. ألغِ الاستبدال أولاً.",
  },

  // Stock
  {
    match: /insufficient_stock/i,
    message: "لا يمكن إتمام الاستبدال بسبب نقص المخزون.",
    field: "new_items",
  },
  { match: /variant_not_found/i, message: "المنتج غير موجود.", field: "new_items" },
  { match: /variant_inactive/i, message: "أحد الموديلات غير مفعّل ولا يمكن بيعه.", field: "new_items" },

  // Adjustments
  { match: /adjustment_not_found/i, message: "تعديل المخزون غير موجود." },
  { match: /adjustment_not_cancellable/i, message: "لا يمكن إلغاء هذا التعديل." },
  {
    match: /invalid_actual_quantity/i,
    message: "الكمية الفعلية غير صحيحة.",
    field: "items",
  },
  { match: /invalid_reason/i, message: "سبب التعديل غير صحيح.", field: "reason" },

  // Shared
  { match: /no_items/i, message: "يجب إضافة منتج واحد على الأقل.", field: "items" },
  { match: /invalid_quantity/i, message: "الكمية يجب أن تكون أكبر من صفر.", field: "items" },
  { match: /invalid_amount/i, message: "المبلغ غير صحيح.", field: "amount" },
  {
    match: /bank_details_required/i,
    message: "بيانات التحويل البنكي غير مكتملة.",
    field: "bank_name",
  },
  { match: /sale_not_found/i, message: "عملية البيع غير موجودة." },
  { match: /append-only/i, message: "لا يمكن تعديل سجل مالي محفوظ." },
];

export function translateReturnError(
  error: PostgrestError | { message?: string } | null,
  fallback: string = ROLLED_BACK_ERROR,
): Mapped {
  const raw = `${error?.message ?? ""}`;
  if (!raw) return { error: fallback };

  for (const rule of RULES) {
    if (rule.match.test(raw)) {
      return { error: rule.message, field: rule.field };
    }
  }
  return { error: fallback };
}
