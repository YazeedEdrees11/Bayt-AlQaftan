import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSignedImageUrls } from "@/lib/catalog/images";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "@/lib/catalog/config";
import { PAYMENT_RECEIPTS_BUCKET, RECEIPT_URL_TTL_SECONDS } from "./receipts";
import type { Paginated } from "@/types/catalog";
import type {
  PaymentStatus,
  Purchase,
  PurchaseItem,
  PurchaseItemWithMedia,
  PurchaseListRow,
  PurchasePayment,
  PurchasePaymentWithMedia,
  PurchaseStatus,
  PurchaseWithDetails,
  PurchasableVariant,
  SupplierBalance,
  SupplierLedgerRow,
} from "@/types/purchasing";

/**
 * Read-side data access for purchasing.
 *
 * Everything runs through the user-scoped client, so RLS decides visibility:
 * STAFF holds no purchase permissions and gets nothing back.
 */

function paginate<T>(
  rows: T[],
  total: number,
  page: number,
  perPage: number,
): Paginated<T> {
  return {
    rows,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Resolves user ids to display names for "who did this" columns. */
async function resolveActorNames(
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return names;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", unique);
    for (const row of (data ?? []) as { id: string; full_name: string }[]) {
      names.set(row.id, row.full_name);
    }
  } catch (error) {
    console.error("[purchasing] failed to resolve actor names:", error);
  }

  return names;
}

/** Signs receipt paths from the private payment-receipts bucket. */
async function signReceipts(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PAYMENT_RECEIPTS_BUCKET)
    .createSignedUrls(unique, RECEIPT_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[purchasing] failed to sign receipts:", error?.message);
    return result;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*                               Purchase list                                */
/* -------------------------------------------------------------------------- */

export interface PurchaseListParams {
  search?: string;
  supplierId?: string;
  paymentStatus?: PaymentStatus | "ALL";
  status?: PurchaseStatus | "ALL";
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: "CASH" | "BANK_TRANSFER" | "ALL";
  page?: number;
  perPage?: number;
}

export async function listPurchases(
  params: PurchaseListParams = {},
): Promise<Paginated<PurchaseListRow>> {
  const supabase = await createClient();
  const page = normalizePage(params.page);
  const perPage = normalizePageSize(params.perPage ?? DEFAULT_PAGE_SIZE);

  const { data, error } = await supabase.rpc("search_purchases", {
    p_search: params.search?.trim() || undefined,
    p_supplier_id: params.supplierId || undefined,
    p_payment_status: params.paymentStatus ?? "ALL",
    p_status: params.status ?? "ALL",
    p_date_from: params.dateFrom || undefined,
    p_date_to: params.dateTo || undefined,
    p_min_amount: params.minAmount ?? undefined,
    p_max_amount: params.maxAmount ?? undefined,
    p_payment_method: params.paymentMethod ?? "ALL",
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });

  if (error) {
    console.error("[purchasing] listPurchases:", error.message);
    throw new Error("تعذر تحميل المشتريات.");
  }

  const rows = (data ?? []) as PurchaseListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  return paginate(rows, total, page, perPage);
}

/* -------------------------------------------------------------------------- */
/*                              Purchase detail                               */
/* -------------------------------------------------------------------------- */

export async function getPurchaseById(
  id: string,
): Promise<PurchaseWithDetails | null> {
  const supabase = await createClient();

  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("*, supplier:suppliers(id, name, phone, whatsapp)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[purchasing] getPurchaseById:", error.message);
    throw new Error("تعذر تحميل المشتريات.");
  }
  if (!purchase) return null;

  const [itemsResult, paymentsResult] = await Promise.all([
    supabase
      .from("purchase_items")
      .select("*")
      .eq("purchase_id", id)
      .order("created_at"),
    supabase
      .from("purchase_payments")
      .select("*")
      .eq("purchase_id", id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (itemsResult.error || paymentsResult.error) {
    console.error(
      "[purchasing] purchase detail:",
      itemsResult.error?.message ?? paymentsResult.error?.message,
    );
    throw new Error("تعذر تحميل المشتريات.");
  }

  const items = (itemsResult.data ?? []) as PurchaseItem[];
  const payments = (paymentsResult.data ?? []) as PurchasePayment[];

  const variantIds = [...new Set(items.map((item) => item.variant_id))];

  // Current image and stock are shown for orientation only — the money on this
  // document comes entirely from the stored snapshots.
  const [imagesResult, stockResult] = await Promise.all([
    variantIds.length
      ? supabase
          .from("product_variants")
          .select("id, product_id, product:products(id)")
          .in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? supabase
          .from("variant_stock")
          .select("variant_id, current_stock")
          .in("variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const productIdByVariant = new Map<string, string>();
  for (const row of (imagesResult.data ?? []) as {
    id: string;
    product_id: string;
  }[]) {
    productIdByVariant.set(row.id, row.product_id);
  }

  const productIds = [...new Set([...productIdByVariant.values()])];
  const imagePathByProduct = new Map<string, string>();

  if (productIds.length) {
    const { data: images } = await supabase
      .from("product_images")
      .select("product_id, storage_path, is_primary, sort_order")
      .in("product_id", productIds)
      .order("is_primary", { ascending: false })
      .order("sort_order");

    for (const image of (images ?? []) as {
      product_id: string;
      storage_path: string;
    }[]) {
      if (!imagePathByProduct.has(image.product_id)) {
        imagePathByProduct.set(image.product_id, image.storage_path);
      }
    }
  }

  const signedImages = await getSignedImageUrls([
    ...imagePathByProduct.values(),
  ]);

  const stockByVariant = new Map<string, number>();
  for (const row of (stockResult.data ?? []) as {
    variant_id: string;
    current_stock: number;
  }[]) {
    stockByVariant.set(row.variant_id, row.current_stock);
  }

  const receiptUrls = await signReceipts(
    payments
      .map((payment) => payment.receipt_image_path)
      .filter((path): path is string => !!path),
  );

  const actorNames = await resolveActorNames([
    ...payments.map((payment) => payment.created_by),
    (purchase as Purchase).created_by,
  ]);

  const { supplier, ...rest } = purchase as Purchase & {
    supplier: {
      id: string;
      name: string;
      phone: string | null;
      whatsapp: string | null;
    } | null;
  };

  const itemsWithMedia: PurchaseItemWithMedia[] = items.map((item) => {
    const productId = productIdByVariant.get(item.variant_id);
    const path = productId ? imagePathByProduct.get(productId) : undefined;
    return {
      ...item,
      image_url: path ? (signedImages.get(path) ?? undefined) : null,
      current_stock: stockByVariant.get(item.variant_id) ?? undefined,
    };
  });

  const paymentsWithMedia: PurchasePaymentWithMedia[] = payments.map(
    (payment) => ({
      ...payment,
      receipt_url: payment.receipt_image_path
        ? (receiptUrls.get(payment.receipt_image_path) ?? undefined)
        : null,
      actor_name: payment.created_by
        ? (actorNames.get(payment.created_by) ?? undefined)
        : null,
    }),
  );

  return {
    ...rest,
    supplier: supplier ?? undefined,
    items: itemsWithMedia,
    payments: paymentsWithMedia,
    created_by_name: rest.created_by
      ? (actorNames.get(rest.created_by) ?? undefined)
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Variant picker for purchases                      */
/* -------------------------------------------------------------------------- */

/**
 * Active variants matching a search term, for the purchase line-item picker.
 * Reuses the catalog's `search_inventory` so search behaves identically to the
 * inventory screen (name, SKU, barcode).
 */
export async function searchPurchasableVariants(
  search: string,
  limit = 20,
): Promise<PurchasableVariant[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_inventory", {
    p_search: search?.trim() || undefined,
    p_category_id: null,
    p_supplier_id: null,
    p_color: null,
    p_size: null,
    p_stock_status: "ALL",
    p_low_stock_threshold: 5,
    p_limit: limit,
    p_offset: 0,
  });

  if (error) {
    console.error("[purchasing] searchPurchasableVariants:", error.message);
    return [];
  }

  const rows = (data ?? []).filter((row) => row.is_active);
  const urls = await getSignedImageUrls(
    rows
      .map((row) => row.primary_image_path)
      .filter((path): path is string => !!path),
  );

  return rows.map((row) => ({
    variant_id: row.variant_id,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    barcode: row.barcode,
    color: row.color,
    size: row.size,
    purchase_price: Number(row.purchase_price),
    selling_price: Number(row.selling_price),
    current_stock: row.current_stock,
    image_url: row.primary_image_path
      ? (urls.get(row.primary_image_path) ?? undefined)
      : null,
  }));
}

/**
 * The most recent cost actually paid for a variant, so the buyer can see what
 * the last delivery cost before typing a new figure.
 */
export async function getLastPurchaseCost(
  variantId: string,
): Promise<{ unit_cost: number; purchase_date: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_items")
    .select("unit_cost, created_at, purchase:purchases(purchase_date, status)")
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) return null;

  const row = (
    data as unknown as {
      unit_cost: number;
      purchase: { purchase_date: string; status: string } | null;
    }[]
  ).find((entry) => entry.purchase?.status === "COMPLETED");

  if (!row?.purchase) return null;
  return {
    unit_cost: Number(row.unit_cost),
    purchase_date: row.purchase.purchase_date,
  };
}

/* -------------------------------------------------------------------------- */
/*                             Supplier balances                              */
/* -------------------------------------------------------------------------- */

export async function getSupplierBalance(
  supplierId: string,
): Promise<SupplierBalance> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("supplier_balance")
    .select("*")
    .eq("supplier_id", supplierId)
    .maybeSingle();

  // STAFF cannot read the ledger; an empty balance is the correct answer.
  if (error || !data) {
    return {
      supplier_id: supplierId,
      total_purchases: 0,
      total_paid: 0,
      total_returns: 0,
      balance: 0,
    };
  }

  return data as SupplierBalance;
}

export async function getSupplierLedger(
  supplierId: string,
  limit = 200,
): Promise<SupplierLedgerRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("supplier_ledger", {
    p_supplier_id: supplierId,
    p_limit: limit,
  });

  if (error) {
    console.error("[purchasing] getSupplierLedger:", error.message);
    return [];
  }
  return (data ?? []) as SupplierLedgerRow[];
}

/** Payments made to a supplier across all of their purchases. */
export async function getSupplierPayments(
  supplierId: string,
  limit = 100,
): Promise<PurchasePaymentWithMedia[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_payments")
    .select("*, purchase:purchases!inner(id, purchase_number, supplier_id)")
    .eq("purchase.supplier_id", supplierId)
    .order("payment_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[purchasing] getSupplierPayments:", error.message);
    return [];
  }

  const rows = (data ?? []) as (PurchasePayment & {
    purchase: { id: string; purchase_number: string } | null;
  })[];

  const [receipts, actors] = await Promise.all([
    signReceipts(
      rows
        .map((row) => row.receipt_image_path)
        .filter((path): path is string => !!path),
    ),
    resolveActorNames(rows.map((row) => row.created_by)),
  ]);

  return rows.map((row) => ({
    ...row,
    receipt_url: row.receipt_image_path
      ? (receipts.get(row.receipt_image_path) ?? undefined)
      : null,
    actor_name: row.created_by ? (actors.get(row.created_by) ?? undefined) : null,
  }));
}

/** Purchases that still owe money, for the supplier payment dialog. */
export async function getOutstandingPurchases(
  supplierId: string,
): Promise<
  Pick<
    Purchase,
    "id" | "purchase_number" | "purchase_date" | "total_amount" | "remaining_amount"
  >[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchases")
    .select("id, purchase_number, purchase_date, total_amount, remaining_amount")
    .eq("supplier_id", supplierId)
    .eq("status", "COMPLETED")
    .gt("remaining_amount", 0)
    .order("purchase_date");

  if (error) return [];
  return (data ?? []) as Pick<
    Purchase,
    | "id"
    | "purchase_number"
    | "purchase_date"
    | "total_amount"
    | "remaining_amount"
  >[];
}
