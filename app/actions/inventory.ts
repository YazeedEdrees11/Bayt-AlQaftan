"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import {
  NOT_FOUND,
  UPDATE_STOCK_ERROR,
  translateDbError,
} from "@/lib/catalog/errors";
import { stockAdjustmentSchema } from "@/lib/validation/catalog";
import type { ActionResult } from "./auth";

/**
 * Stock movements.
 *
 * There is deliberately no "set stock to N" action. Every change is an entry
 * in the append-only ledger, so the reason and the author survive forever, and
 * the database refuses any movement that would drive the balance negative.
 */
export async function adjustStockAction(
  input: unknown,
): Promise<ActionResult<{ newStock: number }>> {
  const auth = await authorizeAction("MANAGE_INVENTORY");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = stockAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "يرجى التحقق من البيانات المدخلة",
      fieldErrors,
    };
  }

  const { variant_id, transaction_type, quantity, notes } = parsed.data;
  const supabase = await createClient();

  const { data: variant, error: variantError } = await supabase
    .from("product_variants")
    .select("id, product_id, sku")
    .eq("id", variant_id)
    .maybeSingle();

  if (variantError) {
    const translated = translateDbError(variantError, UPDATE_STOCK_ERROR);
    return { ok: false, error: translated.error };
  }
  if (!variant) return { ok: false, error: NOT_FOUND };

  const row = variant as { product_id: string; sku: string };

  // `created_by` must be the caller: the RLS policy on inventory_transactions
  // checks it, so a forged id is rejected by the database too.
  const { error } = await supabase.from("inventory_transactions").insert({
    variant_id,
    transaction_type,
    quantity,
    // Manual corrections act on sellable stock. Damaged units are moved with
    // `record_stock_damage`, which keeps the two buckets from mixing.
    stock_state: "AVAILABLE",
    notes,
    reference_type: null,
    reference_id: null,
    created_by: auth.user.id,
  });

  if (error) {
    const translated = translateDbError(error, UPDATE_STOCK_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field
        ? { [translated.field]: translated.error }
        : undefined,
    };
  }

  const { data: stock } = await supabase
    .from("variant_stock")
    .select("current_stock")
    .eq("variant_id", variant_id)
    .maybeSingle();

  await logAction({
    userId: auth.user.id,
    action: transaction_type,
    entityType: "inventory",
    entityId: variant_id,
    metadata: {
      sku: row.sku,
      quantity,
      reason: notes,
      new_stock: stock?.current_stock ?? null,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath(`/products/${row.product_id}`);
  revalidatePath(`/products/${row.product_id}/variants/${variant_id}`);

  return { ok: true, data: { newStock: stock?.current_stock ?? 0 } };
}
