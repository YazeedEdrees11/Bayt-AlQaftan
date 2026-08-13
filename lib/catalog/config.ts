import type { StockStatus } from "@/types/catalog";

/**
 * Catalog and inventory configuration.
 *
 * Every tunable number lives here rather than being sprinkled through the
 * codebase, so changing the low-stock threshold or the page size is a one-line
 * edit. The database functions take the threshold as a parameter and receive
 * this same value.
 */

/** A variant at or below this count counts as "مخزون منخفض". */
export const LOW_STOCK_THRESHOLD = 5;

/** Pagination. */
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export function normalizePageSize(value: unknown): number {
  const parsed = Number(value);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_PAGE_SIZE;
}

export function normalizePage(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

/** Supabase Storage. */
export const PRODUCT_IMAGES_BUCKET = "product-images";

/** The bucket is private; the app hands out short-lived signed URLs. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Upload constraints — enforced client-side, server-side, and by the bucket. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_PRODUCT = 12;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ACCEPTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/** `accept` attribute for the file input. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_MIME_TYPES.join(",");

/** Currency the store trades in. */
export const CURRENCY_CODE = "JOD";
export const CURRENCY_LABEL = "د.أ";

/** Where a variant's stock level puts it. */
export function getStockStatus(
  stock: number,
  threshold: number = LOW_STOCK_THRESHOLD,
): StockStatus {
  if (stock <= 0) return "OUT_OF_STOCK";
  if (stock <= threshold) return "LOW_STOCK";
  return "IN_STOCK";
}

/** Sort options offered by the product list. */
export const PRODUCT_SORT_OPTIONS = [
  { value: "created_desc", label: "الأحدث أولاً" },
  { value: "created_asc", label: "الأقدم أولاً" },
  { value: "name_asc", label: "الاسم (أ - ي)" },
  { value: "name_desc", label: "الاسم (ي - أ)" },
  { value: "stock_desc", label: "المخزون (الأعلى)" },
  { value: "stock_asc", label: "المخزون (الأقل)" },
  { value: "price_asc", label: "السعر (الأقل)" },
  { value: "price_desc", label: "السعر (الأعلى)" },
] as const;

export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

export function normalizeSort(value: unknown): ProductSort {
  const found = PRODUCT_SORT_OPTIONS.find((option) => option.value === value);
  return found ? found.value : "created_desc";
}
