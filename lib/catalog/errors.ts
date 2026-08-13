import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Translates Postgres failures into Arabic messages for the UI.
 *
 * Raw database errors are never surfaced: they leak schema details and read
 * as noise to a shop employee. Anything unrecognised falls back to a generic
 * message and is logged server-side instead.
 */

export const GENERIC_ERROR = "حدث خطأ غير متوقع.";
export const SAVE_PRODUCT_ERROR = "تعذر حفظ المنتج.";
export const SAVE_SUPPLIER_ERROR = "تعذر حفظ بيانات المورد.";
export const UPLOAD_IMAGE_ERROR = "تعذر رفع الصورة.";
export const UPDATE_STOCK_ERROR = "تعذر تحديث المخزون.";

export const DUPLICATE_SKU = "رقم SKU مستخدم مسبقاً.";
export const DUPLICATE_BARCODE = "الباركود مستخدم مسبقاً.";
export const DUPLICATE_CATEGORY = "اسم التصنيف مستخدم مسبقاً.";
export const INSUFFICIENT_STOCK =
  "لا يمكن خصم كمية أكبر من المخزون الحالي.";
export const HAS_HISTORY =
  "لا يمكن حذف عنصر له حركة مخزون. يمكنك تعطيله بدلاً من ذلك.";
export const NOT_FOUND = "العنصر غير موجود.";
export const NO_PERMISSION = "ليس لديك صلاحية لتنفيذ هذه العملية.";

interface TranslatedError {
  error: string;
  /** Field the message belongs to, when it maps onto one. */
  field?: string;
}

/**
 * Maps a PostgrestError onto a user-facing message.
 * `fallback` is used when nothing matches.
 */
export function translateDbError(
  error: PostgrestError | null | undefined,
  fallback: string = GENERIC_ERROR,
): TranslatedError {
  if (!error) return { error: fallback };

  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  // 23505 — unique_violation
  if (error.code === "23505") {
    if (message.includes("sku")) return { error: DUPLICATE_SKU, field: "sku" };
    if (message.includes("barcode")) {
      return { error: DUPLICATE_BARCODE, field: "barcode" };
    }
    if (message.includes("categories_name")) {
      return { error: DUPLICATE_CATEGORY, field: "name" };
    }
    if (message.includes("storage_path")) {
      return { error: "تم رفع هذه الصورة مسبقاً." };
    }
    return { error: "هذه القيمة مستخدمة مسبقاً." };
  }

  // Raised by enforce_non_negative_stock()
  if (message.includes("insufficient_stock")) {
    return { error: INSUFFICIENT_STOCK, field: "quantity" };
  }

  // Raised by prevent_delete_with_history()
  if (message.includes("has_inventory_history")) {
    return { error: HAS_HISTORY };
  }

  // Raised by prevent_inventory_mutation()
  if (message.includes("append-only")) {
    return { error: "لا يمكن تعديل حركات المخزون بعد تسجيلها." };
  }

  // 23503 — foreign_key_violation
  if (error.code === "23503") {
    if (message.includes("category")) {
      return { error: "التصنيف المحدد غير موجود.", field: "category_id" };
    }
    if (message.includes("supplier")) {
      return { error: "المورد المحدد غير موجود.", field: "supplier_id" };
    }
    return { error: "هذا العنصر مرتبط بسجلات أخرى." };
  }

  // 42501 — insufficient_privilege, or an RLS policy refused the row
  if (error.code === "42501" || message.includes("row-level security")) {
    return { error: NO_PERMISSION };
  }

  // 23514 — check_violation
  if (error.code === "23514") {
    if (message.includes("quantity")) {
      return { error: "الكمية غير صحيحة.", field: "quantity" };
    }
    if (message.includes("price")) {
      return { error: "السعر غير صحيح." };
    }
    return { error: "البيانات المدخلة غير صحيحة." };
  }

  console.error("[db] untranslated error:", error.code, error.message);
  return { error: fallback };
}
