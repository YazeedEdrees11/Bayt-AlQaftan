"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ActiveBadge } from "@/components/catalog/stock-badge";
import { CustomerDialog } from "./customer-dialog";
import { setCustomerActiveAction } from "@/app/actions/sales";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Paginated } from "@/types/catalog";
import type { Customer, CustomerListRow } from "@/types/sales";

export function CustomersBrowser({
  data,
  canCreate,
  canUpdate,
  canManage,
}: {
  data: Paginated<CustomerListRow>;
  canCreate: boolean;
  canUpdate: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "ALL") params.delete(key);
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

  function toggleActive(row: CustomerListRow) {
    setBusyId(row.id);
    startTransition(async () => {
      const result = await setCustomerActiveAction({
        id: row.id,
        is_active: !row.is_active,
      });
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(row.is_active ? "تم تعطيل العميل" : "تم تفعيل العميل");
      router.refresh();
    });
  }

  return (
    <Card className="gap-0 py-0">
      <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو رقم العميل"
              className="h-10 pe-9"
              aria-label="بحث في العملاء"
            />
          </div>

          <Select
            value={searchParams.get("status") ?? "ALL"}
            onValueChange={(value) => setParams({ status: value })}
          >
            <SelectTrigger className="h-10 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل العملاء</SelectItem>
              <SelectItem value="ACTIVE">نشط</SelectItem>
              <SelectItem value="INACTIVE">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canCreate ? (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            إضافة عميل
          </Button>
        ) : null}
      </div>

      <CardContent className={cn("p-0", isPending && "opacity-60")}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? "لا توجد نتائج" : "لا يوجد عملاء"}
            description={
              search
                ? "جرّب البحث باسم أو رقم آخر."
                : "لم تتم إضافة أي عملاء حتى الآن."
            }
            action={
              canCreate && !search ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  إضافة عميل
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">رقم العميل</TableHead>
                  <TableHead className="text-start">اسم العميل</TableHead>
                  <TableHead className="text-start">الهاتف</TableHead>
                  <TableHead className="text-start">واتساب</TableHead>
                  <TableHead className="text-start">عدد المشتريات</TableHead>
                  <TableHead className="text-start">إجمالي المشتريات</TableHead>
                  <TableHead className="text-start">آخر عملية شراء</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="w-16 text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <bdi className="block text-right text-sm font-medium">
                        {row.customer_number}
                      </bdi>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/customers/${row.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.phone ? (
                        <bdi className="block text-right">{row.phone}</bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {row.whatsapp ? (
                        <bdi className="block text-right">{row.whatsapp}</bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatNumber(row.sales_count)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(row.total_purchases)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {row.last_sale_date ? formatDate(row.last_sale_date) : "—"}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={row.is_active} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`إجراءات ${row.name}`}
                            disabled={busyId === row.id}
                          >
                            {busyId === row.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link href={`/customers/${row.id}`}>
                              <Users className="size-4" />
                              التفاصيل
                            </Link>
                          </DropdownMenuItem>

                          {canUpdate ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onSelect={() => {
                                setEditing({
                                  id: row.id,
                                  customer_number: row.customer_number,
                                  name: row.name,
                                  phone: row.phone,
                                  whatsapp: row.whatsapp,
                                  email: row.email,
                                  address: null,
                                  notes: null,
                                  is_active: row.is_active,
                                  created_at: row.created_at,
                                  updated_at: row.created_at,
                                });
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="size-4" />
                              تعديل
                            </DropdownMenuItem>
                          ) : null}

                          {canManage ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer"
                                variant={row.is_active ? "destructive" : "default"}
                                onSelect={() => toggleActive(row)}
                              >
                                {row.is_active ? (
                                  <>
                                    <ShieldOff className="size-4" />
                                    تعطيل
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="size-4" />
                                    تفعيل
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      {dialogOpen ? (
        <CustomerDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          customer={editing}
        />
      ) : null}
    </Card>
  );
}
