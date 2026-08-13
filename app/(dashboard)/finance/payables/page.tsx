import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";

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
import { listPayables } from "@/lib/finance/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "الموردون الدائنون" };

export default async function PayablesPage() {
  await requirePermission("VIEW_PAYABLES");

  const rows = await listPayables();
  const owing = rows.filter((row) => Number(row.outstanding) !== 0);
  const total = owing.reduce((sum, row) => sum + Math.max(0, Number(row.outstanding)), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموردون الدائنون"
        description="ما هو مستحق للموردين — محسوب من سجل حساب كل مورد."
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الذمم الدائنة</CardTitle>
          <CardDescription>
            المشتريات ليست هي المدفوعات: الفاتورة تُسجَّل بكامل قيمتها، والمدفوع
            منها يظهر منفصلاً، والفرق هو ما يبقى على الحساب.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {owing.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="لا توجد ذمم"
              description="لا يوجد موردون لهم مبالغ مستحقة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">المورد</TableHead>
                      <TableHead className="text-start">إجمالي المشتريات</TableHead>
                      <TableHead className="text-start">المدفوع</TableHead>
                      <TableHead className="text-start">المستحق</TableHead>
                      <TableHead className="text-start">آخر دفعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owing.map((row) => (
                      <TableRow key={row.supplier_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            {row.phone ?? "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.total_purchases)}
                        </TableCell>
                        <TableCell className="text-success text-sm">
                          {formatMoney(row.total_paid)}
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

              <div className="border-border/70 flex justify-end border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  إجمالي المستحق للموردين{" "}
                  <span className="text-destructive font-medium">
                    {formatMoney(total)}
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
