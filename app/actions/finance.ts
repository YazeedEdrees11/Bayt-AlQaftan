"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/auth/require-auth";
import { logAction } from "@/lib/audit/log-action";
import { createClient } from "@/lib/supabase/server";
import { callIdempotent } from "@/lib/idempotency";
import {
  ACCOUNT_SAVE_ERROR,
  ADJUSTMENT_SAVE_ERROR,
  EXPENSE_SAVE_ERROR,
  TRANSFER_SAVE_ERROR,
  translateFinanceError,
} from "@/lib/finance/errors";
import {
  EXPENSE_RECEIPTS_BUCKET,
  buildExpenseReceiptPath,
  validateExpenseReceipt,
} from "@/lib/finance/receipts";
import {
  accountSchema,
  accountUpdateSchema,
  adjustmentSchema,
  cancelExpenseSchema,
  expenseSchema,
  transferSchema,
} from "@/lib/validation/finance";
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

/** Any money movement changes the whole financial picture, so refresh it all. */
function revalidateFinance(extra?: string) {
  revalidatePath("/finance");
  revalidatePath("/finance/accounts");
  revalidatePath("/finance/transactions");
  revalidatePath("/finance/cash-flow");
  revalidatePath("/finance/receivables");
  revalidatePath("/finance/payables");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  if (extra) revalidatePath(extra);
}

/* -------------------------------------------------------------------------- */
/*                                  Expenses                                  */
/* -------------------------------------------------------------------------- */

export async function createExpenseAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<
  ActionResult<{ id: string; expense_number: string; amount: number; status: string }>
> {
  const auth = await authorizeAction("CREATE_EXPENSE");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  // The expense row and its ledger row are written by one function, so an
  // account that cannot fund it leaves neither behind.
  const { data, error } = await callIdempotent(supabase, "create_expense", {
      expense_category_id: payload.expense_category_id,
      amount: payload.amount,
      expense_date: payload.expense_date,
      payment_method: payload.payment_method,
      financial_account_id: payload.financial_account_id,
      description: payload.description,
      receipt_image_path: payload.receipt_image_path,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateFinanceError(error, EXPENSE_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    id: string;
    expense_number: string;
    amount: number;
    financial_account_id: string;
    status: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_EXPENSE",
    entityType: "expense",
    entityId: result.id,
    metadata: {
      expense_number: result.expense_number,
      amount: result.amount,
      category_id: payload.expense_category_id,
      payment_method: payload.payment_method,
      financial_account_id: result.financial_account_id,
      description: payload.description ?? null,
    },
  });

  revalidateFinance(`/expenses/${result.id}`);
  return { ok: true, data: result };
}

export async function cancelExpenseAction(
  input: unknown,
): Promise<ActionResult<{ id: string; expense_number: string; amount: number }>> {
  const auth = await authorizeAction("CANCEL_EXPENSE");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = cancelExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_expense", {
    p_expense_id: parsed.data.expense_id,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    const translated = translateFinanceError(error, "تعذر إلغاء المصروف.");
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as {
    id: string;
    expense_number: string;
    amount: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "CANCEL_EXPENSE",
    entityType: "expense",
    entityId: result.id,
    metadata: {
      expense_number: result.expense_number,
      amount: result.amount,
      reason: parsed.data.reason,
    },
  });

  revalidateFinance(`/expenses/${result.id}`);
  return { ok: true, data: result };
}

export async function uploadExpenseReceiptAction(
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const auth = await authorizeAction("CREATE_EXPENSE");
  if (!auth.ok) return { ok: false, error: auth.error };

  const key = formData.get("key");
  const file = formData.get("file");
  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  if (!(file instanceof File)) return { ok: false, error: "لم يتم اختيار ملف." };

  const validation = validateExpenseReceipt({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  const path = buildExpenseReceiptPath(
    key.replace(/[^a-zA-Z0-9-]/g, "") || "misc",
    file.name,
  );
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });

  if (error) {
    console.error("[finance] expense receipt upload failed:", error.message);
    return { ok: false, error: "تعذر رفع الإيصال." };
  }
  return { ok: true, data: { path } };
}

/* -------------------------------------------------------------------------- */
/*                                  Accounts                                  */
/* -------------------------------------------------------------------------- */

export async function createAccountAction(
  input: unknown,
): Promise<ActionResult<{ id: string; account_number: string; name: string }>> {
  const auth = await authorizeAction("CREATE_ACCOUNT");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_financial_account", {
    p_payload: {
      name: payload.name,
      account_type: payload.account_type,
      opening_balance: payload.opening_balance ?? "0",
      is_default: payload.is_default,
      is_active: payload.is_active,
      notes: payload.notes,
    },
  });

  if (error || !data) {
    const translated = translateFinanceError(error, ACCOUNT_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    id: string;
    account_number: string;
    name: string;
    account_type: string;
    opening_balance: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_ACCOUNT",
    entityType: "financial_account",
    entityId: result.id,
    metadata: {
      account_number: result.account_number,
      name: result.name,
      account_type: result.account_type,
      opening_balance: result.opening_balance,
    },
  });

  // An opening balance is money appearing on the books, so it is logged
  // separately from the account that carries it.
  if (Number(result.opening_balance) > 0) {
    await logAction({
      userId: auth.user.id,
      action: "OPENING_BALANCE",
      entityType: "financial_account",
      entityId: result.id,
      metadata: { account_number: result.account_number, amount: result.opening_balance },
    });
  }

  revalidateFinance();
  return { ok: true, data: result };
}

