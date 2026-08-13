"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import {
  HAS_HISTORY,
  NOT_FOUND,
  SAVE_PRODUCT_ERROR,
  translateDbError,
} from "@/lib/catalog/errors";
import {
  categorySchema,
  createProductSchema,
  singleVariantSchema,
  updateProductSchema,
  variantSchema,
} from "@/lib/validation/catalog";
import type { ActionResult } from "./auth";

const VALIDATION_ERROR = "يرجى التحقق من البيانات المدخلة";

function collectFieldErrors(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function dbFailure(
  error: PostgrestError | null,
  fallback: string,
): ActionResult {
  const translated = translateDbError(error, fallback);
  return {
    ok: false,
    error: translated.error,
    fieldErrors: translated.field
      ? { [translated.field]: translated.error }
      : undefined,
  };
}

function revalidateCatalog(productId?: string) {
  revalidatePath("/products");
  revalidatePath("/inventory");
  if (productId) revalidatePath(`/products/${productId}`);
}

/* -------------------------------------------------------------------------- */
/*                                 Categories                                 */
/* -------------------------------------------------------------------------- */

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const auth = await authorizeAction("CREATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .insert(parsed.data)
    .select("id, name")
    .single();

  if (error || !data) return dbFailure(error, "تعذر حفظ التصنيف.");

  await logAction({
    userId: auth.user.id,
    action: "CREATE_CATEGORY",
    entityType: "category",
    entityId: data.id,
    metadata: { name: parsed.data.name },
  });

  revalidateCatalog();
  return { ok: true, data: { id: data.id, name: data.name } };
}

export async function updateCategoryAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const schema = categorySchema.extend({ id: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { id, ...values } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("categories").update(values).eq("id", id);

  if (error) return dbFailure(error, "تعذر حفظ التصنيف.");

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_CATEGORY",
    entityType: "category",
    entityId: id,
    metadata: { name: values.name },
  });

  revalidateCatalog();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                                  Products                                  */
/* -------------------------------------------------------------------------- */

/**
 * Creates a product together with its variants and their opening stock.
 * Runs through a single Postgres function so the whole thing is one
 * transaction — a bad SKU on variant 3 rolls back variants 1 and 2 as well.
 */
export async function createProductAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction("CREATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { variants, ...product } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_product_with_variants", {
    p_product: {
      name: product.name,
      description: product.description,
      category_id: product.category_id,
      brand: product.brand,
      base_selling_price:
        product.base_selling_price === null
          ? ""
          : String(product.base_selling_price),
      is_active: product.is_active,
    },
    p_variants: variants.map((variant) => ({
      sku: variant.sku,
      barcode: variant.barcode,
      color: variant.color,
      size: variant.size,
      supplier_id: variant.supplier_id,
      purchase_price: String(variant.purchase_price),
      selling_price: String(variant.selling_price),
      initial_stock: variant.initial_stock,
      is_active: variant.is_active,
    })),
  });

  if (error || !data) return dbFailure(error, SAVE_PRODUCT_ERROR);

  const productId = data as unknown as string;

  await logAction({
    userId: auth.user.id,
    action: "CREATE_PRODUCT",
    entityType: "product",
    entityId: productId,
    metadata: {
      name: product.name,
      category_id: product.category_id,
      variants: variants.length,
      initial_units: variants.reduce((sum, v) => sum + v.initial_stock, 0),
    },
  });

  revalidateCatalog(productId);
  return { ok: true, data: { id: productId } };
}

export async function updateProductAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { id, ...values } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFailure(error, SAVE_PRODUCT_ERROR);
  if (!data) return { ok: false, error: NOT_FOUND };

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_PRODUCT",
    entityType: "product",
    entityId: id,
    metadata: { name: values.name, is_active: values.is_active },
  });

  revalidateCatalog(id);
  return { ok: true };
}

