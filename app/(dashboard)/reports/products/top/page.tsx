import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PackageSearch } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { ReportSortPicker } from "@/components/reports/report-sort-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getProductReport } from "@/lib/reports/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { isDatePreset, resolveDateRange, DATE_PRESETS } from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { PRODUCT_SORTS, type ProductSort } from "@/types/reports";

export const metadata: Metadata = { title: "أكثر المنتجات مبيعاً" };

export default async function TopProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; from?: string; to?: string;
    category?: string; brand?: string; supplier?: string;
    sort?: string; page?: string; perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_SALES_REPORT");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });
  const sort = (PRODUCT_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as ProductSort)
    : "quantity";

  const data = await getProductReport({
    range,
    categoryId: params.category,
    brand: params.brand,
    supplierId: params.supplier,
    sort,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT_REPORT");
  const canExport = hasPermission(profile, "EXPORT_REPORTS");
  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";

  // Totals for the visible page, so the footer never implies it is summing
  // rows the reader cannot see.
  const pageTotals = data.rows.reduce(
    (acc, row) => ({
      net_quantity: acc.net_quantity + Number(row.net_quantity),
      net_revenue: acc.net_revenue + Number(row.net_revenue),
      cogs: acc.cogs + Number(row.cogs),
      gross_profit: acc.gross_profit + Number(row.gross_profit),
    }),
    { net_quantity: 0, net_revenue: 0, cogs: 0, gross_profit: 0 },
  );

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="أكثر المنتجات مبيعاً"
        description={`أداء كل موديل خلال ${presetLabel}. الكميات والإيرادات صافية بعد المرتجعات.`}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar exportReport="products" canExport={canExport}>
              <ReportSortPicker sort={sort} />
            </ReportToolbar>
          </>
        }
      />

      {/* The printed sheet needs its own context; the toolbar is hidden there. */}
      <div className="hidden print:block">
        <p className="text-sm">
          بيت القفطان — أكثر المنتجات مبيعاً · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>المنتجات</CardTitle>
          <CardDescription>
            صافي الكمية والمبيعات بعد خصم المرتجعات، والتكلفة بسعر الشراء وقت
            البيع لا بالسعر الحالي.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="لا توجد بيانات"
              description="لا توجد بيانات ضمن الفترة المحددة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">المنتج</TableHead>
                      <TableHead className="text-start">SKU</TableHead>
                      <TableHead className="text-start">التصنيف</TableHead>
                      <TableHead className="text-start">المباعة</TableHead>
                      <TableHead className="text-start">المرتجعة</TableHead>
                      <TableHead className="text-start">صافي الكمية</TableHead>
                      <TableHead className="text-start">صافي المبيعات</TableHead>
                      {canSeeProfit ? (
                        <>
                          <TableHead className="text-start">التكلفة</TableHead>
                          <TableHead className="text-start">الربح</TableHead>
                          <TableHead className="text-start">الهامش</TableHead>
                        </>
                      ) : null}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.variant_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/products/${row.product_id}/variants/${row.variant_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.product_name}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {[row.color, row.size].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          <bdi className="block text-right">{row.sku}</bdi>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.category_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatNumber(row.sold_quantity)}
                        </TableCell>
                        <TableCell className="text-destructive text-sm tabular-nums">
                          {row.returned_quantity > 0
                            ? formatNumber(row.returned_quantity)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium tabular-nums">
                          {formatNumber(row.net_quantity)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatMoney(row.net_revenue)}
                        </TableCell>
                        {canSeeProfit ? (
                          <>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatMoney(row.cogs)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-sm font-medium",
                                Number(row.gross_profit) >= 0
                                  ? "text-success"
                                  : "text-destructive",
                              )}
                            >
                              {formatMoney(row.gross_profit)}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {formatPercent(Number(row.margin))}
                            </TableCell>
                          </>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  إجمالي الصفحة · صافي الكمية{" "}
                  <span className="text-foreground font-medium">
                    {formatNumber(pageTotals.net_quantity)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  صافي المبيعات{" "}
                  <span className="text-foreground font-medium">
                    {formatMoney(pageTotals.net_revenue)}
                  </span>
                </span>
                {canSeeProfit ? (
                  <span className="text-muted-foreground">
                    الربح{" "}
                    <span className="text-success font-medium">
                      {formatMoney(pageTotals.gross_profit)}
                    </span>
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {data.total} موديل · صفحة {data.page} من {data.totalPages}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