export async function updateAccountAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeAction("UPDATE_ACCOUNT");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = accountUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_financial_account", {
    p_payload: parsed.data,
  });

  if (error || !data) {
    const translated = translateFinanceError(error, ACCOUNT_SAVE_ERROR);
    return { ok: false, error: translated.error };
  }

  await logAction({
    userId: auth.user.id,
    action: "UPDATE_ACCOUNT",
    entityType: "financial_account",
    entityId: parsed.data.id,
    metadata: {
      name: parsed.data.name,
      is_default: parsed.data.is_default,
      is_active: parsed.data.is_active,
    },
  });

  revalidateFinance(`/finance/accounts/${parsed.data.id}`);
  return { ok: true, data: { id: parsed.data.id } };
}

/* -------------------------------------------------------------------------- */
/*                          Transfers and adjustments                         */
/* -------------------------------------------------------------------------- */

export async function createTransferAction(
  input: unknown,
  idempotencyKey?: string,
): Promise<ActionResult<{ id: string; transfer_number: string; amount: number }>> {
  const auth = await authorizeAction("CREATE_TRANSFER");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const { data, error } = await callIdempotent(supabase, "create_financial_transfer", {
      from_account_id: payload.from_account_id,
      to_account_id: payload.to_account_id,
      amount: payload.amount,
      transfer_date: payload.transfer_date,
      notes: payload.notes,
    }, idempotencyKey);

  if (error || !data) {
    const translated = translateFinanceError(error, TRANSFER_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    id: string;
    transfer_number: string;
    amount: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_TRANSFER",
    entityType: "financial_transfer",
    entityId: result.id,
    metadata: {
      transfer_number: result.transfer_number,
      amount: result.amount,
      from_account_id: payload.from_account_id,
      to_account_id: payload.to_account_id,
    },
  });

  revalidateFinance();
  return { ok: true, data: result };
}

export async function createAdjustmentAction(
  input: unknown,
): Promise<
  ActionResult<{ id: string; adjustment_number: string; amount: number; direction: string }>
> {
  const auth = await authorizeAction("CREATE_FINANCIAL_ADJUSTMENT");
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: VALIDATION_ERROR,
      fieldErrors: collectFieldErrors(parsed.error.issues),
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_financial_adjustment", {
    p_payload: {
      financial_account_id: payload.financial_account_id,
      amount: payload.amount,
      direction: payload.direction,
      reason: payload.reason,
      adjustment_date: payload.adjustment_date,
      notes: payload.notes,
    },
  });

  if (error || !data) {
    const translated = translateFinanceError(error, ADJUSTMENT_SAVE_ERROR);
    return {
      ok: false,
      error: translated.error,
      fieldErrors: translated.field ? { [translated.field]: translated.error } : undefined,
    };
  }

  const result = data as unknown as {
    id: string;
    adjustment_number: string;
    amount: number;
    direction: string;
  };

  await logAction({
    userId: auth.user.id,
    action: "CREATE_FINANCIAL_ADJUSTMENT",
    entityType: "financial_adjustment",
    entityId: result.id,
    metadata: {
      adjustment_number: result.adjustment_number,
      amount: result.amount,
      direction: result.direction,
      reason: payload.reason,
      financial_account_id: payload.financial_account_id,
    },
  });

  revalidateFinance();
  return { ok: true, data: result };
}

/* -------------------------------------------------------------------------- */
/*                             Historical backfill                            */
/* -------------------------------------------------------------------------- */

export async function backfillFinancialTransactionsAction(): Promise<
  ActionResult<{
    created: number;
    sale_payments: number;
    purchase_payments: number;
    return_refunds: number;
    exchange_differences: number;
    total_transactions: number;
  }>
> {
  const auth = await authorizeAction("CREATE_FINANCIAL_ADJUSTMENT");
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("backfill_financial_transactions", {});

  if (error || !data) {
    const translated = translateFinanceError(error, "تعذر تنفيذ الترحيل المالي.");
    return { ok: false, error: translated.error };
  }

  const result = data as unknown as {
    created: number;
    sale_payments: number;
    purchase_payments: number;
    return_refunds: number;
    exchange_differences: number;
    total_transactions: number;
  };

  await logAction({
    userId: auth.user.id,
    action: "FINANCE_BACKFILL",
    entityType: "financial_transaction",
    entityId: null,
    metadata: { ...result },
  });

  revalidateFinance();
  return { ok: true, data: result };
}
