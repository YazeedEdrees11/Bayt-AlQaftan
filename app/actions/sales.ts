"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { callIdempotent } from "@/lib/idempotency";
import {
  CUSTOMER_SAVE_ERROR,
  ROLLED_BACK_ERROR,
  SALE_PAYMENT_ERROR,
  SALE_SAVE_ERROR,
  extractShortSkus,
  translateSaleError,
} from "@/lib/sales/errors";
import {
  SALE_RECEIPTS_BUCKET,
  buildSaleReceiptPath,
  validateSaleReceipt,
} from "@/lib/sales/receipts";
import {
  cancelSaleSchema,
  completeSaleSchema,
  createSaleSchema,
  customerSchema,
  customerUpdateSchema,
  deleteDraftSaleSchema,
  salePaymentSchema,
} from "@/lib/validation/sales";
import { searchSellableVariants } from "@/lib/sales/queries";
import type { ActionResult } from "./auth";
import type { SalePaymentLineInput } from "@/lib/validation/sales";
import type {
  CancelSaleResult,
  CreateSaleResult,
  SellableVariant,
} from "@/types/sales";

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

function revalidateSale(saleId?: string, customerId?: string | null) {
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  if (saleId) revalidatePath(`/sales/${saleId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

/** Maps a validated payment line onto the shape the RPC expects. */
function toRpcPayment(payment: SalePaymentLineInput) {
  return {
    amount: String(payment.amount),
    payment_method: payment.payment_method,
    payment_date: payment.payment_date,
    bank_name: payment.bank_name,
    transfer_reference: payment.transfer_reference,
    receipt_image_path: payment.receipt_image_path,
    notes: payment.notes,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Customers                                  */
/* -------------------------------------------------------------------------- */

export async function createCustomerAction(
  input: unknown,
): Promise<ActionResult<{ id: string; customer_number: string; name: string }>> {
  const auth = await authorizeAction("CREATE_CUSTOMERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p_payload: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      address: parsed.data.address,
      notes: parsed.data.notes,
      is_active: parsed.data.is_active,
    },
  });

  if (error || !data) {
    const translated = translateSaleError(error, CUSTOMER_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as { id: string; customer_number: string };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_CUSTOMER",
    entityType: "customer",
    entityId: result.id,
    metadata: { customer_number: result.customer_number, name: parsed.data.name },
  });

  revalidatePath("/customers");
  return {
    ok: true,
    data: { ...result, name: parsed.data.name },
  };
}

export async function updateCustomerAction(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction("UPDATE_CUSTOMERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = customerUpdateSchema.safeParse(input);
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
    .from("customers")
    .update(values)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    const translated = translateSaleError(error, CUSTOMER_SAVE_ERROR);
    return { ok: false, error: translated.error };
  }
  if (!data) return { ok: false, error: "العميل غير موجود." };

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_CUSTOMER",
    entityType: "customer",
    entityId: id,
    metadata: { name: values.name, is_active: values.is_active },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true };
}

/** Customers are deactivated, never deleted — their sales must keep resolving. */
export async function setCustomerActiveAction(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction("MANAGE_CUSTOMERS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = z
    .object({ id: z.string().uuid(), is_active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id)
    .select("id, name")
    .maybeSingle();

  if (error) {
    const translated = translateSaleError(error, CUSTOMER_SAVE_ERROR);
    return { ok: false, error: translated.error };
  }
  if (!data) return { ok: false, error: "العميل غير موجود." };

  await logAction({
    userId: auth.user.id,
    action: parsed.data.is_active ? "ACTIVATE_CUSTOMER" : "DEACTIVATE_CUSTOMER",
    entityType: "customer",
    entityId: parsed.data.id,
    metadata: { name: (data as { name: string }).name },
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.id}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                              Receipt upload                                */
/* -------------------------------------------------------------------------- */

export async function uploadSaleReceiptAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeAction("CREATE_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const key = formData.get("key");
  const file = formData.get("file");

  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  if (!(file instanceof File)) return { ok: false, error: "لم يتم اختيار ملف." };

  const validation = validateSaleReceipt({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const path = buildSaleReceiptPath(key.replace(/[^a-zA-Z0-9-]/g, "") || "misc", file.name);
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(SALE_RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });

  if (error) {
    console.error("[sales] receipt upload failed:", error.message);
    return { ok: false, error: "تعذر رفع الإيصال." };
  }

  return { ok: true, data: { path } };
}

/* -------------------------------------------------------------------------- */
/*                                   Sales                                    */
/* -------------------------------------------------------------------------- */

/**
 * Records a sale.
 *
 * One RPC, one transaction: the document, its items, every tender, the stock
 * deduction and the customer charge either all land or none do. Stock is
 * re-validated under a row lock inside that transaction, so two tills cannot
 * both sell the last piece.
 */
export async function createSaleAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<CreateSaleResult>> {
  const auth = await authorizeAction("CREATE_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "create_sale", {
      customer_id: payload.customer_id,
      sale_date: payload.sale_date,
      discount: String(payload.discount),
      notes: payload.notes,
      status: payload.status,
      items: payload.items.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: String(item.unit_price),
      })),
      // A draft takes no money.
      payments:
        payload.status === "DRAFT"
          ? []
          : payload.payments.filter((p) => p.amount > 0).map(toRpcPayment),
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateSaleError(error, SALE_SAVE_ERROR);
    const short = extractShortSkus(error);
    return {
      ok: false,
      error: short.length ? `${translated.error} الموديلات: ${short.join("، ")}` : translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as CreateSaleResult;

  await logAction({
    userId: auth.user.id,
    action: payload.status === "DRAFT" ? "CREATE_SALE_DRAFT" : "CREATE_SALE",
    entityType: "sale",
    entityId: result.id,
    metadata: {
      sale_number: result.sale_number,
      customer_id: payload.customer_id,
      items: result.item_count,
      subtotal: result.subtotal,
      discount: result.discount,
      total: result.total_amount,
      paid: result.paid_amount,
      remaining: result.remaining_amount,
      gross_profit: result.gross_profit,
      status: result.status,
    },
  });

  revalidateSale(result.id, payload.customer_id);
  return { ok: true, data: result };
}

export async function completeSaleAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<CreateSaleResult>> {
  const auth = await authorizeAction("CREATE_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = completeSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await callIdempotent(supabase, "complete_sale", {
      sale_id: parsed.data.sale_id,
      payments: parsed.data.payments.filter((p) => p.amount > 0).map(toRpcPayment),
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateSaleError(error, SALE_SAVE_ERROR);
    const short = extractShortSkus(error);
    return {
      ok: false,
      error: short.length ? `${translated.error} الموديلات: ${short.join("، ")}` : translated.error,
    };
  }

  const result = data as unknown as CreateSaleResult;

  await logAction({
    userId: auth.user.id,
    action: "COMPLETE_SALE",
    entityType: "sale",
    entityId: result.id,
    metadata: {
      sale_number: result.sale_number,
      total: result.total_amount,
      paid: result.paid_amount,
      remaining: result.remaining_amount,
      gross_profit: result.gross_profit,
    },
  });

  revalidateSale(result.id);
  return { ok: true, data: result };
}

export async function addSalePaymentAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<{ paid: number; remaining: number }>> {
  const auth = await authorizeAction("CREATE_CUSTOMER_PAYMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = salePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payment = parsed.data;
  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "add_sale_payment", {
      sale_id: payment.sale_id,
      amount: String(payment.amount),
      payment_method: payment.payment_method,
      payment_date: payment.payment_date,
      bank_name: payment.bank_name,
      transfer_reference: payment.transfer_reference,
      receipt_image_path: payment.receipt_image_path,
      notes: payment.notes,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateSaleError(error, SALE_PAYMENT_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    sale_id: string;
    paid_amount: number;
    remaining_amount: number;
    payment_status: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_CUSTOMER_PAYMENT",
    entityType: "sale_payment",
    entityId: payment.sale_id,
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

  revalidateSale(payment.sale_id);
  return { ok: true, data: { paid: result.paid_amount, remaining: result.remaining_amount } };
}

/**
 * Cancels a completed sale.
 *
 * Stock goes back with `SALE_REVERSAL` rows and the customer charge is
 * reversed by an `ADJUSTMENT`. Money already collected stays on the ledger, so
 * it shows as credit held for the customer until it is refunded — inventing a
 * refund entry would claim cash left the till when it did not.
 */
export async function cancelSaleAction(
  input: unknown,
): Promise<ActionResult<CancelSaleResult>> {
  const auth = await authorizeAction("CANCEL_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_sale", {
    p_sale_id: parsed.data.sale_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translateSaleError(error, ROLLED_BACK_ERROR);
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as CancelSaleResult;

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_SALE",
    entityType: "sale",
    entityId: result.id,
    metadata: {
      sale_number: result.sale_number,
      reversed_amount: result.reversed_amount,
      customer_credit: result.customer_credit,
      reason: parsed.data.reason,
    },
  });

  revalidateSale(result.id);
  return { ok: true, data: result };
}

export async function deleteDraftSaleAction(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction("CREATE_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = deleteDraftSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_draft_sale", {
    p_sale_id: parsed.data.sale_id,
  });

  if (error || !data) {
    const translated = translateSaleError(error, ROLLED_BACK_ERROR);
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as { id: string; sale_number: string };

  await logAction({
    userId: auth.user.id,
    action: "DELETE_SALE_DRAFT",
    entityType: "sale",
    entityId: result.id,
    metadata: { sale_number: result.sale_number },
  });

  revalidateSale();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                            Till-side lookups                               */
/* -------------------------------------------------------------------------- */

export async function searchSellableVariantsAction(
  search: string,
): Promise<ActionResult<{ variants: SellableVariant[] }>> {
  const auth = await authorizeAction("CREATE_SALES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const term = typeof search === "string" ? search.trim().slice(0, 100) : "";
  return { ok: true, data: { variants: await searchSellableVariants(term, 20) } };
}
