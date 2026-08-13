"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  RefundStatusBadge,
  ReturnReasonBadge,
  ReturnStatusBadge,
  WalkInCell,
} from "./return-badges";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { DATE_PRESETS } from "@/lib/sales/date-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import {
  REFUND_STATUSES,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_STATUSES,
  RETURN_STATUS_LABELS,
} from "@/types/returns";
import type { Paginated } from "@/types/catalog";
import type { ReturnRow } from "@/types/returns";

const ALL = "ALL";

export function ReturnsBrowser({
  data,
  canCreate,
  canSeeValues,
}: {
  data: Paginated<ReturnRow>;
  canCreate: boolean;
  canSeeValues: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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

  const preset = searchParams.get("range") ?? "month";
  const activeFilters = ["status", "refundStatus", "reason"].filter((key) =>
    searchParams.get(key),
  ).length;

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
              placeholder="بحث برقم المرتجع أو البيع أو العميل أو SKU"
              className="h-10 pe-9"
              aria-label="بحث في المرتجعات"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={preset}
              onValueChange={(value) => setParams({ range: value })}
            >
              <SelectTrigger className="h-10 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.filter((p) => p.value !== "custom").map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setShowFilters((open) => !open)}
            >
              <SlidersHorizontal className="size-4" />
              تصفية
              {activeFilters > 0 ? (
                <span className="bg-primary text-primary-foreground ms-1 rounded-full px-1.5 text-xs">
                  {activeFilters}
                </span>
              ) : null}
            </Button>

            {canCreate ? (
              <Button asChild className="h-10">
                <Link href="/returns/new">
                  <Plus className="size-4" />
                  إضافة مرتجع
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">
                الحالة
              </Label>
              <Select
                value={searchParams.get("status") ?? ALL}
                onValueChange={(value) => setParams({ status: value })}
              >
                <SelectTrigger id="status" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {RETURN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {RETURN_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refundStatus" className="text-xs">
                حالة الاسترداد
              </Label>
              <Select
                value={searchParams.get("refundStatus") ?? ALL}
                onValueChange={(value) => setParams({ refundStatus: value })}
              >
                <SelectTrigger id="refundStatus" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {REFUND_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {REFUND_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-xs">
                سبب الإرجاع
              </Label>
              <Select
                value={searchParams.get("reason") ?? ALL}
                onValueChange={(value) => setParams({ reason: value })}
              >
                <SelectTrigger id="reason" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {RETURN_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {RETURN_REASON_LABELS[reason]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() =>
                  setParams({ status: null, refundStatus: null, reason: null })
                }
              >
                <X className="size-4" />
                مسح التصفية
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="لا توجد مرتجعات"
          description="لم يتم تسجيل أي مرتجع ضمن هذه الفترة."
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم المرتجع</TableHead>
                  <TableHead className="text-start">رقم البيع</TableHead>
                  <TableHead className="text-start">العميل</TableHead>
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">عدد القطع</TableHead>
                  {canSeeValues ? (
                    <>
                      <TableHead className="text-start">قيمة المرتجع</TableHead>
                      <TableHead className="text-start">المسترد</TableHead>
                    </>
                  ) : null}
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">حالة الاسترداد</TableHead>
                  <TableHead className="text-start">سبب الإرجاع</TableHead>
                  <TableHead className="text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <bdi className="block text-right">{row.return_number}</bdi>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/sales/${row.sale_id}`}
                        className="text-primary hover:underline"
                      >
                        <bdi>{row.sale_number}</bdi>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.customer_id ? (
                        <Link
                          href={`/customers/${row.customer_id}`}
                          className="text-primary hover:underline"
                        >
                          {row.customer_name}
                        </Link>
                      ) : (
                        <WalkInCell name={null} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.return_date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatNumber(row.total_quantity)}
                    </TableCell>
                    {canSeeValues ? (
                      <>
                        <TableCell className="text-sm font-medium">
                          {formatMoney(row.refund_amount)}
                        </TableCell>
                        <TableCell className="text-success text-sm">
                          {formatMoney(row.refunded_amount)}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell>
                      <ReturnStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <RefundStatusBadge status={row.refund_status} />
                    </TableCell>
                    <TableCell>
                      <ReturnReasonBadge reason={row.reason} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/returns/${row.id}`}>التفاصيل</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DataPagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            perPage={data.perPage}
            onPageChange={(page) => setParams({ page })}
            onPerPageChange={(perPage) => setParams({ perPage, page: 1 })}
          />
        </>
      )}
    </Card>
  );
}
