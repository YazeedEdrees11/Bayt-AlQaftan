import type { Metadata } from "next";
import {
  Boxes,
  CircleAlert,
  Layers,
  PackageX,
  Shirt,
  Wallet,
} from "lucide-react";

import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { LowStockChart } from "@/components/inventory/low-stock-chart";
import { Button } from "@/components/ui/button";
import { InventoryBrowser } from "@/components/inventory/inventory-browser";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/require-auth";
import { getSettingBool } from "@/lib/settings/queries";
import {
  getInventorySummary,
  listActiveSuppliers,
  listCategories,
  listInventory,
  listVariantFacets,
} from "@/lib/catalog/queries";
import { LOW_STOCK_THRESHOLD, normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import type { StockStatusFilter } from "@/types/catalog";
import { getStockAlertReport } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "المخزون" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    supplier?: string;
    color?: string;
    size?: string;
    stock?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const [_auth, params, tracksDamaged] = await Promise.all([
    requirePermission("VIEW_INVENTORY"),
    searchParams,
    getSettingBool("track_damaged_stock", true),
  ]);

  const stockStatus = (
    ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(params.stock ?? "")
      ? params.stock
      : "ALL"
  ) as StockStatusFilter;

  const [summary, data, categories, suppliers, facets, stockAlerts] = await Promise.all([
    getInventorySummary(),
    listInventory({
      search: params.q,
      categoryId: params.category,
      supplierId: params.supplier,
      color: params.color,
      size: params.size,
      stockStatus,
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
    listCategories(),
    listActiveSuppliers(),
    listVariantFacets(),
    getStockAlertReport({ mode: "LOW", perPage: 5 }),
  ]);

  const chartData = stockAlerts.rows.map((row) => ({
    name: row.product_name || "بدون اسم",
    stock: row.current_stock,
  }));

  // Every figure below comes from the ledger — nothing is estimated.
  const hasData = summary.total_variants > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="المخزون"
        description="متابعة الكميات وحركة البضاعة. جميع الأرقام محسوبة من حركات المخزون الفعلية."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/inventory/adjustments">
                <ClipboardList className="size-4" />
                تعديلات المخزون
              </Link>
            </Button>
            {tracksDamaged ? (
              <Button asChild variant="outline">
                <Link href="/inventory/damaged">
                  <PackageX className="size-4" />
                  المخزون التالف
                </Link>
              </Button>
            ) : null}
          <Badge
            variant="outline"
            className="bg-accent text-accent-foreground border-accent-foreground/15"
          >
            حد المخزون المنخفض: {LOW_STOCK_THRESHOLD}
          </Badge>
          </>
        }
      />

      <section
        aria-label="ملخص المخزون"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="إجمالي المنتجات"
          icon={Shirt}
          value={hasData ? formatNumber(summary.total_products) : undefined}
          hint="عدد المنتجات المسجّلة"
        />
        <StatCard
          label="إجمالي الموديلات"
          icon={Layers}
          value={hasData ? formatNumber(summary.total_variants) : undefined}
          hint="الموديلات القابلة للبيع"
        />
        <StatCard
          label="إجمالي القطع"
          icon={Boxes}
          accent
          value={hasData ? formatNumber(summary.total_units) : undefined}
          hint="مجموع الكميات المتوفرة"
        />
        <StatCard
          label="قيمة المخزون"
          icon={Wallet}
          value={hasData ? formatMoney(summary.stock_value) : undefined}
          hint="محسوبة بسعر الشراء"
        />
        <StatCard
          label="مخزون منخفض"
          icon={CircleAlert}
          value={hasData ? formatNumber(summary.low_stock_count) : undefined}
          hint={`موديلات كميتها ${LOW_STOCK_THRESHOLD} أو أقل`}
        />
        <StatCard
          label="نفد المخزون"
          icon={PackageX}
          value={hasData ? formatNumber(summary.out_of_stock_count) : undefined}
          hint="موديلات كميتها صفر"
        />
      </section>

      <div className="grid gap-4 mt-4 mb-4">
        <div className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="flex flex-col space-y-1.5 p-6">
            <h3 className="font-semibold leading-none tracking-tight">تنبيهات المخزون المنخفض</h3>
            <p className="text-sm text-muted-foreground">أكثر المنتجات نقصاً في المخزون وبحاجة لإعادة طلب.</p>
          </div>
          <div className="p-6 pt-0">
            <LowStockChart data={chartData.length > 0 ? chartData : undefined} />
          </div>
        </div>
      </div>

      <InventoryBrowser
        data={data}
        categories={categories}
        suppliers={suppliers}
        colors={facets.colors}
        sizes={facets.sizes}
      />
    </div>
  );
}
