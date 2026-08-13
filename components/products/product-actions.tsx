"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  deleteProductAction,
  setProductActiveAction,
} from "@/app/actions/products";

export function ProductActions({
  productId,
  isActive,
  hasHistory,
  canManage,
  canDelete,
}: {
  productId: string;
  isActive: boolean;
  /** True when any variant carries inventory movements. */
  hasHistory: boolean;
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const result = await setProductActiveAction({
        id: productId,
        is_active: !isActive,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isActive ? "تم تعطيل المنتج" : "تم تفعيل المنتج");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProductAction({ id: productId });
      if (!result.ok) {
        toast.error(result.error);
        setConfirmDelete(false);
        return;
      }
      toast.success("تم حذف المنتج");
      router.push("/products");
      router.refresh();
    });
  }

  if (!canManage && !canDelete) return null;

  return (
    <>
      {canManage ? (
        <Button asChild variant="outline">
          <Link href={`/products/${productId}/edit`}>
            <Pencil className="size-4" />
            تعديل
          </Link>
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="إجراءات المنتج">
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52">
          {canManage ? (
            <DropdownMenuItem
              className="cursor-pointer"
              variant={isActive ? "destructive" : "default"}
              onSelect={toggleActive}
            >
              {isActive ? (
                <>
                  <ShieldOff className="size-4" />
                  تعطيل المنتج
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  تفعيل المنتج
                </>
              )}
            </DropdownMenuItem>
          ) : null}

          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                disabled={hasHistory}
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                حذف نهائي
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف المنتج نهائياً"
        description="سيتم حذف المنتج وكل موديلاته وصوره نهائياً. المنتجات التي لها حركة مخزون لا يمكن حذفها — عطّلها بدلاً من ذلك."
        confirmLabel="حذف نهائي"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
