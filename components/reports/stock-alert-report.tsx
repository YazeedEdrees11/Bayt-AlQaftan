import Link from "next/link";
import { ChevronRight, PackageCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { getStockAlertReport } from "@/lib/reports/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { StockAlertMode } from "@/types/reports";

type Params = {
  category?: string;
  page?: string;
  perPage?: string;
};

const MODE_EXPORT: Record<StockAlertMode, string> = {
  LOW: "inventory-low-stock",
  OUT: "inventory-out-of-stock",
  DEAD: "inventory-dead-stock",
};

/**
 * The three stock-alert reports.
 *
 * Low stock, out of stock and dead stock are the same query with a different
 * predicate, so they are the same screen with a different mode. Splitting them
 * into three near-identical files would guarantee they drift apart.
 */
export async function StockAlertReport({
  mode,
  title,
  description,
  emptyTitle,
  emptyDescription,
  searchParams,
}: {
  mode: StockAlertMode;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  searchParams: Promise<Params>;
}) {
  const { profile } = await requirePermission("VIEW_INVENTORY_REPORT");
  const params = await searchParams;

  const data = await getStockAlertReport({
    mode,
    categoryId: params.category,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  const canExport = hasPermission(profile, "EXPORT_REPORTS");
  const pageCost = data.rows.reduce((sum, row) => sum + Number(row.stock_cost), 0);

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            {/* Stock levels are a snapshot, so a date filter would only mislead. */}
            <ReportToolbar
              showRange={false}
              exportReport={MODE_EXPORT[mode]}
              canExport={canExport}
            />
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">
          بيت القفطان — {title} · الوضع الحالي للمخزون
        </p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>{data.total > 0 ? `${data.total} موديل` : "الموديلات"}</CardTitle>
          <CardDescription>
            المخزون المعروض هو الصالح للبيع فقط؛ التالف يُعرض في شاشة التالف
            المستقلة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title={emptyTitle}
              description={emptyDescription}
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
                      <TableHead className="text-start">المورد</TableHead>
                      <TableHead className="text-start">المخزون</TableHead>
                      {mode === "LOW" ? (
                        <>
                          <TableHead className="text-start">الحد الأدنى</TableHead>
                          <TableHead className="text-start">النقص</TableHead>
                        </>
                      ) : null}
                      {mode === "DEAD" ? (
                        <>
                          <TableHead className="text-start">آخر بيع</TableHead>
                          <TableHead className="text-start">أيام الركود</TableHead>
                          <TableHead className="text-start">التكلفة</TableHead>
                        </>
                      ) : null}
                      {mode === "OUT" ? (
                        <>
                          <TableHead className="text-start">آخر بيع</TableHead>
                          <TableHead className="text-start">آخر شراء</TableHead>
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
                        <TableCell className="text-sm">
                          {row.supplier_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "tabular-nums",
                              row.current_stock === 0
                                ? "border-destructive/40 text-destructive"
                                : "border-warning/40 text-warning",
                            )}
                          >
                            {formatNumber(row.current_stock)}
                          </Badge>
                        </TableCell>
                        {mode === "LOW" ? (
                          <>
                            <TableCell className="text-sm tabular-nums">
                              {formatNumber(row.minimum_stock)}
                            </TableCell>
                            <TableCell className="text-destructive text-sm font-medium tabular-nums">
                              {formatNumber(row.shortfall)}
                            </TableCell>
                          </>
                        ) : null}
                        {mode === "DEAD" ? (
                          <>
                            <TableCell className="text-sm">
                              {row.last_sale_date ? formatDate(row.last_sale_date) : "لم يُبع"}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {row.days_since_sale === null
                                ? "—"
                                : formatNumber(row.days_since_sale)}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {formatMoney(row.stock_cost)}
                            </TableCell>
                          </>
                        ) : null}
                        {mode === "OUT" ? (
                          <>
                            <TableCell className="text-sm">
                              {row.last_sale_date ? formatDate(row.last_sale_date) : "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.last_purchase_date
                                ? formatDate(row.last_purchase_date)
                                : "—"}
                            </TableCell>
                          </>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                {mode === "DEAD" ? (
                  <span className="text-muted-foreground">
                    تكلفة الصفحة{" "}
                    <span className="text-foreground font-medium">
                      {formatMoney(pageCost)}
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
