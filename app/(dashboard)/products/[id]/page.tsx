import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Package } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ProductActions } from "@/components/products/product-actions";
import { ProductImagesManager } from "@/components/products/product-images-manager";
import { VariantsTable } from "@/components/products/variants-table";
import { ActiveBadge, StockBadge } from "@/components/catalog/stock-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getProductById, listActiveSuppliers } from "@/lib/catalog/queries";
import { formatMoney, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "تفاصيل المنتج" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_PRODUCTS");
  const { id } = await params;

  const product = await getProductById(id);
  if (!product) notFound();

  const canManage = hasPermission(profile, "UPDATE_PRODUCTS");
  const canDelete = hasPermission(profile, "DELETE_PRODUCTS");

  // Every active user may read supplier names; only managers get the picker.
  const suppliers = canManage ? await listActiveSuppliers() : [];

  // A product whose variants already moved stock must be deactivated, not
  // deleted; the database enforces the same rule.
  const hasHistory = product.total_stock > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={
          product.description ??
          "تفاصيل المنتج وموديلاته وأسعاره وصوره ومخزونه."
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/products">
                <ChevronRight className="size-4" />
                المنتجات
              </Link>
            </Button>
            <ProductActions
              productId={product.id}
              isActive={product.is_active}
              hasHistory={hasHistory}
              canManage={canManage}
              canDelete={canDelete}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{product.category?.name ?? "—"}</Badge>
        {product.brand ? (
          <Badge variant="outline">{product.brand}</Badge>
        ) : null}
        <ActiveBadge isActive={product.is_active} />
        <StockBadge stock={product.total_stock} showCount />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-muted-foreground text-sm">عدد الموديلات</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(product.variants.length)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-muted-foreground text-sm">إجمالي القطع</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(product.total_stock)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-muted-foreground text-sm">قيمة المخزون</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(product.stock_value)}
            </p>
            <p className="text-muted-foreground text-xs">
              محسوبة بسعر الشراء.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-5">
            <p className="text-muted-foreground text-sm">السعر الأساسي</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(product.base_selling_price)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProductImagesManager
            productId={product.id}
            productName={product.name}
            images={product.images}
            canManage={canManage}
          />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>بيانات المنتج</CardTitle>
            <CardDescription>الموديل العام لهذا المنتج.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                التصنيف
              </p>
              <p>{product.category?.name ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                العلامة التجارية
              </p>
              <p>{product.brand ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">الوصف</p>
              <p className="leading-relaxed">
                {product.description ?? "لا يوجد وصف."}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium">
                الحالة
              </p>
              <ActiveBadge isActive={product.is_active} />
            </div>
          </CardContent>
        </Card>
      </div>

      <VariantsTable
        productId={product.id}
        productName={product.name}
        variants={product.variants}
        suppliers={suppliers}
        canManage={canManage}
        canDelete={canDelete}
      />

      {product.variants.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex items-center gap-3 py-5 text-sm">
            <Package className="size-5 shrink-0" strokeWidth={1.6} />
            <span>
              لن يظهر هذا المنتج في المخزون حتى تتم إضافة موديل واحد على الأقل.
            </span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
