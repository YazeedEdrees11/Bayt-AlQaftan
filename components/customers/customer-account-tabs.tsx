"use client";

import Link from "next/link";
import { ExternalLink, History, Receipt, ShoppingBag } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  SaleMethodBadge,
  SalePaymentStatusBadge,
  SaleStatusBadge,
} from "@/components/sales/sale-badges";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  CUSTOMER_BALANCE_TYPE_LABELS,
  type CustomerLedgerRow,
  type SaleListRow,
  type SalePaymentWithMedia,
} from "@/types/sales";

/** What this customer bought, what they paid, and their running account. */
export function CustomerAccountTabs({
  sales,
  payments,
  ledger,
  canSeeProfit,
}: {
  sales: SaleListRow[];
  payments: SalePaymentWithMedia[];
  ledger: CustomerLedgerRow[];
  canSeeProfit: boolean;
}) {
  return (
    <Tabs defaultValue="sales" className="w-full">
      <TabsList>
        <TabsTrigger value="sales">
          <ShoppingBag className="size-4" />
          المبيعات
        </TabsTrigger>
        <TabsTrigger value="payments">
          <Receipt className="size-4" />
          الدفعات
        </TabsTrigger>
        <TabsTrigger value="ledger">
          <History className="size-4" />
          الحركات
        </TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------------- sales */}
      <TabsContent value="sales">
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            {sales.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="لا توجد مبيعات"
                description="لم يشترِ هذا العميل أي شيء حتى الآن."
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">رقم البيع</TableHead>
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">عدد القطع</TableHead>
                      <TableHead className="text-start">الإجمالي</TableHead>
                      <TableHead className="text-start">المدفوع</TableHead>
                      <TableHead className="text-start">المتبقي</TableHead>
                      {canSeeProfit ? (
                        <TableHead className="text-start">الربح</TableHead>
                      ) : null}
                      <TableHead className="text-start">حالة الدفع</TableHead>
                      <TableHead className="text-start">الحالة</TableHead>
                      <TableHead className="w-24 text-start">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn(row.status === "CANCELLED" && "opacity-60")}
                      >
                        <TableCell>
                          <Link
                            href={`/sales/${row.id}`}
                            className="hover:text-primary font-medium hover:underline"
                          >
                            <bdi className="block text-right">{row.sale_number}</bdi>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(row.sale_date)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatNumber(row.total_quantity)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatMoney(row.total_amount)}
                        </TableCell>
                        <TableCell className="text-success text-sm">
                          {formatMoney(row.paid_amount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm",
                            Number(row.remaining_amount) > 0
                              ? "text-destructive font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          {formatMoney(row.remaining_amount)}
                        </TableCell>
                        {canSeeProfit ? (
                          <TableCell className="text-sm font-medium">
                            {formatMoney(row.gross_profit)}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <SalePaymentStatusBadge status={row.payment_status} />
                        </TableCell>
                        <TableCell>
                          <SaleStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/sales/${row.id}`}>التفاصيل</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------------------------------------------------- payments */}
      <TabsContent value="payments">
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="لا توجد دفعات مسجلة"
                description="لم يتم تسجيل أي دفعة من هذا العميل حتى الآن."
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
                    {payments.map((payment) => (
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
                                عرض
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
      </TabsContent>

      {/* ------------------------------------------------------------ ledger */}
      <TabsContent value="ledger">
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            {ledger.length === 0 ? (
              <EmptyState
                icon={History}
                title="لا توجد حركات"
                description="لم تُسجَّل أي حركة على حساب هذا العميل."
              />
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">النوع</TableHead>
                      <TableHead className="text-start">الوصف</TableHead>
                      <TableHead className="text-start">المبلغ</TableHead>
                      <TableHead className="text-start">الرصيد بعد الحركة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((row) => {
                      const increases = Number(row.signed_amount) > 0;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDateTime(row.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-medium",
                                increases
                                  ? "bg-destructive/10 text-destructive border-destructive/25"
                                  : "bg-success/10 text-success border-success/25",
                              )}
                            >
                              {CUSTOMER_BALANCE_TYPE_LABELS[row.transaction_type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm">
                            <span className="line-clamp-2 leading-relaxed">
                              {row.description ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              increases ? "text-destructive" : "text-success",
                            )}
                          >
                            {increases ? "+" : "−"}
                            {formatMoney(Math.abs(Number(row.signed_amount)), {
                              withSymbol: false,
                            })}
                          </TableCell>
                          <TableCell className="text-sm font-medium tabular-nums">
                            {formatMoney(row.running_balance)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
