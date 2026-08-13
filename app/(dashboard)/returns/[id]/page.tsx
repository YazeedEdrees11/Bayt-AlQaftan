import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReturnActions } from "@/components/returns/return-actions";
import {
  ConditionBadge,
  RefundMethodBadge,
  RefundStatusBadge,
  ReturnReasonBadge,
  ReturnStatusBadge,
  WalkInCell,
} from "@/components/returns/return-badges";
import { ProductThumb } from "@/components/catalog/product-thumb";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { getReturnById } from "@/lib/returns/queries";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تفاصيل المرتجع" };

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_RETURNS");
  const { id } = await params;

  const salesReturn = await getReturnById(id);
  if (!salesReturn) notFound();

  const canSeeValues = hasPermission(profile, "VIEW_RETURN_VALUES");
  const canRefund = hasPermission(profile, "CREATE_REFUNDS");
  const canCancel = hasPermission(profile, "CANCEL_RETURNS");
  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");

  const damagedCount = salesReturn.items
    .filter((item) => item.condition === "DAMAGED")
    .reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={salesReturn.return_number}
        description={`مرتجع بتاريخ ${formatDate(salesReturn.return_date)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/returns">
                <ChevronRight className="size-4" />
                المرتجعات
              </Link>
            </Button>
            <ReturnActions
              salesReturn={salesReturn}
              canRefund={canRefund}
              canCancel={canCancel}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ReturnStatusBadge status={salesReturn.status} />
        {canSeeValues ? <RefundStatusBadge status={salesReturn.refund_status} /> : null}
        <ReturnReasonBadge reason={salesReturn.reason} />
        <Link
          href={`/sales/${salesReturn.sale_id}`}
          className="text-primary text-sm hover:underline"
        >
          <bdi>{salesReturn.sale_number}</bdi>
        </Link>
        {salesReturn.customer ? (
          <Link
            href={`/customers/${salesReturn.customer.id}`}
            className="text-primary text-sm hover:underline"
          >
            {salesReturn.customer.name}
          </Link>
        ) : (
          <WalkInCell name={null} />
        )}
        {salesReturn.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّله {salesReturn.created_by_name}
          </span>
        ) : null}
      </div>

      {salesReturn.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذا المرتجع
              {salesReturn.cancelled_at
                ? ` بتاريخ ${formatDateTime(salesReturn.cancelled_at)}`
                : ""}
            </p>
            {salesReturn.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {salesReturn.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              تم سحب الكميات من المخزون وعكس الأثر المالي. الحركات الأصلية محفوظة
              كما هي.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {damagedCount > 0 ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              يحتوي هذا المرتجع على {formatNumber(damagedCount)} قطعة تالفة
            </p>
            <p className="text-muted-foreground leading-relaxed">
              القطع التالفة سُجّلت في المخزون التالف ولم تُضف إلى المخزون القابل
              للبيع.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ items */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>المنتجات المرتجعة</CardTitle>
          <CardDescription>
            الأسماء والأسعار والتكلفة محفوظة كما كانت وقت البيع.
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
                  <TableHead className="text-start">اللون</TableHead>
                  <TableHead className="text-start">المقاس</TableHead>
                  <TableHead className="text-start">الكمية</TableHead>
                  <TableHead className="text-start">الحالة</TableHead>
                  {canSeeValues ? (
                    <TableHead className="text-start">سعر البيع</TableHead>
                  ) : null}
                  {canSeeProfit ? (
                    <TableHead className="text-start">سعر التكلفة</TableHead>
                  ) : null}
                  {canSeeValues ? (
                    <TableHead className="text-start">قيمة الإرجاع</TableHead>
                  ) : null}
                  {canSeeProfit ? (
                    <TableHead className="text-start">عكس الربح</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>

              <TableBody>
                {salesReturn.items.map((item) => (
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
                      {item.reason ? (
                        <p className="text-muted-foreground text-xs">{item.reason}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      <bdi className="block text-right">{item.variant_sku_snapshot}</bdi>
                    </TableCell>
                    <TableCell className="text-sm">{item.color_snapshot ?? "—"}</TableCell>
                    <TableCell className="text-sm">{item.size_snapshot ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">
                      {formatNumber(item.quantity)}
                    </TableCell>
                    <TableCell>
                      <ConditionBadge condition={item.condition} />
                    </TableCell>
                    {canSeeValues ? (
                      <TableCell className="text-sm">
                        {formatMoney(item.unit_price)}
                      </TableCell>
                    ) : null}
                    {canSeeProfit ? (
                      <TableCell className="text-muted-foreground text-sm">
                        {formatMoney(item.unit_cost)}
                      </TableCell>
                    ) : null}
                    {canSeeValues ? (
                      <TableCell className="text-sm font-medium">
                        {formatMoney(item.total_amount)}
                      </TableCell>
                    ) : null}
                    {canSeeProfit ? (
                      <TableCell className="text-destructive text-sm font-medium">
                        − {formatMoney(item.gross_profit)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {canSeeValues ? (
            <div className="border-border/70 flex justify-end border-t p-4">
              <div className="w-full max-w-xs space-y-2.5 text-sm">
                <Row label="قيمة القطع" value={formatMoney(salesReturn.subtotal)} />
                <Row
                  label="حصة الخصم"
                  value={`− ${formatMoney(salesReturn.discount)}`}
                />
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-medium">قيمة المرتجع</span>
                  <span className="text-lg font-semibold">
                    {formatMoney(salesReturn.refund_amount)}
                  </span>
                </div>
                <Row
                  label="المسترد"
                  value={formatMoney(salesReturn.refunded_amount)}
                  tone="positive"
                />
                <Row
                  label="المتبقي كرصيد"
                  value={formatMoney(salesReturn.outstanding_refund)}
                  tone={salesReturn.outstanding_refund > 0 ? "negative" : undefined}
                />

                {canSeeProfit ? (
                  <>
                    <Separator />
                    <Row label="تكلفة القطع" value={formatMoney(salesReturn.total_cost)} />
                    <Row
                      label="عكس الربح"
                      value={`− ${formatMoney(salesReturn.profit_reversal)}`}
                      tone="negative"
                    />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {salesReturn.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{salesReturn.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- refunds */}
      {canRefund ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle>عمليات الاسترداد</CardTitle>
            <CardDescription>
              ما تم إعادته للعميل مقابل هذا المرتجع.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {salesReturn.refunds.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="لا توجد عمليات استرداد"
                description="لم يتم إعادة أي مبلغ حتى الآن — القيمة قائمة كرصيد للعميل."
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">الطريقة</TableHead>
                      <TableHead className="text-start">المبلغ</TableHead>
                      <TableHead className="text-start">البنك</TableHead>
                      <TableHead className="text-start">رقم التحويل</TableHead>
                      <TableHead className="text-start">المستخدم</TableHead>
                      <TableHead className="text-start">الإيصال</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {salesReturn.refunds.map((refund) => (
                      <TableRow key={refund.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(refund.refund_date)}
                        </TableCell>
                        <TableCell>
                          <RefundMethodBadge method={refund.refund_method} />
                        </TableCell>
                        <TableCell className="text-success text-sm font-medium">
                          {formatMoney(refund.amount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {refund.bank_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {refund.transfer_reference ? (
                            <bdi className="block text-right">
                              {refund.transfer_reference}
                            </bdi>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {refund.actor_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {refund.receipt_url ? (
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={refund.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="size-3.5" />
                                عرض الإيصال
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
