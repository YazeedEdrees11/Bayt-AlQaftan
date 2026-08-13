import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ChevronRight, Landmark } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { ClosingDatePicker } from "@/components/reports/closing-date-picker";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { getDailyClosingSummary, listCashClosings } from "@/lib/reports/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "الإغلاق اليومي" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DailyClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission("VIEW_DAILY_CLOSING");
  const params = await searchParams;

  // Shape-checked before it reaches the database (§103); anything else is today.
  const today = new Date().toISOString().slice(0, 10);
  const date = params.date && ISO_DATE.test(params.date) ? params.date : today;

  const [summary, closings] = await Promise.all([
    getDailyClosingSummary(date),
    listCashClosings(30),
  ]);

  const dayClosings = closings.filter((row) => row.closing_date === date);

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="الإغلاق اليومي"
        description="ملخص حركة اليوم، ثم جرد الصندوق مقابل ما يقوله السجل. الفرق يُسجَّل ولا يُصحَّح بالكتابة فوقه."
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar showRange={false}>
              <ClosingDatePicker date={date} max={today} />
            </ReportToolbar>
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">بيت القفطان — الإغلاق اليومي · {formatDate(date)}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AccountCard
          title="الصندوق"
          icon={Banknote}
          opening={summary.cash_opening}
          incoming={summary.cash_in}
          outgoing={summary.cash_out}
          closing={summary.cash_closing}
        />
        <AccountCard
          title="البنك"
          icon={Landmark}
          opening={summary.bank_opening}
          incoming={summary.bank_in}
          outgoing={summary.bank_out}
          closing={summary.bank_closing}
        />

        <Card data-print="block">
          <CardHeader>
            <CardTitle className="text-base">حركة اليوم</CardTitle>
            <CardDescription>الإيراد والمصروف، لا المقبوضات.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="المبيعات" value={summary.sales_total} />
            <Row label="المرتجعات" value={-Number(summary.returns_total)} />
            <Row label="المصاريف" value={-Number(summary.expenses_total)} />
            <Separator />
            <Row label="الربح الإجمالي" value={summary.gross_profit} strong tone />
            <Separator />
            <Row label="مستحق على العملاء" value={summary.customer_outstanding} muted />
            <Row label="مستحق للموردين" value={summary.supplier_outstanding} muted />
            <p className="text-muted-foreground text-xs">
              هذان الرصيدان تراكميان حتى تاريخه، لا خاصان بهذا اليوم.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>عمليات الإغلاق المسجّلة</CardTitle>
          <CardDescription>
            {dayClosings.length > 0
              ? `${dayClosings.length} إغلاق لهذا اليوم · آخر ٣٠ إغلاقاً أدناه.`
              : "لم يُسجَّل إغلاق لهذا اليوم بعد. آخر ٣٠ إغلاقاً أدناه."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {closings.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              لم تُسجَّل أي عملية إغلاق بعد.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader className="bg-card sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">رقم الإغلاق</TableHead>
                    <TableHead className="text-start">التاريخ</TableHead>
                    <TableHead className="text-start">المتوقع</TableHead>
                    <TableHead className="text-start">الفعلي</TableHead>
                    <TableHead className="text-start">الفرق</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closings.map((row) => {
                    const difference = Number(row.difference);
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(row.closing_date === date && "bg-accent/40")}
                      >
                        <TableCell className="font-medium">
                          <bdi>{row.closing_number}</bdi>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(row.closing_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.expected_balance)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatMoney(row.actual_balance)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            difference === 0
                              ? "text-muted-foreground"
                              : difference > 0
                                ? "text-success"
                                : "text-destructive",
                          )}
                        >
                          {difference === 0 ? "مطابق" : formatMoney(difference)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              row.status === "REOPENED" &&
                                "border-warning/40 text-warning",
                            )}
                          >
                            {row.status === "REOPENED" ? "أُعيد فتحه" : "مغلق"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-56 truncate text-sm">
                          {row.notes ?? "—"}
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
    </div>
  );
}

function AccountCard({
  title,
  icon: Icon,
  opening,
  incoming,
  outgoing,
  closing,
}: {
  title: string;
  icon: typeof Banknote;
  opening: number;
  incoming: number;
  outgoing: number;
  closing: number;
}) {
  return (
    <Card data-print="block">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-lg">
            <Icon className="size-4" strokeWidth={1.8} />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <Row label="رصيد الافتتاح" value={opening} muted />
        <Row label="الداخل" value={incoming} />
        <Row label="الخارج" value={-Number(outgoing)} />
        <Separator />
        <Row label="رصيد الإقفال" value={closing} strong />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
  tone?: boolean;
}) {
  const amount = Number(value);
  return (
    <div className="flex items-center justify-between">
      <span className={cn(strong ? "font-medium" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "text-base font-semibold" : "font-medium",
          muted && "text-muted-foreground",
          tone && (amount >= 0 ? "text-success" : "text-destructive"),
        )}
      >
        {amount < 0 ? `− ${formatMoney(Math.abs(amount))}` : formatMoney(amount)}
      </span>
    </div>
  );
}
