"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createSupplierAction,
  updateSupplierAction,
} from "@/app/actions/suppliers";
import { supplierSchema } from "@/lib/validation/catalog";
import type { Supplier } from "@/types/catalog";

type FormValues = z.input<typeof supplierSchema>;

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent when creating. */
  supplier?: Supplier | null;
}) {
  const router = useRouter();
  const isEdit = !!supplier;
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      phone: supplier?.phone ?? "",
      whatsapp: supplier?.whatsapp ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      notes: supplier?.notes ?? "",
      is_active: supplier?.is_active ?? true,
    },
  });

  const isActive = useWatch({ control, name: "is_active" });

  function onSubmit() {
    setFormError(null);
    const raw = getValues();

    startTransition(async () => {
      const result = isEdit
        ? await updateSupplierAction({ ...raw, id: supplier.id })
        : await createSupplierAction(raw);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            setError(path as never, { message });
          }
        }
        return;
      }

      toast.success(isEdit ? "تم تحديث بيانات المورد" : "تم إضافة المورد");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المورد" : "إضافة مورد"}</DialogTitle>
          <DialogDescription>
            بيانات المورد ووسائل التواصل معه. المشتريات تُربط بالمورد في المرحلة
            القادمة.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError ? (
            <div
              role="alert"
              className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier_name">
                اسم المورد <span className="text-destructive">*</span>
              </Label>
              <Input
                id="supplier_name"
                className="h-11"
                placeholder="مثال: شركة الأقمشة الحديثة"
                aria-invalid={!!errors.name}
                disabled={isPending}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-destructive text-xs">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier_phone">رقم الهاتف</Label>
              <Input
                id="supplier_phone"
                dir="ltr"
                className="h-11 text-left"
                placeholder="+962 7 9999 9999"
                aria-invalid={!!errors.phone}
                disabled={isPending}
                {...register("phone")}
              />
              {errors.phone ? (
                <p className="text-destructive text-xs">
                  {errors.phone.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier_whatsapp">رقم الواتساب</Label>
              <Input
                id="supplier_whatsapp"
                dir="ltr"
                className="h-11 text-left"
                placeholder="+962 7 9999 9999"
                aria-invalid={!!errors.whatsapp}
                disabled={isPending}
                {...register("whatsapp")}
              />
              {errors.whatsapp ? (
                <p className="text-destructive text-xs">
                  {errors.whatsapp.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier_email">البريد الإلكتروني</Label>
              <Input
                id="supplier_email"
                type="email"
                dir="ltr"
                className="h-11 text-left"
                placeholder="name@example.com"
                aria-invalid={!!errors.email}
                disabled={isPending}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-destructive text-xs">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier_address">العنوان</Label>
              <Input
                id="supplier_address"
                className="h-11"
                disabled={isPending}
                {...register("address")}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="supplier_notes">ملاحظات</Label>
              <Textarea
                id="supplier_notes"
                rows={3}
                disabled={isPending}
                {...register("notes")}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 sm:col-span-2">
              <div className="space-y-0.5">
                <Label htmlFor="supplier_active">المورد نشط</Label>
                <p className="text-muted-foreground text-xs">
                  الموردون غير النشطين لا يظهرون عند اختيار مورد للموديل.
                </p>
              </div>
              <Switch
                id="supplier_active"
                checked={isActive ?? true}
                onCheckedChange={(checked) => setValue("is_active", checked)}
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
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : isEdit ? (
                "حفظ التعديلات"
              ) : (
                "إضافة المورد"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
