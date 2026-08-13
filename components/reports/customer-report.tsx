import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ReportToolbar } from "@/components/reports/report-toolbar";
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
import { getCustomerPerformance } from "@/lib/reports/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { CustomerPerformanceRow } from "@/types/reports";

export type CustomerReportMode = "all" | "top" | "debt";

/** Days without a payment before an outstanding balance is worth chasing. */
const STALE_DAYS = 30;

function daysSince(value: string | null): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - Date.parse(value)) / (1000 * 60 * 60 * 24));
}

function sortFor(mode: CustomerReportMode) {
  return (a: CustomerPerformanceRow, b: CustomerPerformanceRow) =>
    mode === "top"
      ? Number(b.total_purchased) - Number(a.total_purchased)
      : Number(b.outstanding) - Number(a.outstanding);
}

/**
 * The customer reports.
 *
 * Three views over one view: everyone, the best buyers, and the ones who owe.
 * Customer data never leaves this screen without VIEW_CUSTOMER_REPORT, and the
 * export re-checks the same permission server-side (§64).
 */
export async function CustomerReport({
  mode,
  title,
  description,
  searchParams,
}: {
  mode: CustomerReportMode;
  title: string;
  description: string;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_CUSTOMER_REPORT");
  await searchParams;

  const rows = (
    await getCustomerPerformance({ debtOnly: mode === "debt", limit: 200 })
  )
    .slice()
    .sort(sortFor(mode));

  const visible = mode === "top" ? rows.slice(0, 25) : rows;
  const canExport = hasPermission(profile, "EXPORT_REPORTS");

  const totals = visible.reduce(
    (acc, row) => ({
      purchased: acc.purchased + Number(row.total_purchased),
      paid: acc.paid + Number(row.total_paid),
      outstanding: acc.outstanding + Number(row.outstanding),
    }),
    { purchased: 0, paid: 0, outstanding: 0 },
  );

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
            {/* Balances are cumulative, so a date range would misrepresent them. */}
            <ReportToolbar
              showRange={false}
              exportReport="customers"
              canExport={canExport}
            />
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">بيت القفطان — {title} · أرصدة تراكمية حتى تاريخه</p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>
            {visible.length > 0 ? `${visible.length} عميل` : "العملاء"}
          </CardTitle>
          <CardDescription>
            المشتريات والمدفوع تراكمي منذ فتح الحساب، والمستحق هو الفرق بينهما
            بعد المرتجعات.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {visible.length === 0 ? (
            <EmptyState
              icon={Users}
              title={mode === "debt" ? "لا توجد ذمم" : "لا توجد بيانات"}
              description={
                mode === "debt"
                  ? "لا يوجد عملاء عليهم مبالغ مستحقة."
                  : "لا يوجد عملاء لديهم حركة بعد."
              }
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">العميل</TableHead>
                      <TableHead className="text-start">الهاتف</TableHead>
                      <TableHead className="text-start">الفواتير</TableHead>
                      <TableHead className="text-start">المشتريات</TableHead>
                      <TableHead className="text-start">المدفوع</TableHead>
                      <TableHead className="text-start">المستحق</TableHead>
                      {mode === "top" ? (
                        <TableHead className="text-start">متوسط الفاتورة</TableHead>
                      ) : (
                        <TableHead className="text-start">آخر دفعة</TableHead>
                      )}
                      <TableHead className="text-start">آخر شراء</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {visible.map((row) => {
                      const stale = daysSince(row.last_payment_date ?? row.last_sale_date);
                      return (
                        <TableRow key={row.customer_id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/customers/${row.customer_id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {row.name}
                            </Link>
                            <p className="text-muted-foreground text-xs">
                              <bdi>{row.customer_number}</bdi>
                              {row.is_active ? "" : " · موقوف"}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm">
                            <bdi className="block text-right">{row.phone ?? "—"}</bdi>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {formatNumber(row.sales_count)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {formatMoney(row.total_purchased)}
                          </TableCell>
                          <TableCell className="text-success text-sm">
                            {formatMoney(row.total_paid)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-sm font-medium",
                              Number(row.outstanding) > 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatMoney(row.outstanding)}
                          </TableCell>
                          {mode === "top" ? (
                            <TableCell className="text-sm">
                              {formatMoney(row.average_order_value)}
                            </TableCell>
                          ) : (
                            <TableCell className="text-sm">
                              {row.last_payment_date ? (
                                <span
                                  className={cn(
                                    stale !== null && stale > STALE_DAYS && "text-warning",
                                  )}
                                >
                                  {formatDate(row.last_payment_date)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">لم يدفع</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-muted-foreground text-sm">
                            {row.last_sale_date ? formatDate(row.last_sale_date) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  المشتريات{" "}
                  <span className="text-foreground font-medium">
                    {formatMoney(totals.purchased)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  المدفوع{" "}
                  <span className="text-success font-medium">
                    {formatMoney(totals.paid)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  المستحق{" "}
                  <span className="text-destructive font-medium">
                    {formatMoney(totals.outstanding)}
                  </span>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
