import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Percent, Receipt, TrendingUp, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { UrlSelect } from "@/components/reports/url-select";
import { StatCard } from "@/components/dashboard/stat-card";
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
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { getProfitByDimension, getProfitReport } from "@/lib/reports/queries";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  PROFIT_DIMENSIONS,
  PROFIT_DIMENSION_LABELS,
  type ProfitDimension,
} from "@/types/reports";

export const metadata: Metadata = { title: "تقرير الأرباح" };

export default async function ProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; from?: string; to?: string; dimension?: string;
  }>;
}) {
  await requirePermission("VIEW_PROFIT_REPORT");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });
  const dimension = (PROFIT_DIMENSIONS as readonly string[]).includes(
    params.dimension ?? "",
  )
    ? (params.dimension as ProfitDimension)
    : "product";

  const [report, breakdown] = await Promise.all([
    getProfitReport(range),
    getProfitByDimension(range, dimension, 50),
  ]);

  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";
  const hasData = Number(report.net_sales) !== 0 || Number(report.operating_expenses) !== 0;

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="تقرير الأرباح"
        description={`من المبيعات إلى الربح التشغيلي خلال ${presetLabel}. هذه الأرقام مأخوذة من ملخص المالية نفسه، لا محسوبة مرة ثانية.`}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar>
              <UrlSelect
                param="dimension"
                value={dimension}
                label="تجميع حسب"
                options={PROFIT_DIMENSIONS.map((value) => ({
                  value,
                  label: PROFIT_DIMENSION_LABELS[value],
                }))}
              />
            </ReportToolbar>
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">
          بيت القفطان — تقرير الأرباح · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <section aria-label="ملخص الأرباح" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="صافي المبيعات"
          icon={Wallet}
          value={hasData ? formatMoney(report.net_sales) : undefined}
          hint="بعد الخصم والمرتجعات"
        />
        <StatCard
          label="الربح الإجمالي"
          icon={TrendingUp}
          accent
          value={hasData ? formatMoney(report.gross_profit) : undefined}
          hint={hasData ? `الهامش ${formatPercent(report.gross_margin)}` : undefined}
        />
        <StatCard
          label="المصاريف التشغيلية"
          icon={Receipt}
          value={hasData ? formatMoney(report.operating_expenses) : undefined}
          hint="المصاريف المعتمدة فقط"
        />
        <StatCard
          label="الربح التشغيلي"
          icon={Percent}
          value={hasData ? formatMoney(report.operating_profit) : undefined}
          hint={hasData ? `الهامش ${formatPercent(report.operating_margin)}` : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" data-print="block">
          <CardHeader>
            <CardTitle>قائمة الأرباح</CardTitle>
            <CardDescription>
              التكلفة محسوبة بسعر الشراء وقت البيع، لا بسعر الشراء الحالي.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Line label="إجمالي المبيعات" value={report.gross_sales} />
            <Line label="الخصومات" value={-Number(report.discounts)} muted />
            <Line label="المرتجعات" value={-Number(report.returns_value)} muted />
            <Separator />
            <Line label="صافي المبيعات" value={report.net_sales} strong />
            <Line label="تكلفة البضاعة المباعة" value={-Number(report.cogs)} muted />
            <Separator />
            <Line label="الربح الإجمالي" value={report.gross_profit} strong tone />
            <p className="text-muted-foreground pb-1 text-xs">
              هامش إجمالي {formatPercent(report.gross_margin)}
            </p>
            <Line
              label="المصاريف التشغيلية"
              value={-Number(report.operating_expenses)}
              muted
            />
            <Separator />
            <Line label="الربح التشغيلي" value={report.operating_profit} strong tone />
            <p className="text-muted-foreground text-xs">
              هامش تشغيلي {formatPercent(report.operating_margin)}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 lg:col-span-3" data-print="block">
          <CardHeader className="border-b py-5">
            <CardTitle>{PROFIT_DIMENSION_LABELS[dimension]}</CardTitle>
            <CardDescription>
              أعلى ٥٠ صفاً حسب الربح الإجمالي. المجموع هنا لا يساوي الربح
              التشغيلي لأن المصاريف لا تُنسب لمنتج.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {breakdown.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                لا توجد بيانات ضمن الفترة المحددة.
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card sticky top-0 z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-start">
                        {dimension === "product"
                          ? "المنتج"
                          : dimension === "category"
                            ? "التصنيف"
                            : "العلامة"}
                      </TableHead>
                      <TableHead className="text-start">الكمية</TableHead>
                      <TableHead className="text-start">صافي المبيعات</TableHead>
                      <TableHead className="text-start">التكلفة</TableHead>
                      <TableHead className="text-start">الربح</TableHead>
                      <TableHead className="text-start">الهامش</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.map((row) => (
                      <TableRow key={`${row.dimension_id}-${row.dimension_name}`}>
                        <TableCell className="font-medium">
                          {row.dimension_name}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatNumber(row.units_sold)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMoney(row.net_sales)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatMoney(row.cogs)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-medium",
                            Number(row.gross_profit) >= 0
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {formatMoney(row.gross_profit)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatPercent(Number(row.margin))}
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
    </div>
  );
}

function Line({
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
