import "server-only";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSignedImageUrls } from "./images";
import {
  DEFAULT_PAGE_SIZE,
  LOW_STOCK_THRESHOLD,
  normalizePage,
  normalizePageSize,
  normalizeSort,
  type ProductSort,
} from "./config";
import type {
  Category,
  InventoryRow,
  InventorySummary,
  InventoryTransactionWithActor,
  Paginated,
  ProductImage,
  ProductListRow,
  ProductVariant,
  ProductWithDetails,
  StockStatusFilter,
  Supplier,
  VariantWithStock,
} from "@/types/catalog";

/**
 * Read-side data access for the catalog.
 *
 * Every query runs through the *user-scoped* client, so RLS decides what comes
 * back. Filtering, sorting and pagination happen in Postgres — the browser
 * never receives more than one page.
 */

const LOAD_ERROR = "تعذر تحميل البيانات.";

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

/* -------------------------------------------------------------------------- */
/*                                 Categories                                 */
/* -------------------------------------------------------------------------- */

export async function listCategories(
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase.from("categories").select("*").order("name");
  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("[catalog] listCategories:", error.message);
    throw new Error("تعذر تحميل التصنيفات.");
  }
  return (data ?? []) as Category[];
}

/* -------------------------------------------------------------------------- */
/*                                 Suppliers                                  */
/* -------------------------------------------------------------------------- */

export async function listSuppliers({
  search,
  status = "ALL",
  page = 1,
  perPage = DEFAULT_PAGE_SIZE,
}: {
  search?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  page?: number;
  perPage?: number;
} = {}): Promise<Paginated<Supplier>> {
  const supabase = await createClient();
  const currentPage = normalizePage(page);
  const size = normalizePageSize(perPage);
  const from = (currentPage - 1) * size;

  let query = supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .order("name");

  if (status === "ACTIVE") query = query.eq("is_active", true);
  if (status === "INACTIVE") query = query.eq("is_active", false);

  const term = search?.trim();
  if (term) {
    // PostgREST `or` needs the wildcards inline; commas would split the filter.
    const safe = term.replace(/[,()]/g, " ");
    query = query.or(
      `name.ilike.%${safe}%,phone.ilike.%${safe}%,whatsapp.ilike.%${safe}%,email.ilike.%${safe}%`,
    );
  }

  const { data, error, count } = await query.range(from, from + size - 1);

  if (error) {
    console.error("[catalog] listSuppliers:", error.message);
    throw new Error("تعذر تحميل الموردين.");
  }

  return paginate((data ?? []) as Supplier[], count ?? 0, currentPage, size);
}

/** Lightweight list for the supplier picker on variant forms. */
export async function listActiveSuppliers(): Promise<
  Pick<Supplier, "id" | "name">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // STAFF cannot read suppliers at all; an empty picker is the correct result.
  if (error) return [];
  return (data ?? []) as Pick<Supplier, "id" | "name">[];
}

export async function getSupplierById(id: string): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[catalog] getSupplierById:", error.message);
    throw new Error("تعذر تحميل بيانات المورد.");
  }
  return (data as Supplier) ?? null;
}

/** How many variants name this supplier as their default. */
export async function countSupplierVariants(id: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id);

  if (error) return 0;
  return count ?? 0;
}

/* -------------------------------------------------------------------------- */
/*                                  Products                                  */
/* -------------------------------------------------------------------------- */

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  brand?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  stockStatus?: StockStatusFilter;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
}

export type ProductListItem = ProductListRow & { image_url: string | null };

