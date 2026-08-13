"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Boxes, Search, X } from "lucide-react";

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
import { ProductThumb } from "@/components/catalog/product-thumb";
import { StockBadge } from "@/components/catalog/stock-badge";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { InventoryListItem } from "@/lib/catalog/queries";
import type { Category, Paginated, Supplier } from "@/types/catalog";

const ALL = "ALL";

export function InventoryBrowser({
  data,
  categories,
  suppliers,
  colors,
  sizes,
}: {
  data: Paginated<InventoryListItem>;
  categories: Category[];
  suppliers: Pick<Supplier, "id" | "name">[];
  colors: string[];
  sizes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === ALL) params.delete(key);
        else params.set(key, String(value));
      }
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

  const hasFilters =
    !!search ||
    ["category", "supplier", "color", "size", "stock"].some((key) =>
      searchParams.get(key),
    );

  return (
    <Card className="gap-0 py-0">
      <div className="border-border/70 space-y-3 border-b p-4">
        <div className="relative w-full lg:max-w-sm">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالمنتج أو SKU أو الباركود"
            className="h-10 pe-9"
            aria-label="بحث في المخزون"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
              <Label className="text-xs">المورد</Label>
              <Select
                value={searchParams.get("supplier") ?? ALL}
                onValueChange={(value) => setParams({ supplier: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الموردين</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">اللون</Label>
            <Select
              value={searchParams.get("color") ?? ALL}
              onValueChange={(value) => setParams({ color: value })}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الألوان</SelectItem>
                {colors.map((color) => (
                  <SelectItem key={color} value={color}>
                    {color}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">المقاس</Label>
            <Select
              value={searchParams.get("size") ?? ALL}
              onValueChange={(value) => setParams({ size: value })}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل المقاسات</SelectItem>
                {sizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">حالة المخزون</Label>
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
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X className="size-4" />
            مسح عوامل التصفية
          </Button>
        ) : null}
      </div>

      <CardContent className={cn("p-0", isPending && "opacity-60")}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={hasFilters ? "لا توجد نتائج" : "لا توجد بيانات مخزون"}
            description={
              hasFilters
                ? "جرّب تعديل عوامل التصفية."
                : "ستظهر الكميات هنا بعد إضافة منتجات وموديلات."
            }
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-start">الصورة</TableHead>
                  <TableHead className="text-start">المنتج</TableHead>
                  <TableHead className="text-start">SKU</TableHead>
                  <TableHead className="text-start">اللون</TableHead>
                  <TableHead className="text-start">المقاس</TableHead>
                  <TableHead className="text-start">المورد</TableHead>
                  <TableHead className="text-start">سعر الشراء</TableHead>
                  <TableHead className="text-start">سعر البيع</TableHead>
                  <TableHead className="text-start">المخزون</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.variant_id}>
                    <TableCell>
                      <ProductThumb
                        url={row.image_url}
                        alt={row.product_name}
                        className="size-11"
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/products/${row.product_id}/variants/${row.variant_id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {row.product_name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {row.category_name}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <bdi className="block text-right">{row.sku}</bdi>
                    </TableCell>
                    <TableCell className="text-sm">{row.color ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.size ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.supplier_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(row.purchase_price)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(row.selling_price)}
                    </TableCell>
                    <TableCell className="text-sm font-semibold tabular-nums">
                      {formatNumber(row.current_stock)}
                    </TableCell>
                    <TableCell>
                      <StockBadge stock={row.current_stock} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

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
