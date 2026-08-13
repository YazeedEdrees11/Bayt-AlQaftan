/**
 * Catalog, supplier and inventory types for Phase 2.
 *
 * Row types are declared as type aliases (not interfaces) so they satisfy
 * Supabase's `Record<string, unknown>` constraint — see types/auth.ts.
 */

/* -------------------------------------------------------------------------- */
/*                                  Catalog                                   */
/* -------------------------------------------------------------------------- */

export type Category = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  category_id: string;
  brand: string | null;
  base_selling_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  supplier_id: string | null;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  purchase_price: number;
  selling_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductImage = {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  public_url: string | null;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------- */
/*                                 Inventory                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every movement kind the ledger understands. Kept in step with the CHECK
 * constraint on `inventory_transactions.transaction_type`, and with
 * `inventory_direction()` which decides each one's sign in the database.
 */
export const INVENTORY_TRANSACTION_TYPES = [
  "INITIAL_STOCK",
  "PURCHASE",
  "PURCHASE_REVERSAL",
  "PURCHASE_RETURN",
  "SALE",
  "SALE_REVERSAL",
  "SALE_RETURN",
  "RETURN_REVERSAL",
  "RETURN",
  "EXCHANGE_IN",
  "EXCHANGE_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "DAMAGED",
] as const;

export type InventoryTransactionType =
  (typeof INVENTORY_TRANSACTION_TYPES)[number];

/**
 * The subset the UI can create in Phase 2. PURCHASE / SALE / RETURN are written
 * by the purchase and sales modules in later phases.
 */
export const MANUAL_TRANSACTION_TYPES = [
  "INITIAL_STOCK",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
] as const satisfies readonly InventoryTransactionType[];

export type ManualTransactionType = (typeof MANUAL_TRANSACTION_TYPES)[number];

/** Arabic labels for the ledger. */
export const TRANSACTION_TYPE_LABELS: Record<InventoryTransactionType, string> =
  {
    INITIAL_STOCK: "الرصيد الابتدائي",
    PURCHASE: "شراء",
    PURCHASE_REVERSAL: "إلغاء شراء",
    PURCHASE_RETURN: "مرتجع لمورد",
    SALE: "بيع",
    SALE_REVERSAL: "إلغاء بيع",
    SALE_RETURN: "مرتجع عميل",
    RETURN_REVERSAL: "إلغاء مرتجع",
    RETURN: "مرتجع",
    EXCHANGE_IN: "استبدال (وارد)",
    EXCHANGE_OUT: "استبدال (صادر)",
    ADJUSTMENT_IN: "تعديل مخزون (إضافة)",
    ADJUSTMENT_OUT: "تعديل مخزون (خصم)",
    DAMAGE: "خصم تالف",
    DAMAGED: "إضافة للتالف",
  };

/**
 * Types that increase stock; the rest decrease it. Mirrors `inventory_direction()`.
 * The database is the authority — this list only drives arrows and colours.
 */
export const INCOMING_TRANSACTION_TYPES: readonly InventoryTransactionType[] = [
  "INITIAL_STOCK",
  "PURCHASE",
  "RETURN",
  "ADJUSTMENT_IN",
  "SALE_REVERSAL",
  "SALE_RETURN",
  "EXCHANGE_IN",
  "DAMAGED",
];

export function isIncomingTransaction(type: InventoryTransactionType): boolean {
  return INCOMING_TRANSACTION_TYPES.includes(type);
}

/** Which bucket a movement belongs to. Damaged goods are never sellable. */
export const STOCK_STATES = ["AVAILABLE", "DAMAGED"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  AVAILABLE: "متاح",
  DAMAGED: "تالف",
};

export type InventoryTransaction = {
  id: string;
  variant_id: string;
  transaction_type: InventoryTransactionType;
  stock_state: StockState;
  quantity: number;
  /** Derived in the database: quantity with its direction applied. */
  signed_quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*                               Stock status                                 */
/* -------------------------------------------------------------------------- */

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

/** Filter value used by the list screens; `ALL` disables the filter. */
export type StockStatusFilter = StockStatus | "ALL";

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "متوفر",
  LOW_STOCK: "مخزون منخفض",
  OUT_OF_STOCK: "نفد المخزون",
};

/* -------------------------------------------------------------------------- */
/*                            Query result shapes                             */
/* -------------------------------------------------------------------------- */

/** One row of `search_products()`. */
export type ProductListRow = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  base_selling_price: number | null;
  is_active: boolean;
  created_at: string;
  category_id: string;
  category_name: string;
  variants_count: number;
  total_stock: number;
  min_selling_price: number | null;
  stock_value: number;
  primary_image_path: string | null;
  total_count: number;
};

/** One row of `search_inventory()`. */
export type InventoryRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  category_name: string;
  sku: string;
  barcode: string | null;
  color: string | null;
  size: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  is_active: boolean;
  primary_image_path: string | null;
  total_count: number;
};

/** `inventory_summary()` — all six dashboard KPIs. */
export type InventorySummary = {
  total_products: number;
  total_variants: number;
  total_units: number;
  stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
};

/** A variant enriched with its derived stock, supplier and parent product. */
export type VariantWithStock = ProductVariant & {
  current_stock: number;
  /** Units held as damaged. Never part of sellable stock. */
  damaged_quantity: number;
  supplier_name: string | null;
  image_url: string | null;
};

/** A product with everything the detail page needs. */
export type ProductWithDetails = Product & {
  category: Pick<Category, "id" | "name"> | null;
  variants: VariantWithStock[];
  images: (ProductImage & { url: string | null })[];
  total_stock: number;
  stock_value: number;
};

/** A ledger entry joined with the name of whoever recorded it. */
export type InventoryTransactionWithActor = InventoryTransaction & {
  actor_name: string | null;
};

/* -------------------------------------------------------------------------- */
/*                              Pagination                                    */
/* -------------------------------------------------------------------------- */

export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};
