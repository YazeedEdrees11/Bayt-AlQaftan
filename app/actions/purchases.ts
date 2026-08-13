"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { callIdempotent } from "@/lib/idempotency";
import {
  PAYMENT_SAVE_ERROR,
  PURCHASE_SAVE_ERROR,
  ROLLED_BACK_ERROR,
  extractBlockedSkus,
  translatePurchaseError,
} from "@/lib/purchasing/errors";
import {
  PAYMENT_RECEIPTS_BUCKET,
  buildReceiptStoragePath,
  validateReceiptFile,
} from "@/lib/purchasing/receipts";
import {
  cancelPurchaseSchema,
  completePurchaseSchema,
  createPurchaseSchema,
  deleteDraftSchema,
  purchasePaymentSchema,
} from "@/lib/validation/purchasing";
import {
  getLastPurchaseCost,
  searchPurchasableVariants,
} from "@/lib/purchasing/queries";
import type { ActionResult } from "./auth";
import type {
  CancelPurchaseResult,
  CreatePurchaseResult,
  PurchasableVariant,
} from "@/types/purchasing";

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

function revalidatePurchase(purchaseId?: string, supplierId?: string) {
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  if (purchaseId) revalidatePath(`/purchases/${purchaseId}`);
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
}

/* -------------------------------------------------------------------------- */
/*                              Receipt upload                                */
/* -------------------------------------------------------------------------- */

/**
 * Uploads a bank-transfer receipt and returns its storage path.
 *
 * Run before saving the payment so the path can be written in the same
 * transaction as the rest of the record.
 */
export async function uploadReceiptAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeAction("CREATE_SUPPLIER_PAYMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const supplierId = formData.get("supplier_id");
  const file = formData.get("file");

  if (typeof supplierId !== "string" || !z.string().uuid().safeParse(supplierId).success) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: "لم يتم اختيار ملف." };
  }

  const validation = validateReceiptFile({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const path = buildReceiptStoragePath(supplierId, file.name);
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(PAYMENT_RECEIPTS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    console.error("[purchasing] receipt upload failed:", error.message);
    return { ok: false, error: "تعذر رفع الإيصال." };
  }

  return { ok: true, data: { path } };
}

/* -------------------------------------------------------------------------- */
/*                             Create a purchase                              */
/* -------------------------------------------------------------------------- */

/**
 * Records a purchase.
 *
 * One RPC call, one database transaction: the document, its items, the stock
 * movements, the opening payment and both supplier-ledger entries either all
 * land or none do. Totals are recomputed server-side from the items — whatever
 * the browser calculated is only ever a preview.
 */
export async function createPurchaseAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<CreatePurchaseResult>> {
  const auth = await authorizeAction("CREATE_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;

  // A payment of zero is the same as no payment at all.
  const payment =
    payload.payment && payload.payment.amount > 0
      ? {
          amount: String(payload.payment.amount),
          payment_method: payload.payment.payment_method,
          payment_date: payload.payment.payment_date,
          bank_name: payload.payment.bank_name,
          transfer_reference: payload.payment.transfer_reference,
          receipt_image_path: payload.payment.receipt_image_path,
          notes: payload.payment.notes,
        }
      : null;

  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "create_purchase", {
      supplier_id: payload.supplier_id,
      purchase_date: payload.purchase_date,
      discount: String(payload.discount),
      notes: payload.notes,
      update_variant_cost: payload.update_variant_cost,
      status: payload.status,
      items: payload.items.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_cost: String(item.unit_cost),
      })),
      // A draft records the document only; nothing is paid against it.
      payment: payload.status === "DRAFT" ? null : payment,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translatePurchaseError(error, PURCHASE_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field
        ? { [translated.field]: translated.error }
        : undefined,
    };
  }

  const result = data as unknown as CreatePurchaseResult;

  await logAction({
    userId: auth.user.id,
    action: payload.status === "DRAFT" ? "CREATE_PURCHASE_DRAFT" : "CREATE_PURCHASE",
    entityType: "purchase",
    entityId: result.id,
    metadata: {
      purchase_number: result.purchase_number,
      supplier_id: payload.supplier_id,
      items: result.item_count,
      subtotal: result.subtotal,
      discount: result.discount,
      total: result.total_amount,
      paid: result.paid_amount,
      remaining: result.remaining_amount,
      payment_method: payment?.payment_method ?? null,
      status: payload.status,
    },
  });

  revalidatePurchase(result.id, payload.supplier_id);
  return { ok: true, data: result };
}

/* -------------------------------------------------------------------------- */
/*                            Supplier payment                                */
/* -------------------------------------------------------------------------- */

export async function addPurchasePaymentAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<{ paid: number; remaining: number }>> {
  const auth = await authorizeAction("CREATE_SUPPLIER_PAYMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = purchasePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payment = parsed.data;
  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "add_purchase_payment", {
      purchase_id: payment.purchase_id,
      amount: String(payment.amount),
      payment_method: payment.payment_method,
      payment_date: payment.payment_date,
      bank_name: payment.bank_name,
      transfer_reference: payment.transfer_reference,
      receipt_image_path: payment.receipt_image_path,
      notes: payment.notes,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translatePurchaseError(error, PAYMENT_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field
        ? { [translated.field]: translated.error }
        : undefined,
    };
  }

  const result = data as unknown as {
    purchase_id: string;
    paid_amount: number;
    remaining_amount: number;
    payment_status: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_SUPPLIER_PAYMENT",
    entityType: "purchase_payment",
    entityId: payment.purchase_id,
    metadata: {
      amount: payment.amount,
      payment_method: payment.payment_method,
      bank_name: payment.bank_name,
      transfer_reference: payment.transfer_reference,
      paid_total: result.paid_amount,
      remaining: result.remaining_amount,
      payment_status: result.payment_status,
    },
  });

  // The supplier page is revalidated by id when the caller knows it.
  revalidatePurchase(payment.purchase_id);
  revalidatePath("/suppliers", "layout");

  return {
    ok: true,
    data: { paid: result.paid_amount, remaining: result.remaining_amount },
  };
}

