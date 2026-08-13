import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PieChart } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinanceRangePicker } from "@/components/finance/finance-range-picker";
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
import { getExpenseReport } from "@/lib/finance/queries";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";

export const metadata: Metadata = { title: "تقرير المصاريف" };

export default async function ExpenseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requirePermission("VIEW_EXPENSES");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const rows = await getExpenseReport(range.from, range.to);
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const entries = rows.reduce((sum, row) => sum + Number(row.entry_count), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير المصاريف"
        description="المصاريف حسب التصنيف خلال الفترة المختارة."
        actions={
          <>
            <FinanceRangePicker />
            <Button asChild variant="outline">
              <Link href="/expenses">
                <ChevronRight className="size-4" />
                المصاريف
              </Link>
            </Button>
          </>
        }
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>حسب التصنيف</CardTitle>
          <CardDescription>
            المصاريف الملغاة مستثناة. هذه مصاريف تشغيلية — منفصلة عن تكلفة
            البضاعة المباعة.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={PieChart}
              title="لا توجد مصاريف"
              description="لم تُسجَّل أي مصاريف ضمن هذه الفترة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">التصنيف</TableHead>
                      <TableHead className="text-start">الإجمالي</TableHead>
                      <TableHead className="text-start">النسبة</TableHead>
                      <TableHead className="text-start">عدد الحركات</TableHead>
                      <TableHead className="w-[30%] text-start">التوزيع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.category_id}>
                        <TableCell className="font-medium">{row.category_name}</TableCell>
                        <TableCell className="text-sm font-medium tabular-nums">
                          {formatMoney(row.total)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatPercent(Number(row.percentage))}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm tabular-nums">
                          {formatNumber(row.entry_count)}
                        </TableCell>
                        <TableCell>
                          <div
                            className="bg-muted h-2 overflow-hidden rounded-full"
                            role="presentation"
                          >
                            <div
                              className="bg-gold h-full rounded-full"
                              style={{ width: `${Math.min(100, Number(row.percentage))}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="border-border/70 flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  عدد الحركات{" "}
                  <span className="text-foreground font-medium">
                    {formatNumber(entries)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  إجمالي المصاريف{" "}
                  <span className="text-foreground font-semibold">
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
