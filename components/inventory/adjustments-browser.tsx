"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  AdjustmentReasonBadge,
  DifferenceBadge,
  ReturnStatusBadge,
} from "@/components/returns/return-badges";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { formatDate, formatNumber } from "@/lib/utils/format";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
} from "@/types/returns";
import type { Paginated } from "@/types/catalog";
import type { AdjustmentRow } from "@/types/returns";

const ALL = "ALL";

export function AdjustmentsBrowser({
  data,
  canCreate,
}: {
  data: Paginated<AdjustmentRow>;
  canCreate: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

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
              placeholder="بحث برقم التعديل أو المنتج أو SKU"
              className="h-10 pe-9"
              aria-label="بحث في تعديلات المخزون"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={searchParams.get("reason") ?? ALL}
              onValueChange={(value) => setParams({ reason: value })}
            >
              <SelectTrigger className="h-10 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>كل الأسباب</SelectItem>
                {ADJUSTMENT_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {ADJUSTMENT_REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canCreate ? (
              <Button asChild className="h-10">
                <Link href="/inventory/adjustments/new">
                  <Plus className="size-4" />
                  تعديل جديد
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تعديلات مخزون"
          description="لم يتم تسجيل أي جرد أو تصحيح حتى الآن."
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم التعديل</TableHead>
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">عدد المنتجات</TableHead>
                  <TableHead className="text-start">سبب التعديل</TableHead>
                  <TableHead className="text-start">إجمالي الزيادة</TableHead>
                  <TableHead className="text-start">إجمالي النقص</TableHead>
                  <TableHead className="text-start">المستخدم</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <bdi className="block text-right">{row.adjustment_number}</bdi>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.adjustment_date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatNumber(row.items_count)}
                    </TableCell>
                    <TableCell>
                      <AdjustmentReasonBadge reason={row.reason} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DifferenceBadge value={row.total_increase} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <DifferenceBadge value={-row.total_decrease} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.created_by_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ReturnStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/inventory/adjustments/${row.id}`}>التفاصيل</Link>
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
