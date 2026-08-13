"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import {
  NOT_FOUND,
  UPLOAD_IMAGE_ERROR,
  translateDbError,
} from "@/lib/catalog/errors";
import {
  buildImageStoragePath,
  validateImageFile,
} from "@/lib/catalog/images";
import {
  MAX_IMAGES_PER_PRODUCT,
  PRODUCT_IMAGES_BUCKET,
} from "@/lib/catalog/config";
import { reorderImagesSchema } from "@/lib/validation/catalog";
import type { ActionResult } from "./auth";

const VALIDATION_ERROR = "يرجى التحقق من البيانات المدخلة";

/**
 * Uploads one product image.
 *
 * Bytes go to the private `product-images` bucket; only the storage path is
 * written to Postgres. If the metadata row fails after the upload succeeded,
 * the orphaned object is removed so storage and the database stay in step.
 */
export async function uploadProductImageAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const productId = formData.get("product_id");
  const variantIdRaw = formData.get("variant_id");
  const altText = formData.get("alt_text");
  const file = formData.get("file");

  const parsedMeta = z
    .object({
      product_id: z.string().uuid(),
      variant_id: z.string().uuid().nullable(),
      alt_text: z.string().max(200).nullable(),
    })
    .safeParse({
      product_id: typeof productId === "string" ? productId : "",
      variant_id:
        typeof variantIdRaw === "string" && variantIdRaw ? variantIdRaw : null,
      alt_text: typeof altText === "string" && altText ? altText : null,
    });

  if (!parsedMeta.success) return { ok: false, error: VALIDATION_ERROR };
  if (!(file instanceof File)) {
    return { ok: false, error: "لم يتم اختيار صورة." };
  }

  const validation = validateImageFile({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const supabase = await createClient();

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", parsedMeta.data.product_id);

  if ((count ?? 0) >= MAX_IMAGES_PER_PRODUCT) {
    return {
      ok: false,
      error: `لا يمكن إضافة أكثر من ${MAX_IMAGES_PER_PRODUCT} صور للمنتج الواحد.`,
    };
  }

  const storagePath = buildImageStoragePath(
    parsedMeta.data.product_id,
    file.name,
  );

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("[images] upload failed:", uploadError.message);
    return { ok: false, error: UPLOAD_IMAGE_ERROR };
  }

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: parsedMeta.data.product_id,
      variant_id: parsedMeta.data.variant_id,
      storage_path: storagePath,
      public_url: null,
      alt_text: parsedMeta.data.alt_text,
      is_primary: false,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Roll the upload back so no unreferenced object is left behind.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
    const translated = translateDbError(error, UPLOAD_IMAGE_ERROR);
    return { ok: false, error: translated.error };
  }

  await logAction({
    userId: auth.user.id,
    action: "UPLOAD_PRODUCT_IMAGE",
    entityType: "product_image",
    entityId: data.id,
    metadata: {
      product_id: parsedMeta.data.product_id,
      storage_path: storagePath,
      bytes: file.size,
    },
  });

  revalidatePath(`/products/${parsedMeta.data.product_id}`);
  revalidatePath("/products");
  return { ok: true, data: { id: data.id } };
}

export async function deleteProductImageAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();

  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, is_primary")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!image) return { ok: false, error: NOT_FOUND };
  const row = image as {
    product_id: string;
    storage_path: string;
    is_primary: boolean;
  };

  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    const translated = translateDbError(error, "تعذر حذف الصورة.");
    return { ok: false, error: translated.error };
  }

  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([row.storage_path]);

  // Deleting the primary image promotes whichever image now sorts first.
  if (row.is_primary) {
    const { data: next } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", row.product_id)
      .order("sort_order")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (next) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", (next as { id: string }).id);
    }
  }

  await logAction({
    userId: auth.user.id,
    action: "DELETE_PRODUCT_IMAGE",
    entityType: "product_image",
    entityId: parsed.data.id,
    metadata: { product_id: row.product_id, storage_path: row.storage_path },
  });

  revalidatePath(`/products/${row.product_id}`);
  revalidatePath("/products");
  return { ok: true };
}

export async function setPrimaryImageAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();

  // The database trigger clears the previous primary before this row lands.
  const { data, error } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", parsed.data.id)
    .select("id, product_id")
    .maybeSingle();

  if (error) {
    const translated = translateDbError(error, "تعذر تحديث الصورة الرئيسية.");
    return { ok: false, error: translated.error };
  }
  if (!data) return { ok: false, error: NOT_FOUND };

  const row = data as { product_id: string };

  await logAction({
    userId: auth.user.id,
    action: "SET_PRIMARY_PRODUCT_IMAGE",
    entityType: "product_image",
    entityId: parsed.data.id,
    metadata: { product_id: row.product_id },
  });

  revalidatePath(`/products/${row.product_id}`);
  revalidatePath("/products");
  return { ok: true };
}

export async function reorderProductImagesAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = reorderImagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();

  const results = await Promise.all(
    parsed.data.ordered_ids.map((id, index) =>
      supabase
        .from("product_images")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("product_id", parsed.data.product_id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    const translated = translateDbError(failed.error, "تعذر إعادة ترتيب الصور.");
    return { ok: false, error: translated.error };
  }

  revalidatePath(`/products/${parsed.data.product_id}`);
  return { ok: true };
}
