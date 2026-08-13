import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ProductsBrowser } from "@/components/products/products-browser";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import {
  listBrands,
  listCategories,
  listProducts,
} from "@/lib/catalog/queries";
import { normalizePage, normalizePageSize, normalizeSort } from "@/lib/catalog/config";
import type { StockStatusFilter } from "@/types/catalog";

export const metadata: Metadata = { title: "المنتجات" };

type SearchParams = Promise<{
  q?: string;
  category?: string;
  brand?: string;
  status?: string;
  stock?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
  perPage?: string;
}>;

function parsePrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requirePermission("VIEW_PRODUCTS");
  const params = await searchParams;

  const status =
    params.status === "ACTIVE" || params.status === "INACTIVE"
      ? params.status
      : "ALL";

  const stockStatus = (
    ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(params.stock ?? "")
      ? params.stock
      : "ALL"
  ) as StockStatusFilter;

  const [data, categories, brands] = await Promise.all([
    listProducts({
      search: params.q,
      categoryId: params.category,
      brand: params.brand,
      status,
      stockStatus,
      minPrice: parsePrice(params.minPrice),
      maxPrice: parsePrice(params.maxPrice),
      sort: normalizeSort(params.sort),
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
    listCategories(),
    listBrands(),
  ]);

  const canCreate = hasPermission(profile, "CREATE_PRODUCTS");

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        description="إدارة منتجات بيت القفطان وموديلاتها وأسعارها وصورها."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/products/new">
                <Plus className="size-4" />
                إضافة منتج
              </Link>
            </Button>
          ) : null
        }
      />

      <ProductsBrowser
        data={data}
        categories={categories}
        brands={brands}
        canCreate={canCreate}
      />
    </div>
  );
}
