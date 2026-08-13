import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Receipt } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PurchaseActions } from "@/components/purchases/purchase-actions";
import {
  PaymentMethodBadge,
  PaymentStatusBadge,
  PurchaseStatusBadge,
} from "@/components/purchases/purchase-badges";
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
import { getPurchaseById } from "@/lib/purchasing/queries";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تفاصيل المشتريات" };

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requirePermission("VIEW_PURCHASES");
  const { id } = await params;

  const purchase = await getPurchaseById(id);
  if (!purchase) notFound();

  const canPay = hasPermission(profile, "CREATE_SUPPLIER_PAYMENTS");
  const canCancel = hasPermission(profile, "CANCEL_PURCHASES");
  const canComplete = hasPermission(profile, "UPDATE_PURCHASES");

  return (
    <div className="space-y-6">
      <PageHeader
        title={purchase.purchase_number}
        description={`مشتريات من ${purchase.supplier?.name ?? "—"} بتاريخ ${formatDate(
          purchase.purchase_date,
        )}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/purchases">
                <ChevronRight className="size-4" />
                المشتريات
              </Link>
            </Button>
            <PurchaseActions
              purchase={purchase}
              canPay={canPay}
              canCancel={canCancel}
              canComplete={canComplete}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PurchaseStatusBadge status={purchase.status} />
        <PaymentStatusBadge status={purchase.payment_status} />
        {purchase.supplier ? (
          <Link
            href={`/suppliers/${purchase.supplier.id}`}
            className="text-primary text-sm hover:underline"
          >
            {purchase.supplier.name}
          </Link>
        ) : null}
        {purchase.created_by_name ? (
          <span className="text-muted-foreground text-sm">
            · سجّلها {purchase.created_by_name}
          </span>
        ) : null}
      </div>

      {purchase.status === "DRAFT" ? (
        <Card className="border-gold/40 bg-gold/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-warning-foreground font-medium">
              هذه مسودة ولم يتم استلام البضاعة بعد
            </p>
            <p className="text-muted-foreground leading-relaxed">
              لم تتغيّر كميات المخزون ولم يُسجَّل أي مبلغ على حساب المورد.
              اضغط «إكمال المشتريات» عند وصول البضاعة.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {purchase.status === "CANCELLED" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-1 py-4 text-sm">
            <p className="text-destructive font-medium">
              تم إلغاء هذه المشتريات
              {purchase.cancelled_at
                ? ` بتاريخ ${formatDateTime(purchase.cancelled_at)}`
                : ""}
            </p>
            {purchase.cancel_reason ? (
              <p className="text-muted-foreground leading-relaxed">
                السبب: {purchase.cancel_reason}
              </p>
            ) : null}
            <p className="text-muted-foreground leading-relaxed">
              تم عكس الكميات من المخزون وعكس المبلغ على حساب المورد. الحركات
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
            الأسماء والأسعار محفوظة كما كانت وقت الشراء.
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
                  <TableHead className="text-start">سعر الشراء</TableHead>
                  <TableHead className="text-start">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {purchase.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <ProductThumb
                        url={item.image_url}
                        alt={item.product_name_snapshot}
                        className="size-11"
                      />
                    </TableCell>
                    <TableCell>
                      {/* The snapshot, not the live product name — this
                          document must read as it did on the day. */}
                      <p className="font-medium">
                        {item.product_name_snapshot}
                      </p>
                      {item.current_stock !== null ? (
                        <p className="text-muted-foreground text-xs">
                          المخزون الحالي: {formatNumber(item.current_stock)}
                        </p>
                      ) : null}
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
                      {formatMoney(item.unit_cost)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {formatMoney(item.total_cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-border/70 flex justify-end border-t p-4">
            <div className="w-full max-w-xs space-y-2.5 text-sm">
              <Row label="المجموع الفرعي" value={formatMoney(purchase.subtotal)} />
              <Row label="الخصم" value={`− ${formatMoney(purchase.discount)}`} />
              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-medium">الإجمالي</span>
                <span className="text-lg font-semibold">
                  {formatMoney(purchase.total_amount)}
                </span>
              </div>
              <Row
                label="المدفوع"
                value={formatMoney(purchase.paid_amount)}
                tone="positive"
              />
              <Row
                label="المتبقي"
                value={formatMoney(purchase.remaining_amount)}
                tone={Number(purchase.remaining_amount) > 0 ? "negative" : undefined}
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">حالة الدفع</span>
                <PaymentStatusBadge status={purchase.payment_status} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {purchase.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{purchase.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* --------------------------------------------------------- payments */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الدفعات</CardTitle>
          <CardDescription>
            كل ما دُفع للمورد مقابل هذه الفاتورة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {purchase.payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="لا توجد دفعات مسجلة"
              description="لم يتم تسجيل أي دفعة على هذه الفاتورة حتى الآن."
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
                  {purchase.payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(payment.payment_date)}
                      </TableCell>
                      <TableCell>
                        <PaymentMethodBadge method={payment.payment_method} />
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
