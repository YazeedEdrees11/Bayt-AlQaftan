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
  createCustomerAction,
  updateCustomerAction,
} from "@/app/actions/sales";
import { customerSchema } from "@/lib/validation/sales";
import type { Customer } from "@/types/sales";

type FormValues = z.input<typeof customerSchema>;

/**
 * Create or edit a customer.
 *
 * Only the name is required — a walk-in who wants to be remembered can be
 * captured in one field without slowing the till down.
 */
export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  /** Lets the sale screen pick up a customer created inline. */
  onCreated?: (customer: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const isEdit = !!customer;
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
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      whatsapp: customer?.whatsapp ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      notes: customer?.notes ?? "",
      is_active: customer?.is_active ?? true,
    },
  });

  const isActive = useWatch({ control, name: "is_active" });

  function onSubmit() {
    setFormError(null);
    const raw = getValues();

    startTransition(async () => {
      const result = isEdit
        ? await updateCustomerAction({ ...raw, id: customer.id })
        : await createCustomerAction(raw);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            setError(path as never, { message });
          }
        }
        return;
      }

      toast.success(isEdit ? "تم تحديث بيانات العميل" : "تم إضافة العميل");
      if (!isEdit && result.data && onCreated) {
        const created = result.data as { id: string; name: string };
        onCreated({ id: created.id, name: created.name });
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل العميل" : "إضافة عميل"}</DialogTitle>
          <DialogDescription>
            الاسم وحده يكفي لإنشاء عميل. باقي البيانات اختيارية.
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
              <Label htmlFor="customer_name">
                اسم العميل <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer_name"
                className="h-11"
                placeholder="مثال: أحمد محمد"
                autoFocus
                aria-invalid={!!errors.name}
                disabled={isPending}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-destructive text-xs">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_phone">رقم الهاتف</Label>
              <Input
                id="customer_phone"
                dir="ltr"
                className="h-11 text-left"
                placeholder="+962 7 9999 9999"
                aria-invalid={!!errors.phone}
                disabled={isPending}
                {...register("phone")}
              />
              {errors.phone ? (
                <p className="text-destructive text-xs">{errors.phone.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer_whatsapp">رقم الواتساب</Label>
              <Input
                id="customer_whatsapp"
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
              <Label htmlFor="customer_email">البريد الإلكتروني</Label>
              <Input
                id="customer_email"
                type="email"
                dir="ltr"
                className="h-11 text-left"
                placeholder="name@example.com"
                aria-invalid={!!errors.email}
                disabled={isPending}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-destructive text-xs">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer_address">العنوان</Label>
              <Input
                id="customer_address"
                className="h-11"
                disabled={isPending}
                {...register("address")}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer_notes">ملاحظات</Label>
              <Textarea
                id="customer_notes"
                rows={3}
                placeholder="المقاسات المفضلة، ملاحظات التفصيل..."
                disabled={isPending}
                {...register("notes")}
              />
            </div>

            {isEdit ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 sm:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="customer_active">العميل نشط</Label>
                  <p className="text-muted-foreground text-xs">
                    العملاء غير النشطين لا يظهرون عند اختيار عميل للبيع.
                  </p>
                </div>
                <Switch
                  id="customer_active"
                  checked={isActive ?? true}
                  onCheckedChange={(checked) => setValue("is_active", checked)}
                  disabled={isPending}
                />
              </div>
            ) : null}
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
                "إضافة العميل"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
