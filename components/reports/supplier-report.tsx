import Link from "next/link";
import { ChevronRight, Truck } from "lucide-react";

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
import { getSupplierPerformance } from "@/lib/reports/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * The supplier reports — everyone, or only those we still owe.
 *
 * Same view, same numbers, one predicate apart. The payables screen in Phase 6
 * remains the place to record a payment; this is the reporting view of it.
 */
export async function SupplierReport({
  debtOnly,
  title,
  description,
  searchParams,
}: {
  debtOnly: boolean;
  title: string;
  description: string;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_SUPPLIER_REPORT");
  await searchParams;

  const rows = await getSupplierPerformance({ debtOnly, limit: 200 });
  const canExport = hasPermission(profile, "EXPORT_REPORTS");

  const totals = rows.reduce(
    (acc, row) => ({
      purchases: acc.purchases + Number(row.total_purchases),
      paid: acc.paid + Number(row.total_paid),
      outstanding: acc.outstanding + Number(row.outstanding),
    }),
    { purchases: 0, paid: 0, outstanding: 0 },
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
            <ReportToolbar
              showRange={false}
              exportReport="suppliers"
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
          <CardTitle>{rows.length > 0 ? `${rows.length} مورد` : "الموردون"}</CardTitle>
          <CardDescription>
            المستحق هو ما بقي علينا بعد المدفوعات والمرتجعات — لا قيمة الفواتير.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={debtOnly ? "لا توجد ذمم" : "لا توجد بيانات"}
              description={
                debtOnly
                  ? "لا يوجد موردون لهم مبالغ مستحقة."
                  : "لا يوجد موردون لديهم حركة بعد."
              }
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">المورد</TableHead>
                      <TableHead className="text-start">الهاتف</TableHead>
                      <TableHead className="text-start">الفواتير</TableHead>
                      <TableHead className="text-start">المشتريات</TableHead>
                      <TableHead className="text-start">المدفوع</TableHead>
                      <TableHead className="text-start">المرتجعات</TableHead>
                      <TableHead className="text-start">المستحق</TableHead>
                      <TableHead className="text-start">آخر شراء</TableHead>
                      <TableHead className="text-start">آخر دفعة</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.supplier_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                          {row.is_active ? null : (
                            <p className="text-muted-foreground text-xs">موقوف</p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <bdi className="block text-right">{row.phone ?? "—"}</bdi>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatNumber(row.purchase_count)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatMoney(row.total_purchases)}
                        </TableCell>
                        <TableCell className="text-success text-sm">
                          {formatMoney(row.total_paid)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {Number(row.total_returns) > 0
                            ? formatMoney(row.total_returns)
                            : "—"}
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
                        <TableCell className="text-muted-foreground text-sm">
                          {row.last_purchase_date
                            ? formatDate(row.last_purchase_date)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.last_payment_date
                            ? formatDate(row.last_payment_date)
                            : "لم يُدفع"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  المشتريات{" "}
                  <span className="text-foreground font-medium">
                    {formatMoney(totals.purchases)}
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
