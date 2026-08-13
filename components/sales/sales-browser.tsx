"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";

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
import {
  CustomerCell,
  SalePaymentStatusBadge,
  SaleStatusBadge,
} from "./sale-badges";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { DATE_PRESETS } from "@/lib/sales/date-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Category, Paginated } from "@/types/catalog";
import type { SaleListRow } from "@/types/sales";

const ALL = "ALL";

export function SalesBrowser({
  data,
  categories,
  canCreate,
  canSeeProfit,
}: {
  data: Paginated<SaleListRow>;
  categories: Category[];
  canCreate: boolean;
  canSeeProfit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);

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

  const preset = searchParams.get("range") ?? "today";
  const activeFilters = [
    "paymentStatus",
    "status",
    "method",
    "category",
    "minAmount",
    "maxAmount",
  ].filter((key) => searchParams.get(key)).length;

  return (
    <Card className="gap-0 py-0">
      <div className="border-border/70 space-y-3 border-b p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث برقم البيع أو العميل أو المنتج أو SKU"
              className="h-10 pe-9"
              aria-label="بحث في المبيعات"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={preset}
              onValueChange={(value) => setParams({ range: value })}
            >
              <SelectTrigger className="h-10 w-[9.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((option) => (
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

            {canCreate ? (
              <Button asChild className="h-10">
                <Link href="/sales/new">
                  <Plus className="size-4" />
                  إضافة بيع
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {preset === "custom" ? (
          <div className="bg-muted/40 grid gap-3 rounded-xl p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">
                من تاريخ
              </Label>
              <Input
                id="from"
                type="date"
                className="h-9"
                defaultValue={searchParams.get("from") ?? ""}
                onChange={(event) => setParams({ from: event.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">
                إلى تاريخ
              </Label>
              <Input
                id="to"
                type="date"
                className="h-9"
                defaultValue={searchParams.get("to") ?? ""}
                onChange={(event) => setParams({ to: event.target.value || null })}
              />
            </div>
          </div>
        ) : null}

        {showFilters ? (
          <div className="bg-muted/40 grid gap-3 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-xs">حالة الدفع</Label>
              <Select
                value={searchParams.get("paymentStatus") ?? ALL}
                onValueChange={(value) => setParams({ paymentStatus: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الحالات</SelectItem>
                  <SelectItem value="UNPAID">غير مدفوع</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">مدفوع جزئياً</SelectItem>
                  <SelectItem value="PAID">مدفوع</SelectItem>
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
                  <SelectItem value={ALL}>كل الحالات</SelectItem>
                  <SelectItem value="COMPLETED">مكتمل</SelectItem>
                  <SelectItem value="DRAFT">مسودة</SelectItem>
                  <SelectItem value="CANCELLED">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select
                value={searchParams.get("method") ?? ALL}
                onValueChange={(value) => setParams({ method: value })}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الطرق</SelectItem>
                  <SelectItem value="CASH">نقدي</SelectItem>
                  <SelectItem value="BANK_TRANSFER">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
              <Label htmlFor="minAmount" className="text-xs">
                المبلغ من
              </Label>
              <Input
                id="minAmount"
                inputMode="decimal"
                className="h-9"
                defaultValue={searchParams.get("minAmount") ?? ""}
                onBlur={(event) =>
                  setParams({ minAmount: event.target.value.trim() || null })
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxAmount" className="text-xs">
                المبلغ إلى
              </Label>
              <Input
                id="maxAmount"
                inputMode="decimal"
                className="h-9"
                defaultValue={searchParams.get("maxAmount") ?? ""}
                onBlur={(event) =>
                  setParams({ maxAmount: event.target.value.trim() || null })
                }
                placeholder="—"
              />
            </div>

            {activeFilters > 0 || search ? (
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    startTransition(() =>
                      router.replace(`${pathname}?range=${preset}`, { scroll: false }),
                    );
                  }}
                >
                  <X className="size-4" />
                  مسح كل عوامل التصفية
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <CardContent className={cn("p-0", isPending && "opacity-60")}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={search || activeFilters > 0 ? "لا توجد نتائج" : "لا توجد مبيعات"}
            description={
              search || activeFilters > 0
                ? "جرّب تعديل عوامل التصفية أو الفترة الزمنية."
                : "لم يتم تسجيل أي مبيعات في هذه الفترة."
            }
            action={
              canCreate && !search && activeFilters === 0 ? (
                <Button asChild>
                  <Link href="/sales/new">
                    <Plus className="size-4" />
                    إضافة بيع
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم البيع</TableHead>
                  <TableHead className="text-start">العميل</TableHead>
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">عدد القطع</TableHead>
                  <TableHead className="text-start">الإجمالي</TableHead>
                  <TableHead className="text-start">المدفوع</TableHead>
                  <TableHead className="text-start">المتبقي</TableHead>
                  {canSeeProfit ? (
                    <TableHead className="text-start">الربح</TableHead>
                  ) : null}
                  <TableHead className="text-start">حالة الدفع</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="w-24 text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(row.status === "CANCELLED" && "opacity-60")}
                  >
                    <TableCell>
                      <Link
                        href={`/sales/${row.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        <bdi className="block text-right">{row.sale_number}</bdi>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.customer_id ? (
                        <Link
                          href={`/customers/${row.customer_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {row.customer_name}
                        </Link>
                      ) : (
                        <CustomerCell name={null} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.sale_date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatNumber(row.total_quantity)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(row.total_amount)}
                    </TableCell>
                    <TableCell className="text-success text-sm">
                      {formatMoney(row.paid_amount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm",
                        Number(row.remaining_amount) > 0
                          ? "text-destructive font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(row.remaining_amount)}
                    </TableCell>
                    {canSeeProfit ? (
                      <TableCell className="text-sm font-medium">
                        {row.status === "CANCELLED"
                          ? "—"
                          : formatMoney(row.gross_profit)}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <SalePaymentStatusBadge status={row.payment_status} />
                    </TableCell>
                    <TableCell>
                      <SaleStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/sales/${row.id}`}>التفاصيل</Link>
                      </Button>
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
