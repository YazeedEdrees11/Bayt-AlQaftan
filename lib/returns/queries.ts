import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSignedImageUrls } from "@/lib/catalog/images";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "@/lib/catalog/config";
import {
  REFUND_RECEIPTS_BUCKET,
  REFUND_RECEIPT_URL_TTL_SECONDS,
} from "./receipts";
import type { Paginated } from "@/types/catalog";
import type {
  AdjustmentRow,
  AdjustmentWithDetails,
  DamagedStockRow,
  Exchange,
  ExchangeItem,
  ExchangeRow,
  ExchangeWithDetails,
  InventoryAdjustment,
  InventoryAdjustmentItem,
  RefundStatus,
  ReturnableSaleItem,
  ReturnRefund,
  ReturnRow,
  ReturnsSummary,
  ReturnStatus,
  ReturnWithDetails,
  SalesReturn,
  SalesReturnItem,
} from "@/types/returns";

/**
 * Read-side data access for returns, exchanges and inventory adjustments.
 *
 * Everything goes through the user-scoped client, so RLS decides visibility.
 * Notably `return_refunds` comes back empty for STAFF — what was paid back out
 * is financial data, like customer balances.
 */

function paginate<T>(rows: T[], total: number, page: number, perPage: number): Paginated<T> {
  return { rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

async function resolveActorNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return names;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("id, full_name").in("id", unique);
    for (const row of (data ?? []) as { id: string; full_name: string }[]) {
      names.set(row.id, row.full_name);
    }
  } catch (error) {
    console.error("[returns] failed to resolve actor names:", error);
  }
  return names;
}

async function signRefundReceipts(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(REFUND_RECEIPTS_BUCKET)
    .createSignedUrls(unique, REFUND_RECEIPT_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[returns] failed to sign refund receipts:", error?.message);
    return result;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

/** Primary product image per variant, signed. Decoration only — never money. */
async function signVariantImages(
  variantIds: string[],
): Promise<Map<string, string>> {
  const byVariant = new Map<string, string>();
  const unique = [...new Set(variantIds.filter(Boolean))];
  if (unique.length === 0) return byVariant;

  const supabase = await createClient();
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .in("id", unique);

  const productIdByVariant = new Map<string, string>();
  for (const v of (variants ?? []) as { id: string; product_id: string }[]) {
    productIdByVariant.set(v.id, v.product_id);
  }

  const productIds = [...new Set([...productIdByVariant.values()])];
  if (productIds.length === 0) return byVariant;

  const { data: images } = await supabase
    .from("product_images")
    .select("product_id, storage_path, is_primary, sort_order")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order");

  const pathByProduct = new Map<string, string>();
  for (const image of (images ?? []) as { product_id: string; storage_path: string }[]) {
    if (!pathByProduct.has(image.product_id)) {
      pathByProduct.set(image.product_id, image.storage_path);
    }
  }

  const signed = await getSignedImageUrls([...pathByProduct.values()]);
  for (const [variantId, productId] of productIdByVariant) {
    const path = pathByProduct.get(productId);
    const url = path ? signed.get(path) : undefined;
    if (url) byVariant.set(variantId, url);
  }
  return byVariant;
}

/* -------------------------------------------------------------------------- */
/*                                  Returns                                   */
/* -------------------------------------------------------------------------- */

export async function listReturns({
  search,
  customerId,
  status = "ALL",
  refundStatus = "ALL",
  reason = "ALL",
  from,
  to,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  customerId?: string;
  status?: ReturnStatus | "ALL";
  refundStatus?: RefundStatus | "ALL";
  reason?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ReturnRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_returns", {
    p_search: search?.trim() || undefined,
    p_customer_id: customerId ?? undefined,
    p_status: status,
    p_refund_status: refundStatus,
    p_reason: reason,
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[returns] listReturns:", error.message);
    throw new Error("تعذر تحميل المرتجعات.");
  }

  const rows = (data ?? []) as ReturnRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

export async function getReturnsSummary(
  from?: string,
  to?: string,
): Promise<ReturnsSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("returns_summary", {
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
  });

  if (error) {
    console.error("[returns] getReturnsSummary:", error.message);
    throw new Error("تعذر تحميل ملخص المرتجعات.");
  }

  const row = (data ?? [])[0] as ReturnsSummary | undefined;
  return (
    row ?? {
      returns_count: 0,
      returns_value: 0,
      refunded_value: 0,
      credited_value: 0,
      units_returned: 0,
      damaged_units: 0,
      cost_returned: 0,
      profit_reversal: 0,
    }
  );
}

/** What is still returnable on a sale, with the discount already applied. */
export async function getReturnableItems(
  saleId: string,
): Promise<ReturnableSaleItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sale_returnable_items", {
    p_sale_id: saleId,
  });

  if (error) {
    console.error("[returns] getReturnableItems:", error.message);
    throw new Error("تعذر تحميل بنود عملية البيع.");
  }

  const rows = (data ?? []) as ReturnableSaleItem[];
  const signed = await getSignedImageUrls(
    rows.map((r) => r.image_path).filter((p): p is string => !!p),
  );
  return rows.map((row) => ({
    ...row,
    image_url: row.image_path ? (signed.get(row.image_path) ?? null) : null,
  }));
}

