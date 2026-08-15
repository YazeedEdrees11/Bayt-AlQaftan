import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSignedImageUrls } from "@/lib/catalog/images";
import {
  DEFAULT_PAGE_SIZE,
  normalizePage,
  normalizePageSize,
} from "@/lib/catalog/config";
import { SALE_RECEIPTS_BUCKET, RECEIPT_URL_TTL_SECONDS } from "./receipts";
import { allocateDiscount } from "@/types/sales";
import type { Paginated } from "@/types/catalog";
import type {
  Customer,
  CustomerBalance,
  CustomerLedgerRow,
  CustomerListRow,
  Sale,
  SaleItem,
  SaleItemWithMedia,
  SaleListRow,
  SalePayment,
  SalePaymentMethod,
  SalePaymentStatus,
  SalePaymentWithMedia,
  SaleStatus,
  SaleWithDetails,
  SalesSummary,
  SellableVariant,
  TopCustomerRow,
  TopProductRow,
} from "@/types/sales";

/**
 * Read-side data access for customers and sales.
 *
 * Everything goes through the user-scoped client, so RLS decides visibility —
 * notably, customer balances come back empty for STAFF.
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
    console.error("[sales] failed to resolve actor names:", error);
  }
  return names;
}

async function signReceipts(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(SALE_RECEIPTS_BUCKET)
    .createSignedUrls(unique, RECEIPT_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("[sales] failed to sign receipts:", error?.message);
    return result;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*                                 Customers                                  */
/* -------------------------------------------------------------------------- */

export async function listCustomers({
  search,
  status = "ALL",
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<CustomerListRow>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);

  const { data, error } = await supabase.rpc("search_customers", {
    p_search: search?.trim() || undefined,
    p_status: status,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[sales] listCustomers:", error.message);
    throw new Error("تعذر تحميل العملاء.");
  }

  const rows = (data ?? []) as CustomerListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
  return paginate(rows, total, currentPage, size);
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[sales] getCustomerById:", error.message);
    throw new Error("تعذر تحميل بيانات العميل.");
  }
  return (data as Customer) ?? undefined;
}

