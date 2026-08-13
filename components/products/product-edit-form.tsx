"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CategorySelect } from "./category-select";
import { updateProductAction } from "@/app/actions/products";
import { updateProductSchema } from "@/lib/validation/catalog";
import type { Category, ProductWithDetails } from "@/types/catalog";

type FormValues = z.input<typeof updateProductSchema>;

/** Edits the product template only — variants have their own dialog. */
export function ProductEditForm({
  product,
  categories,
  canCreateCategory,
}: {
  product: ProductWithDetails;
  categories: Category[];
  canCreateCategory: boolean;
}) {
  const router = useRouter();
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
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      category_id: product.category_id,
      brand: product.brand ?? "",
      base_selling_price:
        product.base_selling_price === null
          ? ""
          : String(product.base_selling_price),
      is_active: product.is_active,
    },
  });

  const categoryId = useWatch({ control, name: "category_id" });
  const isActive = useWatch({ control, name: "is_active" });

  function onSubmit() {
    setFormError(null);
    const raw = getValues();

    startTransition(async () => {
      const result = await updateProductAction(raw);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            setError(path as never, { message });
          }
        }
        return;
      }

      toast.success("تم تحديث المنتج");
      router.push(`/products/${product.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError ? (
        <div
          role="alert"
          className="border-destructive/25 bg-destructive/8 text-destructive flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="leading-relaxed">{formError}</span>
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">
              اسم المنتج <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              className="h-11"
              aria-invalid={!!errors.name}
              disabled={isPending}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-destructive text-xs">{errors.name.message}</p>
            ) : null}
          </div>

          <CategorySelect
            value={categoryId}
            onChange={(value) =>
              setValue("category_id", value, { shouldValidate: true })
            }
            categories={categories}
            disabled={isPending}
            error={errors.category_id?.message}
            canCreate={canCreateCategory}
          />

          <div className="space-y-2">
            <Label htmlFor="brand">العلامة التجارية</Label>
            <Input
              id="brand"
              className="h-11"
              disabled={isPending}
              {...register("brand")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_selling_price">السعر الأساسي</Label>
            <Input
              id="base_selling_price"
              inputMode="decimal"
              dir="ltr"
              className="h-11 text-left"
              placeholder="0.00"
              aria-invalid={!!errors.base_selling_price}
              disabled={isPending}
              {...register("base_selling_price")}
            />
            {errors.base_selling_price ? (
              <p className="text-destructive text-xs">
                {errors.base_selling_price.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 sm:mt-7">
            <div className="space-y-0.5">
              <Label htmlFor="is_active">المنتج نشط</Label>
              <p className="text-muted-foreground text-xs">
                التعطيل يحافظ على السجلات ويخفي المنتج من البيع.
              </p>
            </div>
            <Switch
              id="is_active"
              checked={isActive ?? true}
              onCheckedChange={(checked) => setValue("is_active", checked)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">الوصف</Label>
            <Textarea
              id="description"
              rows={4}
              disabled={isPending}
              {...register("description")}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            "حفظ التعديلات"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.push(`/products/${product.id}`)}
          disabled={isPending}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
