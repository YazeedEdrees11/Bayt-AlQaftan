import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Package, ShoppingCart, Truck, Wallet } from "lucide-react";

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
import { getPurchaseReport, getSupplierPerformance } from "@/lib/reports/queries";
import { hasPermission } from "@/lib/permissions/check-permission";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "تقرير المشتريات" };

export default async function PurchaseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_PURCHASE_REPORT");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const canSeeSuppliers = hasPermission(profile, "VIEW_SUPPLIER_REPORT");
  const [report, suppliers] = await Promise.all([
    getPurchaseReport(range),
    canSeeSuppliers ? getSupplierPerformance({ limit: 10 }) : Promise.resolve([]),
  ]);

  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";
  const hasData = report.purchase_count > 0;
  const paidShare =
    Number(report.total_purchases) > 0
      ? (Number(report.paid_to_suppliers) / Number(report.total_purchases)) * 100
      : 0;

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="تقرير المشتريات"
        description={`المشتريات المستلمة خلال ${presetLabel}. الفواتير الملغاة والمسودات غير محسوبة.`}
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
          بيت القفطان — تقرير المشتريات · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <section aria-label="ملخص المشتريات" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="صافي المشتريات"
          icon={ShoppingCart}
          accent
          value={hasData ? formatMoney(report.net_purchases) : undefined}
          hint="بعد المرتجعات للموردين"
        />
        <StatCard
          label="عدد الفواتير"
          icon={Truck}
          value={hasData ? formatNumber(report.purchase_count) : undefined}
          hint="فواتير مستلمة"
        />
        <StatCard
          label="القطع المشتراة"
          icon={Package}
          value={hasData ? formatNumber(report.units_purchased) : undefined}
          hint="إجمالي الكميات الداخلة"
        />
        <StatCard
          label="المستحق للموردين"
          icon={Wallet}
          value={hasData ? formatMoney(report.outstanding) : undefined}
          hint="من فواتير هذه الفترة"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" data-print="block">
          <CardHeader>
            <CardTitle>المشتريات والسداد</CardTitle>
            <CardDescription>
              الشراء التزام والدفع نقد — والفرق هو ما عليك للموردين.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="إجمالي المشتريات" value={formatMoney(report.total_purchases)} />
            <Row
              label="مرتجعات للموردين"
              value={`− ${formatMoney(report.purchase_returns)}`}
            />
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">صافي المشتريات</span>
              <span className="text-lg font-semibold">
                {formatMoney(report.net_purchases)}
              </span>
            </div>
            <Separator />
            <Row
              label="المدفوع للموردين"
              value={formatMoney(report.paid_to_suppliers)}
              tone="positive"
            />
            <Row
              label="المتبقي"
              value={formatMoney(report.outstanding)}
              tone={Number(report.outstanding) > 0 ? "negative" : undefined}
            />
            <div className="bg-muted h-2 overflow-hidden rounded-full" role="presentation">
              <div
                className="bg-success h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, paidShare))}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              سُدّد {Math.round(paidShare)}% من قيمة المشتريات
            </p>
          </CardContent>
        </Card>

        {canSeeSuppliers ? (
          <Card className="lg:col-span-3" data-print="block">
            <CardHeader>
              <CardTitle>أعلى الموردين رصيداً</CardTitle>
              <CardDescription>
                الأرصدة تراكمية لكل الفترات، لا للفترة المختارة — لأن الدين لا
                ينتهي بانتهاء الشهر.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {suppliers.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  لا توجد بيانات موردين.
                </p>
              ) : (
                suppliers.map((supplier) => (
                  <Link
                    key={supplier.supplier_id}
                    href={`/suppliers/${supplier.supplier_id}`}
                    className="border-border/70 hover:border-primary/40 hover:bg-accent/50 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{supplier.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {formatNumber(supplier.purchase_count)} فاتورة
                        {supplier.last_purchase_date
                          ? ` · آخر شراء ${formatDate(supplier.last_purchase_date)}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        Number(supplier.outstanding) > 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(supplier.outstanding)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
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
