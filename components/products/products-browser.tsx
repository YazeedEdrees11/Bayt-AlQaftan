"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Search, Shirt, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { DataPagination } from "@/components/shared/data-pagination";
import { ActiveBadge, StockBadge } from "@/components/catalog/stock-badge";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { PRODUCT_SORT_OPTIONS } from "@/lib/catalog/config";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ProductListItem } from "@/lib/catalog/queries";
import type { Category, Paginated } from "@/types/catalog";

const ALL = "ALL";

/** Grid card used by the grid view. */
function ProductCard({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="focus-visible:ring-ring rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card className="h-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-[0_2px_4px_-2px_oklch(0_0_0/0.05),0_12px_28px_-16px_oklch(0_0_0/0.14)]">
        <div className="bg-muted relative aspect-[4/3] w-full">
          <ProductThumb
            url={product.image_url}
            alt={product.name}
            rounded="rounded-none"
            className="size-full"
          />
          <div className="absolute end-2 top-2 flex gap-1.5">
            {!product.is_active ? <ActiveBadge isActive={false} /> : null}
          </div>
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="space-y-0.5">
            <p className="truncate font-medium">{product.name}</p>
            <p className="text-muted-foreground text-xs">
              {product.category_name}
            </p>
          </div>
          <p className="text-sm font-semibold">
            {product.min_selling_price !== null
              ? `ابتداءً من ${formatMoney(product.min_selling_price)}`
              : formatMoney(product.base_selling_price)}
          </p>
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>{formatNumber(product.variants_count)} موديلات</span>
            <span>المخزون: {formatNumber(product.total_stock)}</span>
          </div>
          <StockBadge stock={product.total_stock} className="mt-1" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function ProductsBrowser({
  data,
  categories,
  brands,
  canCreate,
}: {
  data: Paginated<ProductListItem>;
  categories: Category[];
  brands: string[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [view, setView] = useState<"table" | "grid">("table");
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  /** Rewrites the query string; every filter lives in the URL. */
  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === ALL) params.delete(key);
        else params.set(key, String(value));
      }
      // Any filter change resets to the first page.
      if (!("page" in updates)) params.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounced, and only when it differs from the URL — see the hook for why
  // the comparison is what stops this effect from feeding itself.
  useDebouncedSearchParam({ value: search, searchParams, setParams });

  const activeFilters = [
    searchParams.get("category"),
    searchParams.get("brand"),
    searchParams.get("status"),
    searchParams.get("stock"),
    searchParams.get("minPrice"),
    searchParams.get("maxPrice"),
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <Card className="gap-0 py-0">
      {/* ---------------------------------------------------------- toolbar */}
      <div className="border-border/70 space-y-3 border-b p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="البحث عن منتج... (الاسم أو SKU أو الباركود)"
              className="h-10 pe-9"
              aria-label="البحث عن منتج"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={searchParams.get("sort") ?? "created_desc"}
              onValueChange={(value) => setParams({ sort: value })}
            >
              <SelectTrigger className="h-10 w-[10.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showFilters || activeFilters > 0 ? "secondary" : "outline"}
              className="h-10"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal className="size-4" />
              تصفية
              {activeFilters > 0 ? (
                <span className="bg-primary text-primary-foreground ms-1 flex size-5 items-center justify-center rounded-full text-[0.65rem]">
                  {activeFilters}
                </span>
              ) : null}
            </Button>

            <div className="border-border flex h-10 items-center rounded-lg border p-0.5">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-full px-2.5"
                onClick={() => setView("table")}
                aria-label="عرض جدول"
                aria-pressed={view === "table"}
              >
                <Rows3 className="size-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-full px-2.5"
                onClick={() => setView("grid")}
                aria-label="عرض شبكي"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {showFilters ? (
          <div className="bg-muted/40 grid gap-3 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs">التصنيف</Label>
              <Select
                value={searchParams.get("category") ?? ALL}
                onValueChange={(value) => setParams({ category: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل التصنيفات</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">العلامة التجارية</Label>
              <Select
                value={searchParams.get("brand") ?? ALL}
                onValueChange={(value) => setParams({ brand: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل العلامات</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الحالة</Label>
              <Select
                value={searchParams.get("status") ?? ALL}
                onValueChange={(value) => setParams({ status: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل المنتجات</SelectItem>
                  <SelectItem value="ACTIVE">نشط</SelectItem>
                  <SelectItem value="INACTIVE">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">المخزون</Label>
              <Select
                value={searchParams.get("stock") ?? ALL}
                onValueChange={(value) => setParams({ stock: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الحالات</SelectItem>
                  <SelectItem value="IN_STOCK">متوفر</SelectItem>
                  <SelectItem value="LOW_STOCK">مخزون منخفض</SelectItem>
                  <SelectItem value="OUT_OF_STOCK">نفد المخزون</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minPrice" className="text-xs">
                السعر من
              </Label>
              <Input
                id="minPrice"
                inputMode="decimal"
                className="h-9"
                defaultValue={searchParams.get("minPrice") ?? ""}
                onBlur={(event) =>
                  setParams({ minPrice: event.target.value.trim() || null })
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxPrice" className="text-xs">
                السعر إلى
              </Label>
              <Input
                id="maxPrice"
                inputMode="decimal"
                className="h-9"
                defaultValue={searchParams.get("maxPrice") ?? ""}
                onBlur={(event) =>
                  setParams({ maxPrice: event.target.value.trim() || null })
                }
                placeholder="—"
              />
            </div>

            {activeFilters > 0 || search ? (
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  مسح كل عوامل التصفية
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ body */}
      <div className={cn(isPending && "pointer-events-none opacity-60")}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Shirt}
            title={
              search || activeFilters > 0 ? "لا توجد نتائج" : "لا توجد منتجات"
            }
            description={
              search || activeFilters > 0
                ? "جرّب تعديل عوامل التصفية أو كلمة البحث."
                : "لم تتم إضافة أي منتجات حتى الآن."
            }
            action={
              canCreate && !search && activeFilters === 0 ? (
                <Button asChild>
                  <Link href="/products/new">إضافة منتج</Link>
                </Button>
              ) : null
            }
          />
        ) : view === "grid" ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {data.rows.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-start">الصورة</TableHead>
                  <TableHead className="text-start">اسم المنتج</TableHead>
                  <TableHead className="text-start">التصنيف</TableHead>
                  <TableHead className="text-start">عدد الموديلات</TableHead>
                  <TableHead className="text-start">المخزون</TableHead>
                  <TableHead className="text-start">السعر</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="w-24 text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <ProductThumb
                        url={product.image_url}
                        alt={product.name}
                        className="size-11"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/products/${product.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.brand ? (
                        <p className="text-muted-foreground text-xs">
                          {product.brand}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {product.category_name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatNumber(product.variants_count)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {formatNumber(product.total_stock)}
                        </span>
                        <StockBadge stock={product.total_stock} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(
                        product.min_selling_price ?? product.base_selling_price,
                      )}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={product.is_active} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/products/${product.id}`}>التفاصيل</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DataPagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        perPage={data.perPage}
        disabled={isPending}
        onPageChange={(page) => setParams({ page })}
        onPerPageChange={(perPage) => setParams({ perPage, page: null })}
      />
    </Card>
  );
}
