"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import {
  NOT_FOUND,
  SAVE_SUPPLIER_ERROR,
  translateDbError,
} from "@/lib/catalog/errors";
import { supplierSchema, supplierUpdateSchema } from "@/lib/validation/catalog";
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

function dbFailure(error: PostgrestError | null): ActionResult {
  const translated = translateDbError(error, SAVE_SUPPLIER_ERROR);
  return {
    ok: false,
    error: translated.error,
    fieldErrors: translated.field
      ? { [translated.field]: translated.error }
      : undefined,
  };
}

export async function createSupplierAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction("CREATE_SUPPLIERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error || !data) return dbFailure(error);

  await logAction({
    userId: auth.user.id,
    action: "CREATE_SUPPLIER",
    entityType: "supplier",
    entityId: data.id,
    metadata: { name: parsed.data.name, phone: parsed.data.phone },
  });

  revalidatePath("/suppliers");
  return { ok: true, data: { id: data.id } };
}

export async function updateSupplierAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_SUPPLIERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = supplierUpdateSchema.safeParse(input);
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
    .from("suppliers")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return dbFailure(error);
  if (!data) return { ok: false, error: NOT_FOUND };

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_SUPPLIER",
    entityType: "supplier",
    entityId: id,
    metadata: { name: values.name, is_active: values.is_active },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: true };
}

/**
 * Soft delete. Suppliers are never removed once purchases reference them, so
 * deactivation is the only "delete" the UI offers.
 */
export async function setSupplierActiveAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_SUPPLIERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z
    .object({ id: z.string().uuid(), is_active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id)
    .select("id, name")
    .maybeSingle();

  if (error) return dbFailure(error);
  if (!data) return { ok: false, error: NOT_FOUND };

  await logAction({
    userId: auth.user.id,
    action: parsed.data.is_active ? "ACTIVATE_SUPPLIER" : "DEACTIVATE_SUPPLIER",
    entityType: "supplier",
    entityId: parsed.data.id,
    metadata: { name: (data as { name: string }).name },
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${parsed.data.id}`);
  return { ok: true };
}

/**
 * Hard delete — ADMIN only, and only while nothing references the supplier.
 * Variants keep their `supplier_id` as NULL via ON DELETE SET NULL, so this
 * refuses when any variant still points at it rather than silently unlinking.
 */
export async function deleteSupplierAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("DELETE_SUPPLIERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();

  const { count } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", parsed.data.id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "لا يمكن حذف مورد مرتبط بموديلات. يمكنك تعطيله بدلاً من ذلك.",
    };
  }

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: NOT_FOUND };

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return dbFailure(error);

  await logAction({
    userId: auth.user.id,
    action: "DELETE_SUPPLIER",
    entityType: "supplier",
    entityId: parsed.data.id,
    metadata: { name: (existing as { name: string }).name },
  });

  revalidatePath("/suppliers");
  return { ok: true };
}