export async function listProducts(
  params: ProductListParams = {},
): Promise<Paginated<ProductListItem>> {
  const supabase = await createClient();
  const currentPage = normalizePage(params.page);
  const size = normalizePageSize(params.perPage);

  const { data, error } = await supabase.rpc("search_products", {
    p_search: params.search?.trim() || null,
    p_category_id: params.categoryId || null,
    p_brand: params.brand || null,
    p_status: params.status ?? "ALL",
    p_stock_status: params.stockStatus ?? "ALL",
    p_min_price: params.minPrice ?? null,
    p_max_price: params.maxPrice ?? null,
    p_sort: normalizeSort(params.sort),
    p_low_stock_threshold: LOW_STOCK_THRESHOLD,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[catalog] listProducts:", error.message);
    throw new Error("تعذر تحميل المنتجات.");
  }

  const rows = (data ?? []) as ProductListRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  const urls = await getSignedImageUrls(
    rows.map((row) => row.primary_image_path).filter((p): p is string => !!p),
  );

  const items: ProductListItem[] = rows.map((row) => ({
    ...row,
    image_url: row.primary_image_path
      ? (urls.get(row.primary_image_path) ?? null)
      : null,
  }));

  return paginate(items, total, currentPage, size);
}

/** Distinct brands, for the brand filter dropdown. */
export async function listBrands(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("brand")
    .not("brand", "is", null)
    .order("brand");

  if (error) return [];
  const brands = new Set<string>();
  for (const row of (data ?? []) as { brand: string | null }[]) {
    if (row.brand?.trim()) brands.add(row.brand.trim());
  }
  return [...brands].sort((a, b) => a.localeCompare(b, "ar"));
}

/** Full product with category, variants (incl. stock), and signed images. */
export async function getProductById(
  id: string,
): Promise<ProductWithDetails | null> {
  const supabase = await createClient();

  const [productResult, stockResult] = await Promise.all([
    supabase
      .from("products")
      .select(`
        *,
        category:categories(id, name),
        variants:product_variants(*, supplier:suppliers(id, name)),
        images:product_images(*)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase.from("variant_stock").select("*").eq("product_id", id),
  ]);

  if (productResult.error || stockResult.error) {
    console.error(
      "[catalog] getProductById details:",
      productResult.error?.message ?? stockResult.error?.message,
    );
    throw new Error("تعذر تحميل المنتج.");
  }

  const product = productResult.data;
  if (!product) return null;

  const stockByVariant = new Map<string, number>();
  const damagedByVariant = new Map<string, number>();
  for (const row of (stockResult.data ?? []) as {
    variant_id: string;
    current_stock: number;
    damaged_quantity: number;
  }[]) {
    stockByVariant.set(row.variant_id, row.current_stock);
    damagedByVariant.set(row.variant_id, row.damaged_quantity);
  }

  const images = (product.images ?? []) as ProductImage[];
  images.sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const urls = await getSignedImageUrls(images.map((i) => i.storage_path));

  type VariantJoin = ProductVariant & {
    supplier: { id: string; name: string } | null;
  };

  const variantsData = (product.variants ?? []) as VariantJoin[];
  variantsData.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const variants: VariantWithStock[] = variantsData.map((variant) => {
    const variantImage = images.find((i) => i.variant_id === variant.id);
    const fallback = images.find((i) => i.is_primary) ?? images[0];
    const path = (variantImage ?? fallback)?.storage_path;

    return {
      ...variant,
      current_stock: stockByVariant.get(variant.id) ?? 0,
      damaged_quantity: damagedByVariant.get(variant.id) ?? 0,
      supplier_name: variant.supplier?.name ?? null,
      image_url: path ? (urls.get(path) ?? null) : null,
    };
  });

  const totalStock = variants.reduce((sum, v) => sum + v.current_stock, 0);
  const stockValue = variants.reduce(
    (sum, v) => sum + v.current_stock * Number(v.purchase_price),
    0,
  );

  // Destructure nested relations out; spread only the base product columns.
  const {
    category,
    variants: _rawVariants,
    images: _rawImages,
    ...baseProduct
  } = product as typeof product & {
    category: { id: string; name: string } | null;
    variants: unknown[];
    images: unknown[];
  };

  return {
    ...baseProduct,
    category: category ?? null,
    variants,
    images: images.map((image) => ({
      ...image,
      url: urls.get(image.storage_path) ?? null,
    })),
    total_stock: totalStock,
    stock_value: stockValue,
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Variants                                  */
/* -------------------------------------------------------------------------- */

export type VariantDetail = VariantWithStock & {
  product: { id: string; name: string; category_name: string | null };
};

export async function getVariantById(
  id: string,
): Promise<VariantDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "*, supplier:suppliers(id, name), product:products(id, name, category:categories(name))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[catalog] getVariantById:", error.message);
    throw new Error("تعذر تحميل الموديل.");
  }
  if (!data) return null;

  type VariantJoin = ProductVariant & {
    supplier: { id: string; name: string } | null;
    product: {
      id: string;
      name: string;
      category: { name: string } | null;
    } | null;
  };

  const row = data as VariantJoin;

  const [{ data: stock }, { data: image }] = await Promise.all([
    supabase
      .from("variant_stock")
      .select("current_stock, damaged_quantity")
      .eq("variant_id", id)
      .maybeSingle(),
    supabase
      .from("product_images")
      .select("storage_path")
      .eq("product_id", row.product_id)
      .order("is_primary", { ascending: false })
      .order("sort_order")
      .limit(1)
      .maybeSingle(),
  ]);

  const urls = image?.storage_path
    ? await getSignedImageUrls([image.storage_path])
    : new Map<string, string>();

  const { supplier, product, ...variant } = row;

  return {
    ...variant,
    current_stock: stock?.current_stock ?? 0,
    damaged_quantity: stock?.damaged_quantity ?? 0,
    supplier_name: supplier?.name ?? null,
    image_url: image?.storage_path
      ? (urls.get(image.storage_path) ?? null)
      : null,
    product: {
      id: product?.id ?? row.product_id,
      name: product?.name ?? "",
      category_name: product?.category?.name ?? null,
    },
  };
}

/**
 * Ledger entries for a variant, newest first.
 *
 * Actor names are resolved with the privileged client: RLS on `profiles`
 * deliberately hides other users' rows, but "who moved this stock" is exactly
 * what the history column is for. Only `full_name` is read.
 */
export async function getVariantTransactions(
  variantId: string,
  limit = 100,
): Promise<InventoryTransactionWithActor[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_transactions")
    .select("*")
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[catalog] getVariantTransactions:", error.message);
    throw new Error("تعذر تحميل حركة المخزون.");
  }

  const rows = (data ?? []) as InventoryTransactionWithActor[];
  const actorIds = [
    ...new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id)),
  ];

  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const profile of (profiles ?? []) as {
        id: string;
        full_name: string;
      }[]) {
        names.set(profile.id, profile.full_name);
      }
    } catch (err) {
      console.error("[catalog] failed to resolve actor names:", err);
    }
  }

  return rows.map((row) => ({
    ...row,
    actor_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
  }));
}

/* -------------------------------------------------------------------------- */
/*                                 Inventory                                  */
/* -------------------------------------------------------------------------- */

export interface InventoryListParams {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  color?: string;
  size?: string;
  stockStatus?: StockStatusFilter;
  page?: number;
  perPage?: number;
}

export type InventoryListItem = InventoryRow & { image_url: string | null };

export async function listInventory(
  params: InventoryListParams = {},
): Promise<Paginated<InventoryListItem>> {
  const supabase = await createClient();
  const currentPage = normalizePage(params.page);
  const size = normalizePageSize(params.perPage);

  const { data, error } = await supabase.rpc("search_inventory", {
    p_search: params.search?.trim() || null,
    p_category_id: params.categoryId || null,
    p_supplier_id: params.supplierId || null,
    p_color: params.color || null,
    p_size: params.size || null,
    p_stock_status: params.stockStatus ?? "ALL",
    p_low_stock_threshold: LOW_STOCK_THRESHOLD,
    p_limit: size,
    p_offset: (currentPage - 1) * size,
  });

  if (error) {
    console.error("[catalog] listInventory:", error.message);
    throw new Error("تعذر تحميل بيانات المخزون.");
  }

  const rows = (data ?? []) as InventoryRow[];
  const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

  const urls = await getSignedImageUrls(
    rows.map((r) => r.primary_image_path).filter((p): p is string => !!p),
  );

  const items: InventoryListItem[] = rows.map((row) => ({
    ...row,
    image_url: row.primary_image_path
      ? (urls.get(row.primary_image_path) ?? null)
      : null,
  }));

  return paginate(items, total, currentPage, size);
}

export async function getInventorySummary(): Promise<InventorySummary> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("inventory_summary", {
    p_low_stock_threshold: LOW_STOCK_THRESHOLD,
  });

  if (error) {
    console.error("[catalog] getInventorySummary:", error.message);
    throw new Error("تعذر تحميل ملخص المخزون.");
  }

  const row = (data ?? [])[0] as InventorySummary | undefined;

  return (
    row ?? {
      total_products: 0,
      total_variants: 0,
      total_units: 0,
      stock_value: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
    }
  );
}

/** Distinct colours and sizes currently in use, for the inventory filters. */
export async function listVariantFacets(): Promise<{
  colors: string[];
  sizes: string[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("color, size");

  if (error) {
    console.error("[catalog] listVariantFacets:", error.message);
    return { colors: [], sizes: [] };
  }

  const colors = new Set<string>();
  const sizes = new Set<string>();
  for (const row of (data ?? []) as {
    color: string | null;
    size: string | null;
  }[]) {
    if (row.color?.trim()) colors.add(row.color.trim());
    if (row.size?.trim()) sizes.add(row.size.trim());
  }

  return {
    colors: [...colors].sort((a, b) => a.localeCompare(b, "ar")),
    sizes: [...sizes].sort((a, b) =>
      a.localeCompare(b, "ar", { numeric: true }),
    ),
  };
}

export { LOAD_ERROR };
