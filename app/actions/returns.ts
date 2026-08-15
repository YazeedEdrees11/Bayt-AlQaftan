"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { callIdempotent } from "@/lib/idempotency";
import {
  ADJUSTMENT_SAVE_ERROR,
  DAMAGE_SAVE_ERROR,
  EXCHANGE_SAVE_ERROR,
  REFUND_SAVE_ERROR,
  RETURN_SAVE_ERROR,
  translateReturnError,
} from "@/lib/returns/errors";
import {
  REFUND_RECEIPTS_BUCKET,
  buildRefundReceiptPath,
  validateRefundReceipt,
} from "@/lib/returns/receipts";
import {
  addRefundSchema,
  cancelAdjustmentSchema,
  cancelExchangeSchema,
  cancelReturnSchema,
  createAdjustmentSchema,
  createExchangeSchema,
  createReturnSchema,
  recordDamageSchema,
} from "@/lib/validation/returns";
import {
  getReturnableItems,
  searchCountableVariants,
} from "@/lib/returns/queries";
import { searchSellableVariants } from "@/lib/sales/queries";
import type { ActionResult } from "./auth";
import type { ReturnableSaleItem } from "@/types/returns";
import type { SellableVariant } from "@/types/sales";

/** One row of the stock-count product lookup. */
type CountableVariant = {
  variant_id: string;
  product_name: string;
  sku: string;
  color: string | null;
  size: string | null;
  current_stock: number;
  is_active: boolean;
  image_url: string | null;
};

/** Minimal sale shape the return/exchange pickers need. */
type SaleLookupRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number;
  item_count: number;
};

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

/**
 * A return moves stock, money and a customer's balance at once, so almost every
 * screen in the app can be stale afterwards.
 */
