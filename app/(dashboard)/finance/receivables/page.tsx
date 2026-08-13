import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
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
import { listReceivables } from "@/lib/finance/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "العملاء المدينون" };

export default async function ReceivablesPage() {
  await requirePermission("VIEW_RECEIVABLES");

  const rows = await listReceivables();
  const owing = rows.filter((row) => Number(row.outstanding) !== 0);
  const total = owing.reduce((sum, row) => sum + Math.max(0, Number(row.outstanding)), 0);
  const credit = owing.reduce((sum, row) => sum + Math.min(0, Number(row.outstanding)), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="العملاء المدينون"
        description="ما هو مستحق على العملاء — محسوب من سجل حساب كل عميل، لا من جمع منفصل."
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الذمم المدينة</CardTitle>
          <CardDescription>
            الرصيد الموجب مستحق على العميل، والسالب رصيد دائن له نتيجة مرتجع أو
            دفعة زائدة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {owing.length === 0 ? (
            <EmptyState
              icon={Users}
              title="لا توجد ذمم"
              description="لا يوجد عملاء عليهم أو لهم مبالغ."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">العميل</TableHead>
                      <TableHead className="text-start">إجمالي المبيعات</TableHead>
                      <TableHead className="text-start">المدفوع</TableHead>
                      <TableHead className="text-start">المرتجعات</TableHead>
                      <TableHead className="text-start">المسترد</TableHead>
                      <TableHead className="text-start">المستحق</TableHead>
                      <TableHead className="text-start">آخر دفعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owing.map((row) => (
                      <TableRow key={row.customer_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/customers/${row.customer_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {row.phone ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.total_sales)}
                        </TableCell>
                        <TableCell className="text-success text-sm">
                          {formatMoney(row.total_paid)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.total_returns)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.total_refunded)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-medium",
                            Number(row.outstanding) > 0 ? "text-destructive" : "text-success",
                          )}
                        >
                          {formatMoney(row.outstanding)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {row.last_payment_date ? formatDate(row.last_payment_date) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  إجمالي المستحق{" "}
                  <span className="text-destructive font-medium">
                    {formatMoney(total)}
                  </span>
                </span>
                {credit < 0 ? (
                  <span className="text-muted-foreground">
                    أرصدة دائنة للعملاء{" "}
                    <span className="text-success font-medium">
                      {formatMoney(Math.abs(credit))}
                    </span>
                  </span>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
