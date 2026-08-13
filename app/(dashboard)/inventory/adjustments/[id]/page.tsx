import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { AdjustmentActions } from "@/components/inventory/adjustment-actions";
import {
  AdjustmentReasonBadge,
  DifferenceBadge,
  ReturnStatusBadge,
} from "@/components/returns/return-badges";
import { ProductThumb } from "@/components/catalog/product-thumb";
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
import { getAdjustmentById } from "@/lib/returns/queries";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "تفاصيل تعديل المخزون" };

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_INVENTORY_ADJUSTMENTS");
  const { id } = await params;

  const adjustment = await getAdjustmentById(id);
  if (!adjustment) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={adjustment.adjustment_number}
        description={`تعديل بتاريخ ${formatDate(adjustment.adjustment_date)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/inventory/adjustments">
                <ChevronRight className="size-4" />
                التعديلات
              </Link>
            </Button>
            <AdjustmentActions
              adjustment={adjustment}
              canCancel={hasPermission(profile, "CANCEL_INVENTORY_ADJUSTMENTS")}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ReturnStatusBadge status={adjustment.status} />
        <AdjustmentReasonBadge reason={adjustment.reason} />
        {adjustment.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّله {adjustment.created_by_name}
          </span>
        ) : null}
      </div>

      {adjustment.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذا التعديل
              {adjustment.cancelled_at
                ? ` بتاريخ ${formatDateTime(adjustment.cancelled_at)}`
                : ""}
            </p>
            {adjustment.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {adjustment.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              تم عكس فروقات الكميات بحركات مخزون معاكسة. الحركات الأصلية محفوظة
              كما هي.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الكميات</CardTitle>
          <CardDescription>
            كمية النظام محفوظة كما كانت لحظة الجرد داخل نفس المعاملة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16 text-start">الصورة</TableHead>
                  <TableHead className="text-start">المنتج</TableHead>
                  <TableHead className="text-start">SKU</TableHead>
                  <TableHead className="text-start">كمية النظام</TableHead>
                  <TableHead className="text-start">الكمية الفعلية</TableHead>
                  <TableHead className="text-start">الفرق</TableHead>
                  <TableHead className="text-start">ملاحظة</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {adjustment.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <ProductThumb
                        url={item.image_url}
                        alt={item.product_name_snapshot}
                        className="size-11"
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{item.product_name_snapshot}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.color_snapshot ?? ""}
                        {item.size_snapshot ? ` · ${item.size_snapshot}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <bdi className="block text-right">{item.variant_sku_snapshot}</bdi>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatNumber(item.system_quantity)}
                    </TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">
                      {formatNumber(item.actual_quantity)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <DifferenceBadge value={item.difference_quantity} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
            <span className="text-muted-foreground">
              عدد المنتجات{" "}
              <span className="text-foreground font-medium">
                {formatNumber(adjustment.items_count)}
              </span>
            </span>
            <span className="text-muted-foreground">
              إجمالي الزيادة <DifferenceBadge value={adjustment.total_increase} />
            </span>
            <span className="text-muted-foreground">
              إجمالي النقص <DifferenceBadge value={-adjustment.total_decrease} />
            </span>
          </div>
        </CardContent>
      </Card>

      {adjustment.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{adjustment.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
