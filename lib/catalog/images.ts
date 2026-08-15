import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "./config";

/**
 * Signed-URL helpers for the private `product-images` bucket.
 *
 * The bucket is not public, so nothing renders without a short-lived signed
 * URL minted for a user who passed the storage RLS policy.
 */

/** Signs many paths in one round-trip. Returns a path -> URL map. */
export async function getSignedImageUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return result;

  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[images] failed to sign urls:", error?.message);
    return result;
  }

  // The response array maintains the same order as the input `unique` array.
  // We use positional matching because `entry.path` can be null in some
  // versions of @supabase/supabase-js, which would silently drop every URL.
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (entry.signedUrl) {
      // Prefer the returned path when present; fall back to the input path.
      const key = entry.path ?? unique[i];
      if (key) result.set(key, entry.signedUrl);
    }
  }

  return result;
}

/** Signs a single path, or returns null when it cannot be signed. */
export async function getSignedImageUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const map = await getSignedImageUrls([path]);
  return map.get(path) ?? undefined;
}

/**
 * Storage key for a product image: `products/{productId}/{uuid}.{ext}`.
 * Grouping by product keeps deletes and audits simple.
 */
export function buildImageStoragePath(
  productId: string,
  fileName: string,
): string {
  const extension = (fileName.split(".").pop() ?? "").toLowerCase();
  const safeExtension = (
    ACCEPTED_IMAGE_EXTENSIONS as readonly string[]
  ).includes(extension)
    ? extension
    : "jpg";
  return `products/${productId}/${crypto.randomUUID()}.${safeExtension}`;
}

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server-side gate on uploads. The bucket enforces the same limits, but
 * failing here produces an Arabic message instead of a storage error.
 */
export function validateImageFile(file: {
  size: number;
  type: string;
  name: string;
}): ImageValidationResult {
  if (
    !(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
  ) {
    return {
      ok: false,
      error: "صيغة الصورة غير مدعومة. الصيغ المقبولة: JPG، PNG، WEBP.",
    };
  }

  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      error: "امتداد الملف غير مدعوم. الصيغ المقبولة: JPG، PNG، WEBP.",
    };
  }

  if (file.size <= 0) {
    return { ok: false, error: "الملف فارغ." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    return { ok: false, error: `حجم الصورة يجب ألا يتجاوز ${mb} ميجابايت.` };
  }

  return { ok: true };
}
