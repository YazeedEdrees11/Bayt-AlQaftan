"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Receipt, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  EXPENSE_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  type ExpenseCategory,
  type ExpenseRow,
  type FinancialAccount,
} from "@/types/finance";
import type { Paginated } from "@/types/catalog";

const ALL = "ALL";

export function ExpensesBrowser({
  data,
  categories,
  accounts,
  canCreate,
}: {
  data: Paginated<ExpenseRow>;
  categories: ExpenseCategory[];
  accounts: Pick<FinancialAccount, "id" | "name" | "account_type">[];
  canCreate: boolean;
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

  const activeFilters = ["category", "method", "account", "status", "minAmount", "maxAmount"]
    .filter((key) => searchParams.get(key)).length;

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
              placeholder="بحث برقم المصروف أو الوصف أو التصنيف"
              className="h-10 pe-9"
              aria-label="بحث في المصاريف"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                <Link href="/expenses/new">
                  <Plus className="size-4" />
                  إضافة مصروف
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">التصنيف</Label>
              <Select
                value={searchParams.get("category") ?? ALL}
                onValueChange={(value) => setParams({ category: value })}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">طريقة الدفع</Label>
              <Select
                value={searchParams.get("method") ?? ALL}
                onValueChange={(value) => setParams({ method: value })}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {EXPENSE_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {EXPENSE_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الحساب</Label>
              <Select
                value={searchParams.get("account") ?? ALL}
                onValueChange={(value) => setParams({ account: value })}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
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
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>الكل</SelectItem>
                  {EXPENSE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {EXPENSE_STATUS_LABELS[s]}
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
                  setParams({
                    category: null, method: null, account: null,
                    status: null, minAmount: null, maxAmount: null,
                  })
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
          icon={Receipt}
          title="لا توجد مصاريف"
          description="لم يتم تسجيل أي مصروف ضمن هذه الفترة."
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم المصروف</TableHead>
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">التصنيف</TableHead>
                  <TableHead className="text-start">المبلغ</TableHead>
                  <TableHead className="text-start">طريقة الدفع</TableHead>
                  <TableHead className="text-start">الحساب</TableHead>
                  <TableHead className="text-start">الوصف</TableHead>
                  <TableHead className="text-start">المستخدم</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <bdi className="block text-right">{row.expense_number}</bdi>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.expense_date)}
                    </TableCell>
                    <TableCell className="text-sm">{row.category_name}</TableCell>
                    <TableCell
                      className={cn(
                        "text-sm font-medium",
                        row.status === "CANCELLED" && "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(row.amount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {EXPENSE_METHOD_LABELS[row.payment_method]}
                    </TableCell>
                    <TableCell className="text-sm">{row.account_name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[16rem] truncate text-sm">
                      {row.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.created_by_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium",
                          row.status === "COMPLETED"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-destructive/10 text-destructive border-destructive/25",
                        )}
                      >
                        {EXPENSE_STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/expenses/${row.id}`}>التفاصيل</Link>
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