function revalidateReturn(returnId?: string, saleId?: string, customerId?: string | null) {
  revalidatePath("/returns");
  revalidatePath("/exchanges");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/sales");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  if (returnId) revalidatePath(`/returns/${returnId}`);
  if (saleId) revalidatePath(`/sales/${saleId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

function revalidateInventory(adjustmentId?: string) {
  revalidatePath("/inventory");
  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/damaged");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  if (adjustmentId) revalidatePath(`/inventory/adjustments/${adjustmentId}`);
}

type ReturnResult = {
  id: string;
  return_number: string;
  sale_id: string;
  sale_number: string;
  status: string;
  refund_status: string;
  subtotal: number;
  discount: number;
  refund_amount: number;
  refunded_amount: number;
  total_cost: number;
  profit_reversal: number;
  item_count: number;
};

type ExchangeResult = {
  id: string;
  exchange_number: string;
  sale_number: string;
  returned_amount: number;
  new_items_amount: number;
  difference_amount: number;
  difference_direction: string;
  settlement_method: string | null;
  status: string;
};

type AdjustmentResult = {
  id: string;
  adjustment_number: string;
  reason: string;
  items_count: number;
  total_increase: number;
  total_decrease: number;
};

/* -------------------------------------------------------------------------- */
/*                                  Returns                                   */
/* -------------------------------------------------------------------------- */

export async function createReturnAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<ReturnResult>> {
  const auth = await authorizeAction("CREATE_RETURNS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createReturnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;

  // Refunds are the money side and carry their own permission, so a staff
  // member's return simply arrives unsettled for a manager to pay out.
  if (payload.refunds.length > 0) {
    const canRefund = await authorizeAction("CREATE_REFUNDS");
    if (!canRefund.ok) return { ok: false, error: canRefund.error };
  }

  const supabase = await createClient();
  const { data, error } = await callIdempotent(supabase, "create_sales_return", {
      sale_id: payload.sale_id,
      return_date: payload.return_date,
      reason: payload.reason,
      notes: payload.notes,
      items: payload.items.map((item) => ({
        sale_item_id: item.sale_item_id,
        quantity: item.quantity,
        condition: item.condition,
        reason: item.reason,
      })),
      refunds: payload.refunds.map((refund) => ({
        refund_method: refund.refund_method,
        amount: refund.amount,
        refund_date: refund.refund_date,
        bank_name: refund.bank_name,
        transfer_reference: refund.transfer_reference,
        receipt_image_path: refund.receipt_image_path,
        notes: refund.notes,
      })),
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateReturnError(error, RETURN_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as ReturnResult;

  await logAction({
    userId: auth.user.id,
    action: "CREATE_RETURN",
    entityType: "sales_return",
    entityId: result.id,
    metadata: {
      return_number: result.return_number,
      sale_number: result.sale_number,
      reason: payload.reason ?? undefined,
      items: result.item_count,
      quantities: payload.items.map((i) => ({
        sale_item_id: i.sale_item_id,
        quantity: i.quantity,
        condition: i.condition,
      })),
      refund_amount: result.refund_amount,
      refunded_amount: result.refunded_amount,
      refund_status: result.refund_status,
      profit_reversal: result.profit_reversal,
    },
  });

  revalidateReturn(result.id, result.sale_id);
  return { ok: true, data: result };
}

export async function addRefundAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<{ return_id: string; refund_status: string; refunded_amount: number }>> {
  const auth = await authorizeAction("CREATE_REFUNDS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = addRefundSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "add_return_refund", {
      return_id: payload.return_id,
      refund_method: payload.refund_method,
      amount: payload.amount,
      refund_date: payload.refund_date,
      bank_name: payload.bank_name,
      transfer_reference: payload.transfer_reference,
      receipt_image_path: payload.receipt_image_path,
      notes: payload.notes,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateReturnError(error, REFUND_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    return_id: string;
    return_number: string;
    refund_amount: number;
    refunded_amount: number;
    refund_status: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_REFUND",
    entityType: "sales_return",
    entityId: result.return_id,
    metadata: {
      return_number: result.return_number,
      method: payload.refund_method,
      amount: payload.amount,
      bank_name: payload.bank_name ?? undefined,
      transfer_reference: payload.transfer_reference ?? undefined,
      refunded_total: result.refunded_amount,
      refund_status: result.refund_status,
    },
  });

  revalidateReturn(result.return_id);
  return {
    ok: true,
    data: {
      return_id: result.return_id,
      refund_status: result.refund_status,
      refunded_amount: result.refunded_amount,
    },
  };
}

export async function cancelReturnAction(
  input: unknown,
): Promise<ActionResult<{ id: string; return_number: string; reversed_amount: number }>> {
  const auth = await authorizeAction("CANCEL_RETURNS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelReturnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_sales_return", {
    p_return_id: parsed.data.return_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translateReturnError(error, "تعذر إلغاء المرتجع.");
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as {
    id: string;
    return_number: string;
    reversed_amount: number;
    refunded_amount: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_RETURN",
    entityType: "sales_return",
    entityId: result.id,
    metadata: {
      return_number: result.return_number,
      reversed_amount: result.reversed_amount,
      refunded_amount: result.refunded_amount,
      reason: parsed.data.reason,
    },
  });

  revalidateReturn(result.id);
  return { ok: true, data: result };
}

export async function uploadRefundReceiptAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeAction("CREATE_REFUNDS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const key = formData.get("key");
  const file = formData.get("file");

  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  if (!(file instanceof File)) return { ok: false, error: "لم يتم اختيار ملف." };

  const validation = validateRefundReceipt({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const path = buildRefundReceiptPath(
    key.replace(/[^a-zA-Z0-9-]/g, "") || "misc",
    file.name,
  );
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(REFUND_RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });

  if (error) {
    console.error("[returns] refund receipt upload failed:", error.message);
    return { ok: false, error: "تعذر رفع الإيصال." };
  }

  return { ok: true, data: { path } };
}

/* -------------------------------------------------------------------------- */
/*                                 Exchanges                                  */
/* -------------------------------------------------------------------------- */

export async function createExchangeAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<ExchangeResult>> {
  const auth = await authorizeAction("CREATE_EXCHANGES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createExchangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  const { data, error } = await callIdempotent(supabase, "create_exchange", {
      sale_id: payload.sale_id,
      exchange_date: payload.exchange_date,
      notes: payload.notes,
      returned_items: payload.returned_items.map((item) => ({
        sale_item_id: item.sale_item_id,
        quantity: item.quantity,
        condition: item.condition,
      })),
      new_items: payload.new_items.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      reason: payload.reason ?? undefined,
      settlement_method: payload.settlement_method,
      bank_name: payload.bank_name,
      transfer_reference: payload.transfer_reference,
      receipt_image_path: payload.receipt_image_path,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateReturnError(error, EXCHANGE_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as ExchangeResult;

  await logAction({
    userId: auth.user.id,
    action: "CREATE_EXCHANGE",
    entityType: "exchange",
    entityId: result.id,
    metadata: {
      exchange_number: result.exchange_number,
      sale_number: result.sale_number,
      returned: payload.returned_items,
      new_items: payload.new_items,
      returned_amount: result.returned_amount,
      new_items_amount: result.new_items_amount,
      difference_amount: result.difference_amount,
      difference_direction: result.difference_direction,
      settlement_method: result.settlement_method,
    },
  });

  revalidateReturn(undefined, payload.sale_id);
  return { ok: true, data: result };
}

export async function cancelExchangeAction(
  input: unknown,
): Promise<ActionResult<{ id: string; exchange_number: string }>> {
  const auth = await authorizeAction("CANCEL_EXCHANGES");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelExchangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_exchange", {
    p_exchange_id: parsed.data.exchange_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translateReturnError(error, "تعذر إلغاء الاستبدال.");
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as {
    id: string;
    exchange_number: string;
    difference_amount: number;
    difference_direction: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_EXCHANGE",
    entityType: "exchange",
    entityId: result.id,
    metadata: {
      exchange_number: result.exchange_number,
      difference_amount: result.difference_amount,
      difference_direction: result.difference_direction,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/exchanges");
  revalidatePath(`/exchanges/${result.id}`);
  revalidateReturn();
  return { ok: true, data: result };
}

/* -------------------------------------------------------------------------- */
/*                            Inventory adjustments                           */
/* -------------------------------------------------------------------------- */

export async function createAdjustmentAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<AdjustmentResult>> {
  const auth = await authorizeAction("CREATE_INVENTORY_ADJUSTMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = createAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  // Only the counted figure is sent. The system figure is read inside the
  // transaction under the variant's lock, so a stale screen cannot overwrite
  // movements that happened while the count was being typed.
  const { data, error } = await callIdempotent(supabase, "create_inventory_adjustment", {
      adjustment_date: payload.adjustment_date,
      reason: payload.reason,
      notes: payload.notes,
      items: payload.items.map((item) => ({
        variant_id: item.variant_id,
        actual_quantity: item.actual_quantity,
        reason: item.reason,
      })),
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateReturnError(error, ADJUSTMENT_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as AdjustmentResult;

  await logAction({
    userId: auth.user.id,
    action: "CREATE_INVENTORY_ADJUSTMENT",
    entityType: "inventory_adjustment",
    entityId: result.id,
    metadata: {
      adjustment_number: result.adjustment_number,
      reason: result.reason,
      items: result.items_count,
      counted: payload.items,
      total_increase: result.total_increase,
      total_decrease: result.total_decrease,
    },
  });

  revalidateInventory(result.id);
  return { ok: true, data: result };
}

export async function cancelAdjustmentAction(
  input: unknown,
): Promise<ActionResult<{ id: string; adjustment_number: string }>> {
  const auth = await authorizeAction("CANCEL_INVENTORY_ADJUSTMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_inventory_adjustment", {
    p_adjustment_id: parsed.data.adjustment_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translateReturnError(error, "تعذر إلغاء تعديل المخزون.");
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as { id: string; adjustment_number: string };

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_INVENTORY_ADJUSTMENT",
    entityType: "inventory_adjustment",
    entityId: result.id,
    metadata: {
      adjustment_number: result.adjustment_number,
      reason: parsed.data.reason,
    },
  });

  revalidateInventory(result.id);
  return { ok: true, data: result };
}

export async function recordDamageAction(
  input: unknown,
): Promise<ActionResult<{ variant_id: string; sku: string; quantity: number }>> {
  const auth = await authorizeAction("CREATE_INVENTORY_ADJUSTMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = recordDamageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_stock_damage", {
    p_payload: {
      variant_id: parsed.data.variant_id,
      quantity: parsed.data.quantity,
      notes: parsed.data.notes,
    },
  });

  if (error || !data) {
    const translated = translateReturnError(error, DAMAGE_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    variant_id: string;
    sku: string;
    quantity: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_DAMAGE_TRANSACTION",
    entityType: "product_variant",
    entityId: result.variant_id,
    metadata: {
      sku: result.sku,
      quantity: result.quantity,
      notes: parsed.data.notes ?? undefined,
    },
  });

  revalidateInventory();
  revalidatePath(`/products`);
  return { ok: true, data: result };
}

/* -------------------------------------------------------------------------- */
/*                              Lookups for the UI                            */
/* -------------------------------------------------------------------------- */

export async function searchSalesForReturnAction(
  search: string,
): Promise<ActionResult<{ sales: SaleLookupRow[] }>> {
  const auth = await authorizeAction("CREATE_RETURNS");
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  // Only completed sales can be returned against, so the picker never offers a
  // draft or a cancelled sale the RPC would then refuse.
  const { data, error } = await supabase.rpc("search_sales", {
    p_search: search.trim() || undefined,
    p_status: "COMPLETED",
    p_limit: 20,
  });

  if (error) {
    console.error("[returns] searchSalesForReturn:", error.message);
    return { ok: false, error: "تعذر البحث عن عمليات البيع." };
  }

  const sales = (data ?? []).map((row) => ({
    id: row.id,
    sale_number: row.sale_number,
    sale_date: row.sale_date,
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    total_amount: Number(row.total_amount),
    item_count: Number(row.item_count),
  }));

  return { ok: true, data: { sales } };
}

export async function getReturnableItemsAction(
  saleId: string,
): Promise<ActionResult<{ items: ReturnableSaleItem[] }>> {
  const auth = await authorizeAction("CREATE_RETURNS");
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const items = await getReturnableItems(saleId);
    return { ok: true, data: { items } };
  } catch (error) {
    console.error("[returns] getReturnableItemsAction:", error);
    return { ok: false, error: "تعذر تحميل بنود عملية البيع." };
  }
}

export async function searchExchangeVariantsAction(
  search: string,
): Promise<ActionResult<{ variants: SellableVariant[] }>> {
  const auth = await authorizeAction("CREATE_EXCHANGES");
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const variants = await searchSellableVariants(search);
    return { ok: true, data: { variants } };
  } catch (error) {
    console.error("[returns] searchExchangeVariantsAction:", error);
    return { ok: false, error: "تعذر البحث عن المنتجات." };
  }
}

export async function searchCountableVariantsAction(
  search: string,
): Promise<ActionResult<{ variants: CountableVariant[] }>> {
  const auth = await authorizeAction("CREATE_INVENTORY_ADJUSTMENTS");
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const variants = await searchCountableVariants(search);
    return { ok: true, data: { variants } };
  } catch (error) {
    console.error("[returns] searchCountableVariantsAction:", error);
    return { ok: false, error: "تعذر البحث عن المنتجات." };
  }
}