export async function getReturnById(
  id: string,
): Promise<ReturnWithDetails | null> {
  const supabase = await createClient();

  const { data: header, error } = await supabase
    .from("sales_returns")
    .select("*, sale:sales(sale_number), customer:customers(id, name, phone)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[returns] getReturnById:", error.message);
    throw new Error("تعذر تحميل المرتجع.");
  }
  if (!header) return null;

  const [itemsResult, refundsResult] = await Promise.all([
    supabase.from("sales_return_items").select("*").eq("return_id", id).order("created_at"),
    // Empty for STAFF by RLS — the page hides the section rather than erroring.
    supabase
      .from("return_refunds")
      .select("*")
      .eq("return_id", id)
      .order("refund_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (itemsResult.error) {
    console.error("[returns] return items:", itemsResult.error.message);
    throw new Error("تعذر تحميل المرتجع.");
  }

  const items = (itemsResult.data ?? []) as SalesReturnItem[];
  const refunds = (refundsResult.data ?? []) as ReturnRefund[];
  const row = header as SalesReturn & {
    sale: { sale_number: string } | null;
    customer: { id: string; name: string; phone: string | null } | null;
  };

  const [images, receiptUrls, actorNames] = await Promise.all([
    signVariantImages(items.map((i) => i.variant_id)),
    signRefundReceipts(
      refunds.map((r) => r.receipt_image_path).filter((p): p is string => !!p),
    ),
    resolveActorNames([row.created_by, ...refunds.map((r) => r.created_by)]),
  ]);

  return {
    ...row,
    sale_number: row.sale?.sale_number ?? "",
    customer: row.customer,
    created_by_name: row.created_by ? (actorNames.get(row.created_by) ?? null) : null,
    items: items.map((item) => ({
      ...item,
      image_url: images.get(item.variant_id) ?? null,
      // Reversing a sale reverses its cost with it.
      gross_profit:
        Math.round((Number(item.total_amount) - Number(item.total_cost)) * 100) / 100,
    })),
    refunds: refunds.map((refund) => ({
      ...refund,
      receipt_url: refund.receipt_image_path
        ? (receiptUrls.get(refund.receipt_image_path) ?? null)
        : null,
      actor_name: refund.created_by ? (actorNames.get(refund.created_by) ?? null) : null,
    })),
    profit_reversal:
      Math.round((Number(row.refund_amount) - Number(row.total_cost)) * 100) / 100,
    outstanding_refund:
      Math.round((Number(row.refund_amount) - Number(row.refunded_amount)) * 100) / 100,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Exchanges                                  */
/* -------------------------------------------------------------------------- */

export async function listExchanges({
  search,
  customerId,
  status = "ALL",
  from,
  to,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  customerId?: string;
  status?: ReturnStatus | "ALL";
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<ExchangeRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_exchanges", {
    p_search: search?.trim() || undefined,
    p_customer_id: customerId ?? undefined,
    p_status: status,
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[returns] listExchanges:", error.message);
    throw new Error("تعذر تحميل الاستبدالات.");
  }

  const rows = (data ?? []) as ExchangeRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

export async function getExchangeById(
  id: string,
): Promise<ExchangeWithDetails | null> {
  const supabase = await createClient();

  const { data: header, error } = await supabase
    .from("exchanges")
    .select("*, sale:sales(sale_number), customer:customers(id, name, phone)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[returns] getExchangeById:", error.message);
    throw new Error("تعذر تحميل الاستبدال.");
  }
  if (!header) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from("exchange_items")
    .select("*")
    .eq("exchange_id", id)
    .order("item_type")
    .order("created_at");

  if (itemsError) {
    console.error("[returns] exchange items:", itemsError.message);
    throw new Error("تعذر تحميل الاستبدال.");
  }

  const items = (itemRows ?? []) as ExchangeItem[];
  const row = header as Exchange & {
    sale: { sale_number: string } | null;
    customer: { id: string; name: string; phone: string | null } | null;
  };

  const [images, receiptUrls, actorNames] = await Promise.all([
    signVariantImages(items.map((i) => i.variant_id)),
    signRefundReceipts(row.receipt_image_path ? [row.receipt_image_path] : []),
    resolveActorNames([row.created_by]),
  ]);

  const withImage = (item: ExchangeItem) => ({
    ...item,
    image_url: images.get(item.variant_id) ?? null,
  });

  return {
    ...row,
    sale_number: row.sale?.sale_number ?? "",
    customer: row.customer,
    created_by_name: row.created_by ? (actorNames.get(row.created_by) ?? null) : null,
    returned_items: items.filter((i) => i.item_type === "RETURNED").map(withImage),
    new_items: items.filter((i) => i.item_type === "NEW").map(withImage),
    receipt_url: row.receipt_image_path
      ? (receiptUrls.get(row.receipt_image_path) ?? null)
      : null,
    profit_delta:
      Math.round(
        (Number(row.new_items_amount) -
          Number(row.new_items_cost) -
          (Number(row.returned_amount) - Number(row.returned_cost))) *
          100,
      ) / 100,
  };
}

/* -------------------------------------------------------------------------- */
/*                            Inventory adjustments                           */
/* -------------------------------------------------------------------------- */

export async function listAdjustments({
  search,
  reason = "ALL",
  status = "ALL",
  from,
  to,
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  reason?: string;
  status?: ReturnStatus | "ALL";
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<AdjustmentRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_adjustments", {
    p_search: search?.trim() || undefined,
    p_reason: reason,
    p_status: status,
    p_date_from: from ?? undefined,
    p_date_to: to ?? undefined,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[returns] listAdjustments:", error.message);
    throw new Error("تعذر تحميل تعديلات المخزون.");
  }

  const rows = (data ?? []) as AdjustmentRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

export async function getAdjustmentById(
  id: string,
): Promise<AdjustmentWithDetails | null> {
  const supabase = await createClient();

  const { data: header, error } = await supabase
    .from("inventory_adjustments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[returns] getAdjustmentById:", error.message);
    throw new Error("تعذر تحميل تعديل المخزون.");
  }
  if (!header) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from("inventory_adjustment_items")
    .select("*")
    .eq("adjustment_id", id)
    .order("created_at");

  if (itemsError) {
    console.error("[returns] adjustment items:", itemsError.message);
    throw new Error("تعذر تحميل تعديل المخزون.");
  }

  const items = (itemRows ?? []) as InventoryAdjustmentItem[];
  const row = header as InventoryAdjustment;

  const [images, actorNames] = await Promise.all([
    signVariantImages(items.map((i) => i.variant_id)),
    resolveActorNames([row.created_by]),
  ]);

  return {
    ...row,
    created_by_name: row.created_by ? (actorNames.get(row.created_by) ?? null) : null,
    items: items.map((item) => ({
      ...item,
      image_url: images.get(item.variant_id) ?? null,
    })),
  };
}

export async function listDamagedStock({
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: { page?: number; perPage?: number } = {}): Promise<Paginated<DamagedStockRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("damaged_stock", {
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[returns] listDamagedStock:", error.message);
    throw new Error("تعذر تحميل المخزون التالف.");
  }

  const rows = (data ?? []) as DamagedStockRow[];
  return paginate(rows, Number(rows[0]?.total_count ?? 0), currentPage, size);
}

/* -------------------------------------------------------------------------- */
/*                          Cross-module read helpers                         */
/* -------------------------------------------------------------------------- */

/** Net figures for one sale once its returns are taken off. */
export async function getSaleNetOverview(saleId: string): Promise<{
  gross_amount: number;
  returned_amount: number;
  net_amount: number;
  net_cost: number;
  net_profit: number;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_net_overview")
    .select("*")
    .eq("sale_id", saleId)
    .maybeSingle();

  if (error) {
    console.error("[returns] getSaleNetOverview:", error.message);
    return null;
  }
  return data
    ? {
        gross_amount: Number(data.gross_amount),
        returned_amount: Number(data.returned_amount),
        net_amount: Number(data.net_amount),
        net_cost: Number(data.net_cost),
        net_profit: Number(data.net_profit),
      }
    : null;
}

/** Returns and exchanges raised against one sale, for the sale detail page. */
export async function getSaleReturnActivity(saleId: string): Promise<{
  returns: Pick<
    SalesReturn,
    "id" | "return_number" | "return_date" | "refund_amount" | "status" | "refund_status"
  >[];
  exchanges: Pick<
    Exchange,
    | "id"
    | "exchange_number"
    | "exchange_date"
    | "difference_amount"
    | "difference_direction"
    | "status"
  >[];
}> {
  const supabase = await createClient();
  const [returnsResult, exchangesResult] = await Promise.all([
    supabase
      .from("sales_returns")
      .select("id, return_number, return_date, refund_amount, status, refund_status")
      .eq("sale_id", saleId)
      .order("return_date", { ascending: false }),
    supabase
      .from("exchanges")
      .select(
        "id, exchange_number, exchange_date, difference_amount, difference_direction, status",
      )
      .eq("sale_id", saleId)
      .order("exchange_date", { ascending: false }),
  ]);

  return {
    returns: (returnsResult.data ?? []) as ReturnActivityReturn[],
    exchanges: (exchangesResult.data ?? []) as ReturnActivityExchange[],
  };
}

type ReturnActivityReturn = Pick<
  SalesReturn,
  "id" | "return_number" | "return_date" | "refund_amount" | "status" | "refund_status"
>;
type ReturnActivityExchange = Pick<
  Exchange,
  | "id"
  | "exchange_number"
  | "exchange_date"
  | "difference_amount"
  | "difference_direction"
  | "status"
>;

/** Header fields the return/exchange forms show for a pre-selected sale. */
export async function getSaleHeaderForReturn(saleId: string): Promise<{
  id: string;
  sale_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number;
  item_count: number;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number, sale_date, total_amount, customer_id, customer:customers(name)")
    .eq("id", saleId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    sale_number: string;
    sale_date: string;
    total_amount: number;
    customer_id: string | null;
    customer: { name: string } | null;
  };

  const { count } = await supabase
    .from("sale_items")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId);

  return {
    id: row.id,
    sale_number: row.sale_number,
    sale_date: row.sale_date,
    customer_id: row.customer_id,
    customer_name: row.customer?.name ?? null,
    total_amount: Number(row.total_amount),
    item_count: count ?? 0,
  };
}

/**
 * Variants a stock count may cover.
 *
 * Unlike the till's lookup this does NOT filter out inactive variants: a
 * deactivated model can still be sitting on a shelf, and a count that cannot
 * see it can never correct it.
 */
export async function searchCountableVariants(
  search: string,
  limit = 20,
): Promise<
  {
    variant_id: string;
    product_name: string;
    sku: string;
    color: string | null;
    size: string | null;
    current_stock: number;
    is_active: boolean;
    image_url: string | null;
  }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_inventory", {
    p_search: search?.trim() || undefined,
    p_category_id: undefined,
    p_supplier_id: undefined,
    p_color: undefined,
    p_size: undefined,
    p_stock_status: "ALL",
    p_low_stock_threshold: 5,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) {
    console.error("[returns] searchCountableVariants:", error.message);
    return [];
  }

  const rows = data ?? [];
  const urls = await getSignedImageUrls(
    rows.map((r) => r.primary_image_path).filter((p): p is string => !!p),
  );

  return rows.map((row) => ({
    variant_id: row.variant_id,
    product_name: row.product_name,
    sku: row.sku,
    color: row.color,
    size: row.size,
    current_stock: row.current_stock,
    is_active: row.is_active,
    image_url: row.primary_image_path ? (urls.get(row.primary_image_path) ?? null) : null,
  }));
}
