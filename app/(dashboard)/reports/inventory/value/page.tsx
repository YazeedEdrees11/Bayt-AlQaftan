import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Coins,
  PackageX,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
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
import { getInventoryValueReport } from "@/lib/reports/queries";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";

export const metadata: Metadata = { title: "قيمة المخزون" };

export default async function InventoryValuePage() {
  await requirePermission("VIEW_INVENTORY_REPORT");
  const report = await getInventoryValueReport();

  const hasData = report.total_variants > 0;

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="قيمة المخزون"
        description="الوضع الحالي للمخزون بتكلفته وقيمته البيعية. هذه صورة لحظية، لا تخص فترة."
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar showRange={false} />
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">بيت القفطان — قيمة المخزون · الوضع الحالي</p>
      </div>

      <section aria-label="ملخص المخزون" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="تكلفة المخزون"
          icon={Coins}
          accent
          value={hasData ? formatMoney(report.stock_cost) : undefined}
          hint="رأس المال الواقف في البضاعة"
        />
        <StatCard
          label="القيمة البيعية"
          icon={TrendingUp}
          value={hasData ? formatMoney(report.stock_retail) : undefined}
          hint="لو بيع كل المخزون بسعره الحالي"
        />
        <StatCard
          label="القطع المتوفرة"
          icon={Boxes}
          value={hasData ? formatNumber(report.total_units) : undefined}
          hint={`${formatNumber(report.total_variants)} موديل`}
        />
        <StatCard
          label="القطع التالفة"
          icon={PackageX}
          value={hasData ? formatNumber(report.damaged_units) : undefined}
          hint="خارج المخزون الصالح للبيع"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-print="block">
          <CardHeader>
            <CardTitle>الربح الكامن</CardTitle>
            <CardDescription>
              ربح محتمل لا محقق: لا يتحول إلى ربح حتى تُباع البضاعة فعلاً، ولا
              يدخل في أي تقرير أرباح.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">القيمة البيعية</span>
              <span className="font-medium tabular-nums">
                {formatMoney(report.stock_retail)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">تكلفة المخزون</span>
              <span className="font-medium tabular-nums">
                − {formatMoney(report.stock_cost)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">الربح الكامن</span>
              <span className="text-success text-lg font-semibold tabular-nums">
                {formatMoney(report.potential_profit)}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              هامش كامن {formatPercent(report.potential_margin)}
            </p>
          </CardContent>
        </Card>

        <Card data-print="block">
          <CardHeader>
            <CardTitle>ما يحتاج انتباهاً</CardTitle>
            <CardDescription>كل رقم هنا يفتح التقرير الذي يفصّله.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <AlertRow
              href="/reports/inventory/low-stock"
              icon={AlertTriangle}
              label="موديلات وصلت الحد الأدنى"
              count={report.low_stock_count}
            />
            <AlertRow
              href="/reports/inventory/out-of-stock"
              icon={PackageX}
              label="موديلات نفدت بالكامل"
              count={report.out_of_stock_count}
            />
            <AlertRow
              href="/reports/inventory/dead-stock"
              icon={Boxes}
              label="مراجعة المخزون الراكد"
              count={null}
            />
            <AlertRow
              href="/inventory/damaged"
              icon={PackageX}
              label="القطع التالفة"
              count={report.damaged_units}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AlertRow({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: typeof Boxes;
  label: string;
  count: number | null;
}) {
  return (
    <Link
      href={href}
      className="border-border/70 hover:border-primary/40 hover:bg-accent/50 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate text-sm">{label}</span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {count === null ? "عرض" : formatNumber(count)}
      </span>
    </Link>
  );
}
