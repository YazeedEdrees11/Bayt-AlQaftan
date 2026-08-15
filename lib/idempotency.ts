import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

/** The operations the database dispatcher will run. Mirrors its `case` list. */
export const IDEMPOTENT_OPERATIONS = [
  "create_sale",
  "complete_sale",
  "create_purchase",
  "create_expense",
  "create_sales_return",
  "create_exchange",
  "create_financial_transfer",
  "add_sale_payment",
  "add_purchase_payment",
  "add_return_refund",
  "create_inventory_adjustment",
] as const;

export type IdempotentOperation = (typeof IDEMPOTENT_OPERATIONS)[number];

/**
 * Runs a write operation at most once per key.
 *
 * Every call goes through the dispatcher, key or no key: without one it simply
 * forwards, so there is a single path to these operations rather than two that
 * could drift. The key comes from the browser and is stable across retries of
 * the same submission — that is what makes it a *retry* rather than a second
 * order for the same goods, which the server has no way to tell apart on its
 * own. Two identical sales a minute apart are an ordinary afternoon.
 */
export async function callIdempotent<T = unknown>(
  supabase: SupabaseClient<Database>,
  operation: IdempotentOperation,
  payload: Record<string, unknown>,
  idempotencyKey?: string | null,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const body = idempotencyKey
    ? { ...payload, idempotency_key: idempotencyKey }
    : payload;

  const { data, error } = await supabase.rpc("idempotent", {
    p_operation: operation,
    p_payload: body as Json,
  });

  return { data: (data as T) ?? null, error };
}

/** Was this response the stored answer to an earlier identical submission? */
export function isReplay(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { idempotent_replay?: boolean }).idempotent_replay === true
  );
}
