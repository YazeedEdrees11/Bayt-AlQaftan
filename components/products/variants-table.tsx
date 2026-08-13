"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActiveBadge, StockBadge } from "@/components/catalog/stock-badge";
import { VariantDialog } from "./variant-dialog";
import {
  deleteVariantAction,
  setVariantActiveAction,
} from "@/app/actions/products";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import type { Supplier, VariantWithStock } from "@/types/catalog";

export function VariantsTable({
  productId,
  productName,
  variants,
  suppliers,
  canManage,
  canDelete,
}: {
  productId: string;
  productName: string;
  variants: VariantWithStock[];
  suppliers: Pick<Supplier, "id" | "name">[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VariantWithStock | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VariantWithStock | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(variant: VariantWithStock) {
    setEditing(variant);
    setDialogOpen(true);
  }

  function toggleActive(variant: VariantWithStock) {
    setBusyId(variant.id);
    startTransition(async () => {
      const result = await setVariantActiveAction({
        id: variant.id,
        is_active: !variant.is_active,
      });
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(variant.is_active ? "تم تعطيل الموديل" : "تم تفعيل الموديل");
      router.refresh();
    });
  }

  function remove(variant: VariantWithStock) {
    startTransition(async () => {
      const result = await deleteVariantAction({ id: variant.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حذف الموديل");
      setPendingDelete(null);
      router.refresh();
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b py-5">
        <div className="space-y-1.5">
          <CardTitle>الموديلات</CardTitle>
          <CardDescription>
            {formatNumber(variants.length)} موديل · المخزون يُحتسب لكل موديل على
            حدة.
          </CardDescription>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            إضافة موديل
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {variants.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="لا توجد موديلات"
            description="أضف موديلاً بلون ومقاس ليصبح المنتج قابلاً للبيع."
            action={
              canManage ? (
                <Button onClick={openCreate}>
                  <Plus className="size-4" />
                  إضافة موديل
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">SKU</TableHead>
                  <TableHead className="text-start">الباركود</TableHead>
                  <TableHead className="text-start">اللون</TableHead>
                  <TableHead className="text-start">المقاس</TableHead>
                  <TableHead className="text-start">المورد</TableHead>
                  <TableHead className="text-start">سعر الشراء</TableHead>
                  <TableHead className="text-start">سعر البيع</TableHead>
                  <TableHead className="text-start">المخزون</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  <TableHead className="w-16 text-start">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>
                      <Link
                        href={`/products/${productId}/variants/${variant.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        <bdi className="block text-right">{variant.sku}</bdi>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {variant.barcode ? (
                        <bdi className="block text-right">{variant.barcode}</bdi>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {variant.color ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {variant.size ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {variant.supplier_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(variant.purchase_price)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(variant.selling_price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {formatNumber(variant.current_stock)}
                        </span>
                        <StockBadge stock={variant.current_stock} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <ActiveBadge isActive={variant.is_active} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`إجراءات ${variant.sku}`}
                            disabled={busyId === variant.id}
                          >
                            {busyId === variant.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link
                              href={`/products/${productId}/variants/${variant.id}`}
                            >
                              <Layers className="size-4" />
                              التفاصيل والمخزون
                            </Link>
                          </DropdownMenuItem>

                          {canManage ? (
                            <>
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => openEdit(variant)}
                              >
                                <Pencil className="size-4" />
                                تعديل
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer"
                                variant={
                                  variant.is_active ? "destructive" : "default"
                                }
                                onSelect={() => toggleActive(variant)}
                              >
                                {variant.is_active ? (
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

                          {canDelete ? (
                            <DropdownMenuItem
                              variant="destructive"
                              className="cursor-pointer"
                              onSelect={() => setPendingDelete(variant)}
                            >
                              <Trash2 className="size-4" />
                              حذف نهائي
                            </DropdownMenuItem>
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

      {dialogOpen ? (
        <VariantDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          productId={productId}
          productName={productName}
          variant={editing}
          suppliers={suppliers}
        />
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="حذف الموديل نهائياً"
        description="لا يمكن حذف موديل له حركة مخزون؛ في هذه الحالة عطّله بدلاً من حذفه. هذا الإجراء لا يمكن التراجع عنه."
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={() => {
          if (pendingDelete) remove(pendingDelete);
        }}
      />
    </Card>
  );
}
