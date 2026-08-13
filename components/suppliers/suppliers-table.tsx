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
  Truck,
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
import { SupplierDialog } from "./supplier-dialog";
import { setSupplierActiveAction } from "@/app/actions/suppliers";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import { cn } from "@/lib/utils/cn";
import type { Paginated, Supplier } from "@/types/catalog";

export function SuppliersTable({
  data,
  canCreate,
  canUpdate,
  canManage,
}: {
  data: Paginated<Supplier>;
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
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "" || value === "ALL")
          params.delete(key);
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

  function toggleActive(supplier: Supplier) {
    setBusyId(supplier.id);
    startTransition(async () => {
      const result = await setSupplierActiveAction({
        id: supplier.id,
        is_active: !supplier.is_active,
      });
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(supplier.is_active ? "تم تعطيل المورد" : "تم تفعيل المورد");
      router.refresh();
    });
  }

  return (
    <Card className="gap-0 py-0">
      <div className="border-border/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو البريد"
              className="h-10 pe-9"
              aria-label="بحث في الموردين"
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
              <SelectItem value="ALL">كل الموردين</SelectItem>
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
            إضافة مورد
          </Button>
        ) : null}
      </div>

      <CardContent className={cn("p-0", isPending && "opacity-60")}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={search ? "لا توجد نتائج" : "لا يوجد موردون"}
            description={
              search
                ? "جرّب البحث باسم أو رقم آخر."
                : "لم تتم إضافة أي موردين حتى الآن."
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
                  إضافة مورد
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">اسم المورد</TableHead>
                  <TableHead className="text-start">الهاتف</TableHead>
                  <TableHead className="text-start">واتساب</TableHead>
                  <TableHead className="text-start">البريد الإلكتروني</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="w-16 text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.rows.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <Link
                        href={`/suppliers/${supplier.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {supplier.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {supplier.phone ? (
                        <bdi className="block text-right">{supplier.phone}</bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {supplier.whatsapp ? (
                        <bdi className="block text-right">
                          {supplier.whatsapp}
                        </bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {supplier.email ? (
                        <bdi className="block text-right">{supplier.email}</bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={supplier.is_active} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`إجراءات ${supplier.name}`}
                            disabled={busyId === supplier.id}
                          >
                            {busyId === supplier.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link href={`/suppliers/${supplier.id}`}>
                              <Truck className="size-4" />
                              التفاصيل
                            </Link>
                          </DropdownMenuItem>

                          {canUpdate ? (
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onSelect={() => {
                                setEditing(supplier);
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
                                variant={
                                  supplier.is_active ? "destructive" : "default"
                                }
                                onSelect={() => toggleActive(supplier)}
                              >
                                {supplier.is_active ? (
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
        <SupplierDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          supplier={editing}
        />
      ) : null}
    </Card>
  );
}
