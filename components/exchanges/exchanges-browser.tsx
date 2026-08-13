"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Plus, Search } from "lucide-react";

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
  ExchangeDirectionBadge,
  ReturnStatusBadge,
  WalkInCell,
} from "@/components/returns/return-badges";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { DATE_PRESETS } from "@/lib/sales/date-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import type { Paginated } from "@/types/catalog";
import type { ExchangeRow } from "@/types/returns";

const ALL = "ALL";

export function ExchangesBrowser({
  data,
  canCreate,
}: {
  data: Paginated<ExchangeRow>;
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

  const preset = searchParams.get("range") ?? "month";

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
              placeholder="بحث برقم الاستبدال أو البيع أو العميل أو SKU"
              className="h-10 pe-9"
              aria-label="بحث في الاستبدالات"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(value) => setParams({ range: value })}>
              <SelectTrigger className="h-10 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.filter((option) => option.value !== "custom").map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canCreate ? (
              <Button asChild className="h-10">
                <Link href="/exchanges/new">
                  <Plus className="size-4" />
                  إضافة استبدال
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="لا توجد عمليات استبدال"
          description="لم يتم تسجيل أي استبدال ضمن هذه الفترة."
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم الاستبدال</TableHead>
                  <TableHead className="text-start">رقم البيع</TableHead>
                  <TableHead className="text-start">العميل</TableHead>
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">المرتجع</TableHead>
                  <TableHead className="text-start">البديل</TableHead>
                  <TableHead className="text-start">الفرق</TableHead>
                  <TableHead className="text-start">الاتجاه</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <bdi className="block text-right">{row.exchange_number}</bdi>
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
                      {formatDate(row.exchange_date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(row.returned_amount)}
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        ({formatNumber(row.returned_quantity)})
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(row.new_items_amount)}
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        ({formatNumber(row.new_quantity)})
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(row.difference_amount)}
                    </TableCell>
                    <TableCell>
                      <ExchangeDirectionBadge direction={row.difference_direction} />
                    </TableCell>
                    <TableCell>
                      <ReturnStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/exchanges/${row.id}`}>التفاصيل</Link>
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
