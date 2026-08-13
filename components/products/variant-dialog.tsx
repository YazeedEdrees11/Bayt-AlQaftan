"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { VariantFields, type VariantFieldValues } from "./variant-fields";
import { createVariantAction, updateVariantAction } from "@/app/actions/products";
import type { Supplier, VariantWithStock } from "@/types/catalog";

const empty: VariantFieldValues = {
  sku: "",
  barcode: "",
  color: "",
  size: "",
  supplier_id: null,
  purchase_price: "",
  selling_price: "",
  initial_stock: "0",
  is_active: true,
};

function toFormValues(variant: VariantWithStock): VariantFieldValues {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? "",
    color: variant.color ?? "",
    size: variant.size ?? "",
    supplier_id: variant.supplier_id,
    purchase_price: String(variant.purchase_price),
    selling_price: String(variant.selling_price),
    initial_stock: "0",
    is_active: variant.is_active,
  };
}

/**
 * Add or edit a single variant.
 *
 * Opening stock is only offered when creating: once a variant exists, its
 * stock may only move through the ledger.
 */
export function VariantDialog({
  open,
  onOpenChange,
  productId,
  productName,
  variant,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  /** Absent when creating. */
  variant?: VariantWithStock | null;
  suppliers: Pick<Supplier, "id" | "name">[];
}) {
  const router = useRouter();
  const isEdit = !!variant;
  const [values, setValues] = useState<VariantFieldValues>(
    variant ? toFormValues(variant) : { ...empty },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function submit() {
    setFormError(null);
    setFieldErrors({});

    const payload = {
      ...values,
      product_id: productId,
      ...(isEdit ? { id: variant.id } : {}),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateVariantAction(payload)
        : await createVariantAction(payload);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      toast.success(isEdit ? "تم تحديث الموديل" : "تم إضافة الموديل");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل الموديل" : "إضافة موديل"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "تعديل بيانات الموديل وأسعاره. تغيير المخزون يتم من صفحة الموديل."
              : `إضافة موديل جديد إلى «${productName}».`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {formError ? (
            <div
              role="alert"
              className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          ) : null}

          <VariantFields
            value={values}
            onChange={(patch) =>
              setValues((current) => ({ ...current, ...patch }))
            }
            suppliers={suppliers}
            disabled={isPending}
            showInitialStock={!isEdit}
            productName={productName}
            errors={fieldErrors}
          />

          <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="variant_active">الموديل نشط</Label>
              <p className="text-muted-foreground text-xs">
                الموديلات غير النشطة تبقى في السجلات ولا تُعرض للبيع.
              </p>
            </div>
            <Switch
              id="variant_active"
              checked={values.is_active}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, is_active: checked }))
              }
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            إلغاء
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : isEdit ? (
              "حفظ التعديلات"
            ) : (
              "إضافة الموديل"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
