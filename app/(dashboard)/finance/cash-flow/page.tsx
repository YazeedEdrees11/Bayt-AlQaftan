import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinanceRangePicker } from "@/components/finance/finance-range-picker";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
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
import { getFinanceSummary, listFinancialTransactions } from "@/lib/finance/queries";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  NON_OPERATIONAL_TYPES,
  TRANSACTION_TYPE_LABELS,
  type FinancialTransactionRow,
} from "@/types/finance";

export const metadata: Metadata = { title: "التدفق النقدي" };

type CashFlowRow = {
  row: FinancialTransactionRow;
  running: number;
  operational: boolean;
};

/**
 * Walks the movements oldest-first and carries a running total.
 *
 * §47: shifting money between our own accounts is not business cash flow, so
 * transfers and opening balances still appear in the list but leave the total
 * untouched.
 */
function withRunningBalance(rows: FinancialTransactionRow[]): CashFlowRow[] {
  const out: CashFlowRow[] = [];
  let running = 0;
  for (const row of rows) {
    const operational = !NON_OPERATIONAL_TYPES.includes(row.transaction_type);
    if (operational) running += Number(row.signed_amount);
    out.push({ row, running, operational });
  }
  return out;
}

const SOURCE_LINKS: Record<string, (id: string) => string> = {
  EXCHANGE: (id) => `/exchanges/${id}`,
  EXPENSE: (id) => `/expenses/${id}`,
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requirePermission("VIEW_FINANCE");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const [summary, page] = await Promise.all([
    getFinanceSummary(range.from, range.to),
    listFinancialTransactions({
      from: range.from,
      to: range.to,
      page: 1,
      perPage: 200,
    }),
  ]);

  // The RPC returns newest first; a running balance only reads correctly
  // oldest first, so the order is flipped before totalling.
  const rows = withRunningBalance([...page.rows].reverse());

  return (
    <div className="space-y-6">
      <PageHeader
        title="التدفق النقدي"
        description="حركة الأموال الداخلة والخارجة خلال الفترة المختارة."
        actions={<FinanceRangePicker />}
      />

      <section aria-label="ملخص التدفق" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="المقبوضات"
          icon={TrendingUp}
          accent
          value={formatMoney(summary.cash_in)}
          hint="أموال دخلت المحل"
        />
        <StatCard
          label="المدفوعات"
          icon={TrendingDown}
          value={formatMoney(summary.cash_out)}
          hint="أموال خرجت من المحل"
        />
        <StatCard
          label="صافي التدفق"
          icon={Wallet}
          value={formatMoney(summary.net_cash_flow)}
          hint="المقبوضات ناقص المدفوعات"
        />
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>حركة الأموال</CardTitle>
          <CardDescription>
            التحويلات الداخلية والأرصدة الافتتاحية تظهر في القائمة لكنها لا
            تُحرِّك الرصيد التراكمي — نقل المال بين حساباتك ليس دخلاً ولا مصروفاً.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="لا توجد حركات"
              description="لم تُسجَّل أي حركة نقدية ضمن هذه الفترة."
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">التاريخ</TableHead>
                      <TableHead className="text-start">الحركة</TableHead>
                      <TableHead className="text-start">النوع</TableHead>
                      <TableHead className="text-start">الحساب</TableHead>
                      <TableHead className="text-start">داخل</TableHead>
                      <TableHead className="text-start">خارج</TableHead>
                      <TableHead className="text-start">التدفق التراكمي</TableHead>
                      <TableHead className="text-start">المصدر</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ row, running: balance, operational }) => {
                      const link =
                        row.reference_type && row.reference_id
                          ? SOURCE_LINKS[row.reference_type]?.(row.reference_id)
                          : undefined;
                      return (
                        <TableRow key={row.id} className={cn(!operational && "opacity-70")}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDate(row.transaction_date)}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            <bdi className="block text-right">{row.transaction_number}</bdi>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span>{TRANSACTION_TYPE_LABELS[row.transaction_type]}</span>
                            {!operational ? (
                              <Badge variant="outline" className="ms-2 text-xs font-normal">
                                خارج التدفق
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            <Link
                              href={`/finance/accounts/${row.account_id}`}
                              className="hover:text-primary hover:underline"
                            >
                              {row.account_name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-success text-sm">
                            {row.direction === "IN" ? formatMoney(row.amount) : "—"}
                          </TableCell>
                          <TableCell className="text-destructive text-sm">
                            {row.direction === "OUT" ? formatMoney(row.amount) : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "font-medium tabular-nums",
                              balance < 0 && "text-destructive",
                            )}
                          >
                            {formatMoney(balance)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {link ? (
                              <Link href={link} className="text-primary hover:underline">
                                عرض
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {page.total > page.rows.length ? (
                <div className="border-border/70 text-muted-foreground border-t p-4 text-sm">
                  يُعرض أحدث {page.rows.length} حركة من أصل {page.total}. ضيّق
                  الفترة لعرض الباقي.
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