/** Soft delete — the safe default for a product with any history. */
export async function setProductActiveAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z
    .object({ id: z.string().uuid(), is_active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id)
    .select("id, name")
    .maybeSingle();

  if (error) return dbFailure(error, SAVE_PRODUCT_ERROR);
  if (!data) return { ok: false, error: NOT_FOUND };

  await logAction({
    userId: auth.user.id,
    action: parsed.data.is_active ? "ACTIVATE_PRODUCT" : "DEACTIVATE_PRODUCT",
    entityType: "product",
    entityId: parsed.data.id,
    metadata: { name: (data as { name: string }).name },
  });

  revalidateCatalog(parsed.data.id);
  return { ok: true };
}

/**
 * Hard delete. ADMIN only, and the database refuses outright if any variant
 * carries inventory history — deactivation is the correct move there.
 */
export async function deleteProductAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("DELETE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: NOT_FOUND };

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return dbFailure(error, HAS_HISTORY);

  await logAction({
    userId: auth.user.id,
    action: "DELETE_PRODUCT",
    entityType: "product",
    entityId: parsed.data.id,
    metadata: { name: (existing as { name: string }).name },
  });

  revalidateCatalog();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                                  Variants                                  */
/* -------------------------------------------------------------------------- */

export async function createVariantAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction("CREATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = singleVariantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const variant = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_variant_with_stock", {
    p_variant: {
      product_id: variant.product_id,
      sku: variant.sku,
      barcode: variant.barcode,
      color: variant.color,
      size: variant.size,
      supplier_id: variant.supplier_id,
      purchase_price: String(variant.purchase_price),
      selling_price: String(variant.selling_price),
      initial_stock: variant.initial_stock,
      is_active: variant.is_active,
    },
  });

  if (error || !data) return dbFailure(error, "تعذر حفظ الموديل.");

  const variantId = data as unknown as string;

  await logAction({
    userId: auth.user.id,
    action: "CREATE_VARIANT",
    entityType: "product_variant",
    entityId: variantId,
    metadata: {
      product_id: variant.product_id,
      sku: variant.sku,
      initial_stock: variant.initial_stock,
    },
  });

  revalidateCatalog(variant.product_id);
  return { ok: true, data: { id: variantId } };
}

export async function updateVariantAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const schema = variantSchema.extend({
    id: z.string().uuid(),
    product_id: z.string().uuid(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  // initial_stock is only meaningful at creation time; stock changes after
  // that must go through the ledger.
  const { id, product_id, initial_stock: _initialStock, ...values } = parsed.data;
  void _initialStock;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFailure(error, "تعذر حفظ الموديل.");
  if (!data) return { ok: false, error: NOT_FOUND };

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_VARIANT",
    entityType: "product_variant",
    entityId: id,
    metadata: {
      sku: values.sku,
      purchase_price: values.purchase_price,
      selling_price: values.selling_price,
    },
  });

  revalidateCatalog(product_id);
  revalidatePath(`/products/${product_id}/variants/${id}`);
  return { ok: true };
}

export async function setVariantActiveAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z
    .object({ id: z.string().uuid(), is_active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id)
    .select("id, product_id, sku")
    .maybeSingle();

  if (error) return dbFailure(error, "تعذر حفظ الموديل.");
  if (!data) return { ok: false, error: NOT_FOUND };

  const row = data as { product_id: string; sku: string };

  await logAction({
    userId: auth.user.id,
    action: parsed.data.is_active ? "ACTIVATE_VARIANT" : "DEACTIVATE_VARIANT",
    entityType: "product_variant",
    entityId: parsed.data.id,
    metadata: { sku: row.sku },
  });

  revalidateCatalog(row.product_id);
  return { ok: true };
}

export async function deleteVariantAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("DELETE_PRODUCTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id, product_id, sku")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: NOT_FOUND };
  const row = existing as { product_id: string; sku: string };

  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return dbFailure(error, HAS_HISTORY);

  await logAction({
    userId: auth.user.id,
    action: "DELETE_VARIANT",
    entityType: "product_variant",
    entityId: parsed.data.id,
    metadata: { sku: row.sku },
  });

  revalidateCatalog(row.product_id);
  return { ok: true };
}