/* -------------------------------------------------------------------------- */
/*                            Cancel a purchase                               */
/* -------------------------------------------------------------------------- */

/**
 * Cancels a completed purchase.
 *
 * Nothing is deleted: stock is reversed with PURCHASE_REVERSAL rows and the
 * supplier charge with an ADJUSTMENT. Payments already made stay on the ledger,
 * so any money already handed over shows up as a credit held with the supplier
 * rather than quietly vanishing. Refunding that credit is a future workflow.
 */
export async function cancelPurchaseAction(
  input: unknown,
): Promise<ActionResult<CancelPurchaseResult>> {
  const auth = await authorizeAction("CANCEL_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cancel_purchase", {
    p_purchase_id: parsed.data.purchase_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translatePurchaseError(error, ROLLED_BACK_ERROR);
    const blocked = extractBlockedSkus(error);
    return {
      ok: false,
      error: blocked.length
        ? `${translated.error} الموديلات: ${blocked.join("، ")}`
        : translated.error,
    };
  }

  const result = data as unknown as CancelPurchaseResult;

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_PURCHASE",
    entityType: "purchase",
    entityId: result.id,
    metadata: {
      purchase_number: result.purchase_number,
      reversed_amount: result.reversed_amount,
      supplier_credit: result.supplier_credit,
      reason: parsed.data.reason,
    },
  });

  revalidatePurchase(result.id);
  revalidatePath("/suppliers", "layout");

  return { ok: true, data: result };
}

/* -------------------------------------------------------------------------- */
/*                          Draft lifecycle                                   */
/* -------------------------------------------------------------------------- */

/**
 * Promotes a draft to COMPLETED.
 *
 * This is the moment the goods are treated as received: stock rises, the
 * supplier is charged, and any opening payment is recorded — all in one
 * transaction, exactly as a direct COMPLETED purchase would.
 */
export async function completePurchaseAction(
  input: unknown,
): Promise<ActionResult<CreatePurchaseResult>> {
  const auth = await authorizeAction("UPDATE_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = completePurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const { purchase_id, payment, update_variant_cost } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("complete_purchase", {
    p_payload: {
      purchase_id,
      update_variant_cost,
      payment:
        payment && payment.amount > 0
          ? {
              amount: String(payment.amount),
              payment_method: payment.payment_method,
              payment_date: payment.payment_date,
              bank_name: payment.bank_name,
              transfer_reference: payment.transfer_reference,
              receipt_image_path: payment.receipt_image_path,
              notes: payment.notes,
            }
          : null,
    },
  });

  if (error || !data) {
    const translated = translatePurchaseError(error, PURCHASE_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field
        ? { [translated.field]: translated.error }
        : undefined,
    };
  }

  const result = data as unknown as CreatePurchaseResult;

  await logAction({
    userId: auth.user.id,
    action: "COMPLETE_PURCHASE",
    entityType: "purchase",
    entityId: result.id,
    metadata: {
      purchase_number: result.purchase_number,
      total: result.total_amount,
      paid: result.paid_amount,
      remaining: result.remaining_amount,
      payment_status: result.payment_status,
    },
  });

  revalidatePurchase(result.id);
  revalidatePath("/suppliers", "layout");
  return { ok: true, data: result };
}

/**
 * Deletes a draft outright.
 *
 * Safe only because a draft has never written to a ledger — the database
 * re-checks that before removing anything. Completed purchases must be
 * cancelled instead, which preserves their history.
 */
export async function deleteDraftPurchaseAction(
  input: unknown,
): Promise<ActionResult> {
  const auth = await authorizeAction("CANCEL_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = deleteDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_draft_purchase", {
    p_purchase_id: parsed.data.purchase_id,
  });

  if (error || !data) {
    const translated = translatePurchaseError(error, ROLLED_BACK_ERROR);
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as { id: string; purchase_number: string };

  await logAction({
    userId: auth.user.id,
    action: "DELETE_PURCHASE_DRAFT",
    entityType: "purchase",
    entityId: result.id,
    metadata: { purchase_number: result.purchase_number },
  });

  revalidatePurchase();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                          Line-item variant picker                          */
/* -------------------------------------------------------------------------- */

/**
 * Searches active variants for the purchase line-item picker.
 *
 * Exposed as an action so the picker can query as the user types without
 * shipping the whole catalog to the browser.
 */
export async function searchVariantsAction(
  search: string,
): Promise<ActionResult<{ variants: PurchasableVariant[] }>> {
  const auth = await authorizeAction("CREATE_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const term = typeof search === "string" ? search.trim().slice(0, 100) : "";
  const variants = await searchPurchasableVariants(term, 20);

  return { ok: true, data: { variants } };
}

/** The cost paid the last time this variant was received, if ever. */
export async function getLastCostAction(
  variantId: unknown,
): Promise<ActionResult<{ unit_cost: number; purchase_date: string } | null>> {
  const auth = await authorizeAction("CREATE_PURCHASES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z.string().uuid().safeParse(variantId);
  if (!parsed.success) return { ok: true, data: null };

  const last = await getLastPurchaseCost(parsed.data);
  return { ok: true, data: last };
}
