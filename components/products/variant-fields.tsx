"use client";

import { TriangleAlert, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateProfit, formatMoney, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Supplier } from "@/types/catalog";

const NO_SUPPLIER = "__none__";

export interface VariantFieldValues {
  sku: string;
  barcode: string;
  color: string;
  size: string;
  supplier_id: string | null;
  purchase_price: string;
  selling_price: string;
  initial_stock: string;
  is_active: boolean;
}

/**
 * Suggests a SKU like `THB-WHT-56-1`.
 *
 * Deliberately only a suggestion: the field stays fully editable, because the
 * shop's existing SKUs will not follow whatever scheme we invent.
 */
export function suggestSku(
  productName: string,
  color: string,
  size: string,
  index: number,
): string {
  const slug = (value: string, length: number) =>
    value
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, length)
      .toUpperCase();

  const parts = [
    slug(productName, 4) || "PRD",
    slug(color, 3),
    slug(size, 4),
    String(index + 1).padStart(2, "0"),
  ].filter(Boolean);

  return parts.join("-");
}

/** One editable variant row. Layout is shared by create and edit. */
export function VariantFields({
  value,
  onChange,
  errors,
  suppliers,
  disabled,
  showInitialStock = true,
  productName = "",
  index = 0,
  onRemove,
}: {
  value: VariantFieldValues;
  onChange: (patch: Partial<VariantFieldValues>) => void;
  errors?: Partial<Record<keyof VariantFieldValues, string>>;
  suppliers: Pick<Supplier, "id" | "name">[];
  disabled?: boolean;
  showInitialStock?: boolean;
  productName?: string;
  index?: number;
  onRemove?: () => void;
}) {
  const purchase = Number(value.purchase_price) || 0;
  const selling = Number(value.selling_price) || 0;
  const { profit, margin } = calculateProfit(purchase, selling);

  // Informational only — a deliberate loss-leader is still allowed.
  const belowCost =
    value.purchase_price !== "" &&
    value.selling_price !== "" &&
    selling < purchase;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>
            رقم SKU <span className="text-destructive">*</span>
          </Label>
          <div className="flex gap-1.5">
            <Input
              dir="ltr"
              className="h-10 text-left"
              value={value.sku}
              onChange={(event) => onChange({ sku: event.target.value })}
              placeholder="THB-WHT-56"
              aria-invalid={!!errors?.sku}
              disabled={disabled}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 shrink-0"
              disabled={disabled}
              aria-label="اقتراح رقم SKU"
              title="اقتراح رقم SKU"
              onClick={() =>
                onChange({
                  sku: suggestSku(productName, value.color, value.size, index),
                })
              }
            >
              <Wand2 className="size-4" />
            </Button>
          </div>
          {errors?.sku ? (
            <p className="text-destructive text-xs">{errors.sku}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>الباركود</Label>
          <Input
            dir="ltr"
            className="h-10 text-left"
            value={value.barcode}
            onChange={(event) => onChange({ barcode: event.target.value })}
            placeholder="اختياري"
            aria-invalid={!!errors?.barcode}
            disabled={disabled}
          />
          {errors?.barcode ? (
            <p className="text-destructive text-xs">{errors.barcode}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>اللون</Label>
          <Input
            className="h-10"
            value={value.color}
            onChange={(event) => onChange({ color: event.target.value })}
            placeholder="أبيض"
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label>المقاس</Label>
          <Input
            className="h-10"
            value={value.size}
            onChange={(event) => onChange({ size: event.target.value })}
            placeholder="56"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>
            سعر الشراء <span className="text-destructive">*</span>
          </Label>
          <Input
            inputMode="decimal"
            dir="ltr"
            className="h-10 text-left"
            value={value.purchase_price}
            onChange={(event) =>
              onChange({ purchase_price: event.target.value })
            }
            placeholder="0.00"
            aria-invalid={!!errors?.purchase_price}
            disabled={disabled}
          />
          {errors?.purchase_price ? (
            <p className="text-destructive text-xs">{errors.purchase_price}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>
            سعر البيع <span className="text-destructive">*</span>
          </Label>
          <Input
            inputMode="decimal"
            dir="ltr"
            className={cn(
              "h-10 text-left",
              belowCost && "border-gold focus-visible:ring-gold/30",
            )}
            value={value.selling_price}
            onChange={(event) => onChange({ selling_price: event.target.value })}
            placeholder="0.00"
            aria-invalid={!!errors?.selling_price}
            disabled={disabled}
          />
          {errors?.selling_price ? (
            <p className="text-destructive text-xs">{errors.selling_price}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>المورد</Label>
          <Select
            value={value.supplier_id ?? NO_SUPPLIER}
            onValueChange={(next) =>
              onChange({ supplier_id: next === NO_SUPPLIER ? null : next })
            }
            disabled={disabled || suppliers.length === 0}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue
                placeholder={
                  suppliers.length === 0 ? "لا يوجد موردون" : "بدون مورد"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SUPPLIER}>بدون مورد</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showInitialStock ? (
          <div className="space-y-2">
            <Label>الرصيد الابتدائي</Label>
            <Input
              inputMode="numeric"
              dir="ltr"
              className="h-10 text-left"
              value={value.initial_stock}
              onChange={(event) =>
                onChange({ initial_stock: event.target.value })
              }
              placeholder="0"
              aria-invalid={!!errors?.initial_stock}
              disabled={disabled}
            />
            {errors?.initial_stock ? (
              <p className="text-destructive text-xs">{errors.initial_stock}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                يُسجَّل كحركة مخزون من نوع «الرصيد الابتدائي».
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            الربح المتوقع:{" "}
            <span
              className={cn(
                "font-medium",
                profit >= 0 ? "text-success" : "text-destructive",
              )}
            >
              {formatMoney(profit)}
            </span>
          </span>
          <span>
            هامش الربح:{" "}
            <span className="font-medium">{formatPercent(margin)}</span>
          </span>
        </div>

        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
          >
            <Trash2 className="size-4" />
            حذف الموديل
          </Button>
        ) : null}
      </div>

      {belowCost ? (
        <div
          role="status"
          className="border-gold/40 bg-gold/10 text-warning-foreground flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="leading-relaxed">
            سعر البيع أقل من سعر الشراء. يمكنك المتابعة إذا كان ذلك مقصوداً.
          </span>
        </div>
      ) : null}
    </div>
  );
}
