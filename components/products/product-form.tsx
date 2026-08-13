"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CategorySelect } from "./category-select";
import { VariantFields, type VariantFieldValues } from "./variant-fields";
import { createProductAction } from "@/app/actions/products";
import { createProductSchema } from "@/lib/validation/catalog";
import type { Category, Supplier } from "@/types/catalog";

type FormValues = z.input<typeof createProductSchema>;

const emptyVariant: VariantFieldValues = {
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

/**
 * Create-product form: the template plus one or more variants, saved together.
 *
 * The form holds raw strings and hands them straight to the Server Action,
 * which re-runs the same Zod schema. Client validation is for feedback only.
 */
export function ProductForm({
  categories,
  suppliers,
  canCreateCategory,
}: {
  categories: Category[];
  suppliers: Pick<Supplier, "id" | "name">[];
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
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: "",
      description: "",
      category_id: undefined,
      brand: "",
      base_selling_price: "",
      is_active: true,
      variants: [{ ...emptyVariant }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  // One subscription for the whole form rather than a watch() per field —
  // useWatch is memoization-safe, watch() is not.
  const productName = useWatch({ control, name: "name" }) ?? "";
  const categoryId = useWatch({ control, name: "category_id" });
  const isActive = useWatch({ control, name: "is_active" });
  const watchedVariants = useWatch({ control, name: "variants" });

  function onSubmit() {
    setFormError(null);
    const raw = getValues();

    startTransition(async () => {
      const result = await createProductAction(raw);

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            // Server paths arrive dotted ("variants.0.sku") and map 1:1 onto
            // the form field names.
            setError(path as never, { message });
          }
        }
        return;
      }

      toast.success("تم إنشاء المنتج بنجاح");
      router.push(`/products/${result.data?.id}`);
      router.refresh();
    });
  }

  const variantErrors = errors.variants;

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

      {/* ------------------------------------------------------- template */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات المنتج</CardTitle>
          <CardDescription>
            المنتج هو الموديل العام. الموديلات (الألوان والمقاسات) تُضاف بالأسفل.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">
                اسم المنتج <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                className="h-11"
                placeholder="مثال: ثوب كلاسيك"
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
                placeholder="بيت القفطان"
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
              ) : (
                <p className="text-muted-foreground text-xs">
                  سعر إرشادي فقط. السعر الفعلي يُحدَّد لكل موديل.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3 sm:mt-7">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">المنتج نشط</Label>
                <p className="text-muted-foreground text-xs">
                  المنتجات غير النشطة تبقى في السجلات ولا تظهر للبيع.
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
                rows={3}
                placeholder="وصف مختصر للمنتج وخاماته."
                disabled={isPending}
                {...register("description")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- variants */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>الموديلات</CardTitle>
            <CardDescription>
              كل موديل هو قطعة قابلة للبيع بلون ومقاس محددين، وله مخزونه الخاص.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ ...emptyVariant })}
            disabled={isPending}
          >
            <Plus className="size-4" />
            إضافة موديل
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {typeof variantErrors?.message === "string" ? (
            <p className="text-destructive text-sm">{variantErrors.message}</p>
          ) : null}

          {fields.map((field, index) => {
            const rowErrors = Array.isArray(variantErrors)
              ? variantErrors[index]
              : undefined;

            const current = watchedVariants?.[index];
            const value: VariantFieldValues = {
              sku: (current?.sku as string) ?? "",
              barcode: (current?.barcode as string) ?? "",
              color: (current?.color as string) ?? "",
              size: (current?.size as string) ?? "",
              supplier_id: (current?.supplier_id as string | null) ?? null,
              purchase_price: (current?.purchase_price as string) ?? "",
              selling_price: (current?.selling_price as string) ?? "",
              initial_stock: (current?.initial_stock as string) ?? "0",
              is_active: (current?.is_active as boolean) ?? true,
            };

            return (
              <div key={field.id} className="space-y-4">
                {index > 0 ? <Separator /> : null}
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm font-medium">
                    الموديل {index + 1}
                  </p>
                </div>

                <VariantFields
                  value={value}
                  index={index}
                  productName={productName}
                  suppliers={suppliers}
                  disabled={isPending}
                  errors={{
                    sku: rowErrors?.sku?.message,
                    barcode: rowErrors?.barcode?.message,
                    purchase_price: rowErrors?.purchase_price?.message,
                    selling_price: rowErrors?.selling_price?.message,
                    initial_stock: rowErrors?.initial_stock?.message,
                  }}
                  onChange={(patch) => {
                    for (const [key, patchValue] of Object.entries(patch)) {
                      setValue(
                        `variants.${index}.${key}` as never,
                        patchValue as never,
                        { shouldValidate: false },
                      );
                    }
                  }}
                  onRemove={
                    fields.length > 1 ? () => remove(index) : undefined
                  }
                />
              </div>
            );
          })}
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
            "حفظ المنتج"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => router.push("/products")}
          disabled={isPending}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}
