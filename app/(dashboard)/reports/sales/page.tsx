import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  CreditCard,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { SeriesBars } from "@/components/reports/series-bars";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { getSalesReport, getSalesSeries } from "@/lib/reports/queries";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { bucketForRange, type ReportBucket } from "@/types/reports";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تقرير المبيعات" };

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; from?: string; to?: string; bucket?: string;
  }>;
}) {
  await requirePermission("VIEW_SALES_REPORT");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });
  const bucket = (["day", "week", "month"] as const).includes(params.bucket as ReportBucket)
    ? (params.bucket as ReportBucket)
    : bucketForRange(range.from, range.to);

  const [report, series] = await Promise.all([
    getSalesReport(range),
    getSalesSeries(range, bucket),
  ]);

  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";
  const hasData = report.invoice_count > 0 || Number(report.returns_value) > 0;
  const collected = Number(report.cash_sales) + Number(report.bank_sales);
  const cashShare = collected > 0 ? (Number(report.cash_sales) / collected) * 100 : 0;

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="تقرير المبيعات"
        description={`المبيعات المكتملة خلال ${presetLabel}. التاريخ المستخدم هو تاريخ البيع، لا تاريخ الإنشاء.`}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar />
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">
          بيت القفطان — تقرير المبيعات · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <section aria-label="ملخص المبيعات" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="صافي المبيعات"
          icon={ShoppingBag}
          accent
          value={hasData ? formatMoney(report.net_sales) : undefined}
          hint="بعد الخصم والمرتجعات"
        />
        <StatCard
          label="عدد الفواتير"
          icon={Receipt}
          value={hasData ? formatNumber(report.invoice_count) : undefined}
          hint={hasData ? `متوسط ${formatMoney(report.average_order)}` : "فواتير مكتملة"}
        />
        <StatCard
          label="القطع المباعة"
          icon={ShoppingBag}
          value={hasData ? formatNumber(report.units_sold) : undefined}
          hint={
            hasData && report.units_returned > 0
              ? `مرتجع ${formatNumber(report.units_returned)}`
              : "إجمالي الكميات"
          }
        />
        <StatCard
          label="المرتجعات"
          icon={RotateCcw}
          value={hasData ? formatMoney(report.returns_value) : undefined}
          hint="تُخصم من صافي المبيعات"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-print="block">
          <CardHeader>
            <CardTitle className="text-base">من الإجمالي إلى الصافي</CardTitle>
            <CardDescription>
              الملغى من الفواتير والمرتجعات غير محسوب هنا إطلاقاً.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="إجمالي المبيعات" value={formatMoney(report.gross_sales)} />
            <Row label="الخصومات" value={`− ${formatMoney(report.discounts)}`} />
            <Row label="المرتجعات" value={`− ${formatMoney(report.returns_value)}`} />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">صافي المبيعات</span>
              <span className="text-lg font-semibold">{formatMoney(report.net_sales)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-print="block">
          <CardHeader>
            <CardTitle className="text-base">المحصّل مقابل المستحق</CardTitle>
            <CardDescription>
              المبيعات إيراد، والمحصّل نقد — وهما رقمان مختلفان.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row
              label="المحصّل"
              value={formatMoney(report.total_collected)}
              tone="positive"
            />
            <Row
              label="المتبقي على العملاء"
              value={formatMoney(report.total_outstanding)}
              tone={Number(report.total_outstanding) > 0 ? "negative" : undefined}
            />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Wallet className="size-4" />
                نقدي
              </span>
              <span className="font-medium">{formatMoney(report.cash_sales)}</span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full" role="presentation">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(100, cashShare)}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CreditCard className="size-4" />
                تحويل بنكي
              </span>
              <span className="font-medium">{formatMoney(report.bank_sales)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              النقد {formatPercent(cashShare)} من المقبوضات
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-print="block">
          <CardHeader>
            <CardTitle className="text-base">مؤشرات سريعة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="متوسط قيمة الفاتورة" value={formatMoney(report.average_order)} />
            <Row
              label="القطع لكل فاتورة"
              value={
                report.invoice_count > 0
                  ? formatNumber(
                      Math.round(
                        ((report.units_sold - report.units_returned) /
                          report.invoice_count) *
                          100,
                      ) / 100,
                    )
                  : "0"
              }
            />
            <Row
              label="معدل المرتجعات"
              value={formatPercent(
                report.units_sold > 0
                  ? (report.units_returned / report.units_sold) * 100
                  : 0,
              )}
            />
            <Separator />
            <Button asChild variant="outline" className="w-full" data-print="hide">
              <Link href={`/reports/profit?range=${preset}`}>عرض تقرير الأرباح</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card data-print="block">
        <CardHeader>
          <CardTitle>المبيعات عبر الزمن</CardTitle>
          <CardDescription>
            الإجمالي والمرتجعات والصافي لكل فترة. الفترات تُجمَّع حسب طول المدى
            المختار.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SeriesBars
            points={series.map((point) => ({
              label: point.bucket,
              gross: Number(point.gross_sales),
              returns: Number(point.returns_value),
              net: Number(point.net_sales),
            }))}
          />
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
          "font-medium tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
