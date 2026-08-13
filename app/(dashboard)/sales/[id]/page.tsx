import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronRight,
  ExternalLink,
  Receipt,
  RotateCcw,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SaleActions } from "@/components/sales/sale-actions";
import {
  CustomerCell,
  SaleMethodBadge,
  SalePaymentStatusBadge,
  SaleStatusBadge,
} from "@/components/sales/sale-badges";
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
import { getSaleById } from "@/lib/sales/queries";
import {
  getSaleNetOverview,
  getSaleReturnActivity,
} from "@/lib/returns/queries";
import {
  ExchangeDirectionBadge,
  RefundStatusBadge,
  ReturnStatusBadge,
} from "@/components/returns/return-badges";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تفاصيل البيع" };

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_SALES");
  const { id } = await params;

  const sale = await getSaleById(id);
  if (!sale) notFound();

  // Returns and exchanges raised against this sale, plus what it is worth once
  // they are taken off. A returned sale is never hidden — it is shown net.
  const [activity, net] = await Promise.all([
    getSaleReturnActivity(id),
    getSaleNetOverview(id),
  ]);
  const hasActivity = activity.returns.length > 0 || activity.exchanges.length > 0;

  const canReturn = hasPermission(profile, "CREATE_RETURNS");
  const canExchange = hasPermission(profile, "CREATE_EXCHANGES");
  const canPay = hasPermission(profile, "CREATE_CUSTOMER_PAYMENTS");
  const canCancel = hasPermission(profile, "CANCEL_SALES");
  const canComplete = hasPermission(profile, "CREATE_SALES");
  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.sale_number}
        description={`بيع بتاريخ ${formatDate(sale.sale_date)}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/sales">
                <ChevronRight className="size-4" />
                المبيعات
              </Link>
            </Button>
            {sale.status === "COMPLETED" && canReturn ? (
              <Button asChild variant="outline">
                <Link href={`/returns/new?sale=${sale.id}`}>
                  <RotateCcw className="size-4" />
                  تسجيل مرتجع
                </Link>
              </Button>
            ) : null}
            {sale.status === "COMPLETED" && canExchange ? (
              <Button asChild variant="outline">
                <Link href={`/exchanges/new?sale=${sale.id}`}>
                  <ArrowLeftRight className="size-4" />
                  استبدال
                </Link>
              </Button>
            ) : null}
            <SaleActions
              sale={sale}
              canPay={canPay}
              canCancel={canCancel}
              canComplete={canComplete}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SaleStatusBadge status={sale.status} />
        <SalePaymentStatusBadge status={sale.payment_status} />
        {sale.customer ? (
          <Link
            href={`/customers/${sale.customer.id}`}
            className="text-primary text-sm hover:underline"
          >
            {sale.customer.name}
          </Link>
        ) : (
          <CustomerCell name={null} />
        )}
        {sale.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّلها {sale.created_by_name}
          </span>
        ) : null}
      </div>

      {sale.status === "DRAFT" ? (
        <Card className="border-gold/40 bg-gold/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-warning-foreground font-medium">
              هذه مسودة ولم يتم إتمام البيع بعد
            </p>
            <p className="text-muted-foreground leading-relaxed">
              لم تُخصم الكميات من المخزون ولم يُسجَّل أي مبلغ. اضغط «إتمام البيع»
              عند إتمام العملية.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {sale.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذه العملية
              {sale.cancelled_at ? ` بتاريخ ${formatDateTime(sale.cancelled_at)}` : ""}
            </p>
            {sale.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {sale.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              تم إرجاع الكميات إلى المخزون وعكس المبلغ على حساب العميل. الحركات
              الأصلية محفوظة كما هي.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ items */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>المنتجات</CardTitle>
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
                  <TableHead className="text-start">سعر البيع</TableHead>
                  {canSeeProfit ? (
                    <TableHead className="text-start">سعر التكلفة</TableHead>
                  ) : null}
                  <TableHead className="text-start">الإجمالي</TableHead>
                  {canSeeProfit ? (
                    <TableHead className="text-start">الربح</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>

              <TableBody>
                {sale.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <ProductThumb
                        url={item.image_url}
                        alt={item.product_name_snapshot}
                        className="size-11"
                      />
                    </TableCell>
                    <TableCell>
                      {/* Snapshot, not the live product name. */}
                      <p className="font-medium">{item.product_name_snapshot}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <bdi className="block text-right">
                        {item.variant_sku_snapshot}
                      </bdi>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.color_snapshot ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.size_snapshot ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium tabular-nums">
                      {formatNumber(item.quantity)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(item.unit_price)}
                    </TableCell>
                    {canSeeProfit ? (
                      <TableCell className="text-muted-foreground text-sm">
                        {formatMoney(item.unit_cost)}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-sm font-medium">
                      {formatMoney(item.total_price)}
                    </TableCell>
                    {canSeeProfit ? (
                      <TableCell
                        className={cn(
                          "text-sm font-medium",
                          item.gross_profit >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {formatMoney(item.gross_profit)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-border/70 flex justify-end border-t p-4">
            <div className="w-full max-w-xs space-y-2.5 text-sm">
              <Row label="المجموع الفرعي" value={formatMoney(sale.subtotal)} />
              <Row label="الخصم" value={`− ${formatMoney(sale.discount)}`} />
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-medium">الإجمالي</span>
                <span className="text-lg font-semibold">
                  {formatMoney(sale.total_amount)}
                </span>
              </div>
              <Row label="المدفوع" value={formatMoney(sale.paid_amount)} tone="positive" />
              <Row
                label="المتبقي"
                value={formatMoney(sale.remaining_amount)}
                tone={Number(sale.remaining_amount) > 0 ? "negative" : undefined}
              />

              {canSeeProfit ? (
                <>
                  <Separator />
                  <Row label="التكلفة" value={formatMoney(sale.total_cost)} />
                  <Row
                    label="الربح الإجمالي"
                    value={formatMoney(sale.gross_profit)}
                    tone={sale.gross_profit >= 0 ? "positive" : "negative"}
                  />
                  <Row label="هامش الربح" value={formatPercent(sale.gross_margin)} />
                </>
              ) : null}

              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">حالة الدفع</span>
                <SalePaymentStatusBadge status={sale.payment_status} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {sale.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{sale.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------ returns activity */}
      {hasActivity ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle>المرتجعات والاستبدالات</CardTitle>
            <CardDescription>
              عمليات مرتبطة بهذه الفاتورة. لا يمكن إلغاء بيع له مرتجعات — أَلغِ
              المرتجع أولاً حتى لا تُعاد الكمية مرتين.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الرقم</TableHead>
                    <TableHead className="text-start">التاريخ</TableHead>
                    <TableHead className="text-start">القيمة</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.returns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">مرتجع</TableCell>
                      <TableCell className="text-sm font-medium">
                        <bdi className="block text-right">{row.return_number}</bdi>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(row.return_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatMoney(row.refund_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <ReturnStatusBadge status={row.status} />
                          <RefundStatusBadge status={row.refund_status} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/returns/${row.id}`}>التفاصيل</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {activity.exchanges.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">استبدال</TableCell>
                      <TableCell className="text-sm font-medium">
                        <bdi className="block text-right">{row.exchange_number}</bdi>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(row.exchange_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatMoney(row.difference_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <ReturnStatusBadge status={row.status} />
                          <ExchangeDirectionBadge direction={row.difference_direction} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/exchanges/${row.id}`}>التفاصيل</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {net && Number(net.returned_amount) > 0 ? (
              <div className="border-border/70 flex justify-end border-t p-4">
                <div className="w-full max-w-xs space-y-2.5 text-sm">
                  <Row label="إجمالي الفاتورة" value={formatMoney(net.gross_amount)} />
                  <Row
                    label="قيمة المرتجعات"
                    value={`− ${formatMoney(net.returned_amount)}`}
                    tone="negative"
                  />
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="font-medium">صافي البيع</span>
                    <span className="text-lg font-semibold">
                      {formatMoney(net.net_amount)}
                    </span>
                  </div>
                  {canSeeProfit ? (
                    <Row
                      label="صافي الربح"
                      value={formatMoney(net.net_profit)}
                      tone={net.net_profit >= 0 ? "positive" : "negative"}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* --------------------------------------------------------- payments */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الدفعات</CardTitle>
          <CardDescription>
            كل ما تم تحصيله من العميل مقابل هذه العملية.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {sale.payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="لا توجد دفعات مسجلة"
              description="لم يتم تسجيل أي دفعة على هذه العملية حتى الآن."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">التاريخ</TableHead>
                    <TableHead className="text-start">طريقة الدفع</TableHead>
                    <TableHead className="text-start">المبلغ</TableHead>
                    <TableHead className="text-start">البنك</TableHead>
                    <TableHead className="text-start">رقم التحويل</TableHead>
                    <TableHead className="text-start">المستخدم</TableHead>
                    <TableHead className="text-start">الإيصال</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {sale.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(payment.payment_date)}
                      </TableCell>
                      <TableCell>
                        <SaleMethodBadge method={payment.payment_method} />
                      </TableCell>
                      <TableCell className="text-success text-sm font-medium">
                        {formatMoney(payment.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {payment.bank_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {payment.transfer_reference ? (
                          <bdi className="block text-right">
                            {payment.transfer_reference}
                          </bdi>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {payment.actor_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {payment.receipt_url ? (
                          <Button asChild variant="outline" size="sm">
                            <a
                              href={payment.receipt_url}
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
