import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { InventoryHistory } from "@/components/inventory/inventory-history";
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog";
import { DamageDialog } from "@/components/inventory/damage-dialog";
import { ActiveBadge, StockBadge } from "@/components/catalog/stock-badge";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getVariantById, getVariantTransactions } from "@/lib/catalog/queries";
import {
  calculateProfit,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";

export const metadata: Metadata = { title: "تفاصيل الموديل" };

export default async function VariantDetailPage({
  params,
}: {
  params: Promise<{ id: string; variantId: string }>;
}) {
  const { profile } = await requirePermission("VIEW_INVENTORY");
  const { id, variantId } = await params;

  const variant = await getVariantById(variantId);
  if (!variant || variant.product_id !== id) notFound();

  const transactions = await getVariantTransactions(variantId);

  const canAdjust = hasPermission(profile, "MANAGE_INVENTORY");
  const canRecordDamage = hasPermission(profile, "CREATE_INVENTORY_ADJUSTMENTS");
  const canSeeProfit = hasPermission(profile, "VIEW_PRODUCTS");

  const purchase = Number(variant.purchase_price);
  const selling = Number(variant.selling_price);
  const { profit, margin } = calculateProfit(purchase, selling);
  const stockValue = variant.current_stock * purchase;

  const title = [variant.color, variant.size].filter(Boolean).join(" / ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={variant.product.name}
        description={
          title
            ? `الموديل: ${title}`
            : "تفاصيل الموديل ومخزونه وحركته."
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/products/${id}`}>
                <ChevronRight className="size-4" />
                رجوع للمنتج
              </Link>
            </Button>
            {canAdjust ? (
              <StockAdjustDialog
                variantId={variant.id}
                sku={variant.sku}
                currentStock={variant.current_stock}
              />
            ) : null}
            {canRecordDamage ? (
              <DamageDialog
                variantId={variant.id}
                sku={variant.sku}
                availableQuantity={variant.current_stock}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>بيانات الموديل</CardTitle>
            <CardDescription>
              الموديل هو القطعة القابلة للبيع، والمخزون مرتبط به مباشرة.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col gap-6 sm:flex-row">
              <ProductThumb
                url={variant.image_url}
                alt={variant.product.name}
                className="size-36 shrink-0"
                rounded="rounded-2xl"
              />

              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <Field label="المنتج" value={variant.product.name} />
                <Field
                  label="التصنيف"
                  value={variant.product.category_name ?? "—"}
                />
                <Field label="اللون" value={variant.color ?? "—"} />
                <Field label="المقاس" value={variant.size ?? "—"} />
                <Field label="SKU" value={variant.sku} ltr />
                <Field label="الباركود" value={variant.barcode ?? "—"} ltr />
                <Field
                  label="المورد"
                  value={variant.supplier_name ?? "بدون مورد"}
                />
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs font-medium">
                    الحالة
                  </p>
                  <ActiveBadge isActive={variant.is_active} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>المخزون الحالي</CardDescription>
              <CardTitle className="text-4xl tabular-nums">
                {formatNumber(variant.current_stock)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StockBadge stock={variant.current_stock} />
              {variant.damaged_quantity > 0 ? (
                <div className="border-destructive/25 bg-destructive/5 flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">مخزون تالف</span>
                  <span className="text-destructive font-medium tabular-nums">
                    {formatNumber(variant.damaged_quantity)}
                  </span>
                </div>
              ) : null}
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">قيمة المخزون</span>
                <span className="font-medium">{formatMoney(stockValue)}</span>
              </div>
              <p className="text-muted-foreground text-xs">
                محسوبة بسعر الشراء وليس سعر البيع.
              </p>
            </CardContent>
          </Card>

          {canSeeProfit ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">الأسعار والربح</CardTitle>
                <CardDescription>
                  تقديري للعرض فقط — التقارير المالية في مرحلة لاحقة.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <Row label="سعر الشراء" value={formatMoney(purchase)} />
                <Row label="سعر البيع" value={formatMoney(selling)} />
                <Separator />
                <Row
                  label="الربح المتوقع"
                  value={formatMoney(profit)}
                  emphasis={profit >= 0 ? "positive" : "negative"}
                />
                <Row
                  label="هامش الربح"
                  value={formatPercent(margin)}
                  emphasis={margin >= 0 ? "positive" : "negative"}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <InventoryHistory transactions={transactions} />
    </div>
  );
}

function Field({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {ltr ? (
        <bdi className="block text-right text-sm font-medium">{value}</bdi>
      ) : (
        <p className="text-sm font-medium">{value}</p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          emphasis === "positive"
            ? "text-success font-semibold"
            : emphasis === "negative"
              ? "text-destructive font-semibold"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}