/** Lightweight list for the sale screen's customer picker. */
export async function listActiveCustomers(
  search?: string,
  limit = 20,
): Promise<Pick<Customer, "id" | "customer_number" | "name" | "phone">[]> {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, customer_number, name, phone")
    .eq("is_active", true)
    .order("name")
    .limit(limit);

  const term = search?.trim();
  if (term) {
    const safe = term.replace(/[,()]/g, " ");
    query = query.or(
      `name.ilike.%${safe}%,customer_number.ilike.%${safe}%,phone.ilike.%${safe}%,whatsapp.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Pick<Customer, "id" | "customer_number" | "name" | "phone">[];
}

export async function getCustomerBalance(customerId: string): Promise<CustomerBalance> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_balance")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  // STAFF cannot read the ledger; an empty balance is the correct answer.
  if (error || !data) {
    return {
      customer_id: customerId,
      total_sales: 0,
      total_paid: 0,
      total_returns: 0,
      balance: 0,
    };
  }
  return data as CustomerBalance;
}

export async function getCustomerLedger(
  customerId: string,
  limit = 200,
): Promise<CustomerLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_ledger", {
    p_customer_id: customerId,
    p_limit: limit,
  });
  if (error) {
    console.error("[sales] getCustomerLedger:", error.message);
    return [];
  }
  return (data ?? []) as CustomerLedgerRow[];
}

/** Payments received from a customer across all their sales. */
export async function getCustomerPayments(
  customerId: string,
  limit = 100,
): Promise<SalePaymentWithMedia[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_payments")
    .select("*, sale:sales!inner(id, sale_number, customer_id)")
    .eq("sale.customer_id", customerId)
    .order("payment_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[sales] getCustomerPayments:", error.message);
    return [];
  }

  const rows = (data ?? []) as (SalePayment & {
    sale: { id: string; sale_number: string } | null;
  })[];

  const [receipts, actors] = await Promise.all([
    signReceipts(rows.map((r) => r.receipt_image_path).filter((p): p is string => !!p)),
    resolveActorNames(rows.map((r) => r.created_by)),
  ]);

  return rows.map((row) => ({
    ...row,
    receipt_url: row.receipt_image_path ? (receipts.get(row.receipt_image_path) ?? null) : null,
    actor_name: row.created_by ? (actors.get(row.created_by) ?? null) : null,
  }));
}

/** Completed sales that still owe money, for the customer payment dialog. */
export async function getOutstandingSales(
  customerId: string,
): Promise<Pick<Sale, "id" | "sale_number" | "sale_date" | "total_amount" | "remaining_amount">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number, sale_date, total_amount, remaining_amount")
    .eq("customer_id", customerId)
    .eq("status", "COMPLETED")
    .gt("remaining_amount", 0)
    .order("sale_date");

  if (error) return [];
  return (data ?? []) as Pick<
    Sale,
    "id" | "sale_number" | "sale_date" | "total_amount" | "remaining_amount"
  >[];
}

/* -------------------------------------------------------------------------- */
/*                                   Sales                                    */
/* -------------------------------------------------------------------------- */

export interface SaleListParams {
  search?: string;
  customerId?: string;
  paymentStatus?: SalePaymentStatus | "ALL";
  status?: SaleStatus | "ALL";
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: SalePaymentMethod | "ALL";
  categoryId?: string;
  page?: number;
  perPage?: number;
}

export async function listSales(
  params: SaleListParams = {},
): Promise<Paginated<SaleListRow>> {
  const supabase = await createClient();
  const page = normalizePage(params.page);
  const perPage = normalizePageSize(params.perPage ?? DEFAULT_PAGE_SIZE);

  const { data, error } = await supabase.rpc("search_sales", {
    p_search: params.search?.trim() || undefined,
    p_customer_id: params.customerId || undefined,
    p_payment_status: params.paymentStatus ?? "ALL",
    p_status: params.status ?? "ALL",
    p_date_from: params.dateFrom || undefined,
    p_date_to: params.dateTo || undefined,
    p_min_amount: params.minAmount ?? undefined,
    p_max_amount: params.maxAmount ?? undefined,
    p_payment_method: params.paymentMethod ?? "ALL",
    p_category_id: params.categoryId || undefined,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });

  if (error) {
    console.error("[sales] listSales:", error.message);
    throw new Error("تعذر تحميل المبيعات.");
  }

  const rows = (data ?? []) as SaleListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;
  return paginate(rows, total, page, perPage);
}

export async function getSaleById(id: string): Promise<SaleWithDetails | null> {
  const supabase = await createClient();

  const { data: sale, error } = await supabase
    .from("sales")
    .select("*, customer:customers(id, customer_number, name, phone, whatsapp)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[sales] getSaleById:", error.message);
    throw new Error("تعذر تحميل عملية البيع.");
  }
  if (!sale) return null;

  const [itemsResult, paymentsResult] = await Promise.all([
    supabase.from("sale_items").select("*").eq("sale_id", id).order("created_at"),
    supabase
      .from("sale_payments")
      .select("*")
      .eq("sale_id", id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (itemsResult.error || paymentsResult.error) {
    console.error(
      "[sales] sale detail:",
      itemsResult.error?.message ?? paymentsResult.error?.message,
    );
    throw new Error("تعذر تحميل عملية البيع.");
  }

  const items = (itemsResult.data ?? []) as SaleItem[];
  const payments = (paymentsResult.data ?? []) as SalePayment[];
  const row = sale as Sale & {
    customer: {
      id: string;
      customer_number: string;
      name: string;
      phone: string | null;
      whatsapp: string | null;
    } | null;
  };

  // Current images are decoration; the money on this document comes from the
  // stored snapshots.
  const variantIds = [...new Set(items.map((i) => i.variant_id))];
  const imagePathByProduct = new Map<string, string>();
  const productIdByVariant = new Map<string, string>();

  if (variantIds.length) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .in("id", variantIds);
    for (const v of (variants ?? []) as { id: string; product_id: string }[]) {
      productIdByVariant.set(v.id, v.product_id);
    }

    const productIds = [...new Set([...productIdByVariant.values()])];
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
  }

  const [signedImages, receiptUrls, actorNames] = await Promise.all([
    getSignedImageUrls([...imagePathByProduct.values()]),
    signReceipts(payments.map((p) => p.receipt_image_path).filter((p): p is string => !!p)),
    resolveActorNames([...payments.map((p) => p.created_by), row.created_by]),
  ]);

  // Allocate the sale-level discount across lines so per-item profit sums to
  // the sale's gross profit.
  const allocated = allocateDiscount(items, Number(row.discount));

  const itemsWithMedia: SaleItemWithMedia[] = allocated.map((item) => {
    const productId = productIdByVariant.get(item.variant_id);
    const path = productId ? imagePathByProduct.get(productId) : undefined;
    return { ...item, image_url: path ? (signedImages.get(path) ?? null) : null };
  });

  const paymentsWithMedia: SalePaymentWithMedia[] = payments.map((payment) => ({
    ...payment,
    receipt_url: payment.receipt_image_path
      ? (receiptUrls.get(payment.receipt_image_path) ?? null)
      : null,
    actor_name: payment.created_by ? (actorNames.get(payment.created_by) ?? null) : null,
  }));

  const grossProfit = Math.round((Number(row.total_amount) - Number(row.total_cost)) * 100) / 100;
  const grossMargin =
    Number(row.total_amount) > 0
      ? Math.round((grossProfit / Number(row.total_amount)) * 10000) / 100
      : 0;

  const { customer, ...rest } = row;

  return {
    ...rest,
    customer: customer ?? null,
    items: itemsWithMedia,
    payments: paymentsWithMedia,
    created_by_name: rest.created_by ? (actorNames.get(rest.created_by) ?? null) : null,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Variant picker for sales                          */
/* -------------------------------------------------------------------------- */

/** Active variants matching a term, with live stock for the till. */
export async function searchSellableVariants(
  search: string,
  limit = 20,
): Promise<SellableVariant[]> {
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
    console.error("[sales] searchSellableVariants:", error.message);
    return [];
  }

  const rows = (data ?? []).filter((row) => row.is_active);
  const urls = await getSignedImageUrls(
    rows.map((r) => r.primary_image_path).filter((p): p is string => !!p),
  );

  return rows.map((row) => ({
    variant_id: row.variant_id,
    product_id: row.product_id,
    product_name: row.product_name,
    sku: row.sku,
    barcode: row.barcode,
    color: row.color,
    size: row.size,
    selling_price: Number(row.selling_price),
    purchase_price: Number(row.purchase_price),
    current_stock: row.current_stock,
    image_url: row.primary_image_path ? (urls.get(row.primary_image_path) ?? null) : null,
  }));
}

/* -------------------------------------------------------------------------- */
/*                          Dashboard & reporting                             */
/* -------------------------------------------------------------------------- */

export async function getSalesSummary(
  dateFrom?: string,
  dateTo?: string,
): Promise<SalesSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_summary", {
    p_date_from: dateFrom || undefined,
    p_date_to: dateTo || undefined,
  });

  if (error) {
    console.error("[sales] getSalesSummary:", error.message);
    throw new Error("تعذر تحميل ملخص المبيعات.");
  }

  const row = (data ?? [])[0] as SalesSummary | undefined;
  return (
    row ?? {
      sales_count: 0, gross_sales: 0, total_discount: 0, net_sales: 0,
      total_cost: 0, gross_profit: 0, gross_margin: 0, units_sold: 0,
      total_paid: 0, total_outstanding: 0, cash_collected: 0, bank_collected: 0,
      returns_count: 0, returns_value: 0, returns_cost: 0, units_returned: 0,
      net_sales_after_returns: 0, net_cost_after_returns: 0,
      net_profit_after_returns: 0,
    }
  );
}

export async function getTopProducts(
  dateFrom?: string,
  dateTo?: string,
  limit = 10,
): Promise<TopProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("top_selling_products", {
    p_date_from: dateFrom || undefined,
    p_date_to: dateTo || undefined,
    p_limit: limit,
  });
  if (error) return [];
  return (data ?? []) as TopProductRow[];
}

export async function getTopCustomers(
  dateFrom?: string,
  dateTo?: string,
  limit = 10,
): Promise<TopCustomerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("top_customers", {
    p_date_from: dateFrom || undefined,
    p_date_to: dateTo || undefined,
    p_limit: limit,
  });
  if (error) return [];
  return (data ?? []) as TopCustomerRow[];
}
