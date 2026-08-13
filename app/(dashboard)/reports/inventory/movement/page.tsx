import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { UrlSelect } from "@/components/reports/url-select";
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
import { getInventoryMovementReport } from "@/lib/reports/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  INVENTORY_TRANSACTION_TYPES,
  STOCK_STATE_LABELS,
  TRANSACTION_TYPE_LABELS,
  type InventoryTransactionType,
  type StockState,
} from "@/types/catalog";

export const metadata: Metadata = { title: "حركة المخزون" };

/** Where a movement's reference document lives, so a row can be traced back. */
const REFERENCE_HREF: Record<string, (id: string) => string> = {
  sale: (id) => `/sales/${id}`,
  purchase: (id) => `/purchases/${id}`,
  return: (id) => `/returns/${id}`,
  exchange: (id) => `/exchanges/${id}`,
  stock_adjustment: (id) => `/inventory/adjustments/${id}`,
};

const TYPE_OPTIONS = [
  { value: "ALL", label: "كل الحركات" },
  ...INVENTORY_TRANSACTION_TYPES.map((value) => ({
    value,
    label: TRANSACTION_TYPE_LABELS[value],
  })),
];

export default async function InventoryMovementPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; from?: string; to?: string;
    variant?: string; type?: string; page?: string; perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_INVENTORY_REPORT");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });
  // Allowlisted, never passed through raw (§103).
  const type = TYPE_OPTIONS.some((option) => option.value === params.type)
    ? (params.type as string)
    : "ALL";

  const data = await getInventoryMovementReport({
    range,
    variantId: params.variant,
    type,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  const canExport = hasPermission(profile, "EXPORT_REPORTS");
  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";
  const pageIn = data.rows.reduce((sum, row) => sum + Number(row.quantity_in), 0);
  const pageOut = data.rows.reduce((sum, row) => sum + Number(row.quantity_out), 0);

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="حركة المخزون"
        description={`كل حركة دخول وخروج خلال ${presetLabel}، مع المستند الذي سبّبها. السجل غير قابل للتعديل.`}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar exportReport="inventory-movement" canExport={canExport}>
              <UrlSelect
                param="type"
                value={type}
                label="نوع الحركة"
                options={TYPE_OPTIONS}
                className="h-10 w-48"
              />
            </ReportToolbar>
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">
          بيت القفطان — حركة المخزون · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>الحركات</CardTitle>
          <CardDescription>
            كل صف هنا هو سبب تغيّر رصيد موديل. لا يتغير رصيد دون صف مقابل.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="لا توجد حركات"
              description="لا توجد حركات مخزون ضمن الفترة والفلاتر المحددة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">المنتج</TableHead>
                      <TableHead className="text-start">SKU</TableHead>
                      <TableHead className="text-start">الحركة</TableHead>
                      <TableHead className="text-start">الحالة</TableHead>
                      <TableHead className="text-start">وارد</TableHead>
                      <TableHead className="text-start">صادر</TableHead>
                      <TableHead className="text-start">المرجع</TableHead>
                      <TableHead className="text-start">المستخدم</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {data.rows.map((row) => {
                      const href =
                        row.reference_type && row.reference_id
                          ? REFERENCE_HREF[row.reference_type]?.(row.reference_id)
                          : undefined;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDateTime(row.moved_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link
                              href={`/inventory?variant=${row.variant_id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {row.product_name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            <bdi className="block text-right">{row.sku}</bdi>
                          </TableCell>
                          <TableCell className="text-sm">
                            {TRANSACTION_TYPE_LABELS[
                              row.transaction_type as InventoryTransactionType
                            ] ?? row.transaction_type}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                row.stock_state === "DAMAGED" &&
                                  "border-destructive/40 text-destructive",
                              )}
                            >
                              {STOCK_STATE_LABELS[row.stock_state as StockState] ??
                                row.stock_state}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-success text-sm font-medium tabular-nums">
                            {row.quantity_in > 0 ? formatNumber(row.quantity_in) : "—"}
                          </TableCell>
                          <TableCell className="text-destructive text-sm font-medium tabular-nums">
                            {row.quantity_out > 0 ? formatNumber(row.quantity_out) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {href ? (
                              <Link
                                href={href}
                                className="text-primary hover:underline"
                              >
                                عرض المستند
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">
                                {row.notes ?? "—"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {row.actor_name ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  وارد الصفحة{" "}
                  <span className="text-success font-medium">{formatNumber(pageIn)}</span>
                </span>
                <span className="text-muted-foreground">
                  صادر الصفحة{" "}
                  <span className="text-destructive font-medium">
                    {formatNumber(pageOut)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {data.total} حركة · صفحة {data.page} من {data.totalPages}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
