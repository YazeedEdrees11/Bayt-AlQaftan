import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  ChartNoAxesColumn,
  Lightbulb,
  Percent,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { WeeklyActivityChart } from "@/components/dashboard/weekly-activity-chart";
import { ComparisonGrid } from "@/components/dashboard/comparison-grid";
import { ManagementAlerts } from "@/components/dashboard/management-alerts";
import { DashboardRangePicker } from "@/components/dashboard/dashboard-range-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getInventorySummary } from "@/lib/catalog/queries";
import { getFinanceSummary } from "@/lib/finance/queries";
import {
  getManagementAlerts,
  getManagementKpis,
  getPeriodComparison,
} from "@/lib/reports/queries";
import { buildInsights } from "@/lib/reports/insights";
import {
  DATE_PRESETS,
  isDatePreset,
  resolveDateRange,
} from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Permission } from "@/types/auth";

export const metadata: Metadata = { title: "الرئيسية" };

interface Kpi {
  label: string;
  icon: typeof Banknote;
  permission: Permission;
  accent?: boolean;
  value?: string;
  hint?: string;
}

/**
 * The daily tiles, shown to everyone who can see the dashboard.
 *
 * A tile whose figure genuinely has no data renders its empty state rather than
 * a zero that looks like a fact.
 */
const KPIS: Kpi[] = [
  { label: "مبيعات اليوم", icon: ShoppingBag, permission: "VIEW_SALES", accent: true },
  { label: "المشتريات اليوم", icon: ShoppingCart, permission: "VIEW_PURCHASES" },
  { label: "المصاريف اليوم", icon: Receipt, permission: "VIEW_FINANCE" },
  { label: "صافي اليوم", icon: Wallet, permission: "VIEW_FINANCE" },
  { label: "قيمة المخزون", icon: Boxes, permission: "VIEW_INVENTORY" },
  { label: "عدد المنتجات", icon: Shirt, permission: "VIEW_PRODUCTS" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_DASHBOARD");
  const params = await searchParams;

  const canSeeFinance = hasPermission(profile, "VIEW_FINANCE");
  const canManage = hasPermission(profile, "VIEW_FINANCIAL_ANALYTICS");
  const canSeeReports = hasPermission(profile, "VIEW_REPORTS");

  const today = resolveDateRange("today");
  const preset = isDatePreset(params.range) ? params.range : "month";
  const period = resolveDateRange(preset, { from: params.from, to: params.to });

  // Four independent pictures: today's trading, what the shop holds, how the
  // chosen period compares with the one before it, and what needs attention.
  // They answer different questions and are never summed together.
  const [summary, finance, kpis, comparison, alerts] = await Promise.all([
    hasPermission(profile, "VIEW_INVENTORY") ? getInventorySummary() : null,
    canSeeFinance ? getFinanceSummary(today.from, today.to) : null,
    canManage ? getManagementKpis(period) : null,
    canManage ? getPeriodComparison(period) : null,
    canManage ? getManagementAlerts() : null,
  ]);

  const insights = kpis && comparison ? buildInsights(kpis, comparison) : [];
  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";

  const visibleKpis = KPIS.filter((kpi) =>
    hasPermission(profile, kpi.permission),
  ).map((kpi) => {
    if (summary && kpi.label === "قيمة المخزون") {
      return summary.total_variants > 0
        ? { ...kpi, value: formatMoney(summary.stock_value), hint: "محسوبة بسعر الشراء" }
        : kpi;
    }
    if (finance) {
      if (kpi.label === "مبيعات اليوم") {
        return {
          ...kpi,
          value: formatMoney(finance.net_sales),
          hint: `مقبوضات ${formatMoney(finance.payments_received)}`,
        };
      }
      if (kpi.label === "المصاريف اليوم") {
        return {
          ...kpi,
          value: formatMoney(finance.operating_expenses),
          hint: "مصاريف تشغيلية",
        };
      }
      if (kpi.label === "صافي اليوم") {
        return {
          ...kpi,
          value: formatMoney(finance.operating_profit),
          hint: "الربح بعد المصاريف",
        };
      }
      if (kpi.label === "المشتريات اليوم") {
        return {
          ...kpi,
          value: formatMoney(finance.total_purchases),
          hint: `مدفوع ${formatMoney(finance.purchase_payments)}`,
        };
      }
    }
    if (!summary) return kpi;
    if (kpi.label === "عدد المنتجات") {
      return summary.total_products > 0
        ? {
            ...kpi,
            value: formatNumber(summary.total_products),
            hint: `${formatNumber(summary.total_variants)} موديل · ${formatNumber(summary.total_units)} قطعة`,
          }
        : kpi;
    }
    return kpi;
  });

  const firstName = profile.full_name.split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`أهلاً ${firstName}`}
        description="نظرة عامة على حركة المحل. كل رقم هنا محسوب من سجل الحركات، لا من نسخة ثانية من البيانات."
        actions={
          canSeeReports ? (
            <Button asChild variant="outline">
              <Link href="/reports">
                <ChartNoAxesColumn className="size-4" />
                التقارير
              </Link>
            </Button>
          ) : (
            <Badge
              variant="outline"
              className="bg-accent text-accent-foreground border-accent-foreground/15"
            >
              اليوم
            </Badge>
          )
        }
      />

      <section
        aria-label="مؤشرات اليوم"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {visibleKpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            icon={kpi.icon}
            accent={kpi.accent}
            value={kpi.value}
            hint={kpi.hint}
          />
        ))}
      </section>

      {canManage && kpis ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              <h2 className="text-lg font-semibold">مؤشرات الإدارة</h2>
              <p className="text-muted-foreground text-sm">
                {presetLabel} — مقارنة بالفترة السابقة لها بنفس الطول.
              </p>
            </div>
            <DashboardRangePicker />
          </div>

          <section
            aria-label="مؤشرات الفترة"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label="صافي المبيعات"
              icon={ShoppingBag}
              accent
              value={
                Number(kpis.net_sales) !== 0 ? formatMoney(kpis.net_sales) : undefined
              }
              hint={`${formatNumber(kpis.order_count)} فاتورة · متوسط ${formatMoney(kpis.average_order_value)}`}
            />
            <StatCard
              label="الربح الإجمالي"
              icon={TrendingUp}
              value={
                Number(kpis.net_sales) !== 0 ? formatMoney(kpis.gross_profit) : undefined
              }
              hint={`هامش ${formatPercent(kpis.gross_margin)}`}
            />
            <StatCard
              label="الربح التشغيلي"
              icon={Percent}
              value={
                Number(kpis.net_sales) !== 0 || Number(kpis.operating_profit) !== 0
                  ? formatMoney(kpis.operating_profit)
                  : undefined
              }
              hint={`المصاريف ${formatPercent(kpis.expense_ratio)} من المبيعات`}
            />
            <StatCard
              label="دوران المخزون"
              icon={ArrowLeftRight}
              value={
                Number(kpis.inventory_cost) > 0
                  ? formatNumber(
                      Math.round(Number(kpis.inventory_turnover) * 100) / 100,
                    )
                  : undefined
              }
              hint={`مخزون بتكلفة ${formatMoney(kpis.inventory_cost)}`}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>مقارنة بالفترة السابقة</CardTitle>
                <CardDescription>
                  اللون يتبع ما إذا كانت الحركة في صالح المحل، لا اتجاه السهم —
                  ارتفاع المصاريف والمرتجعات ليس خبراً جيداً.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ComparisonGrid rows={comparison ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>تنبيهات</CardTitle>
                <CardDescription>
                  حدود التنبيه قابلة للتعديل من إعدادات التقارير.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ManagementAlerts alerts={alerts ?? []} />
              </CardContent>
            </Card>
          </div>

          {insights.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-lg">
                    <Lightbulb className="size-4" strokeWidth={1.8} />
                  </span>
                  ملاحظات على الفترة
                </CardTitle>
                <CardDescription>
                  ملاحظات مشتقة من الأرقام أعلاه بقواعد ثابتة — لا تقديرات ولا
                  توقعات.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.map((insight) => {
                  const content = (
                    <span className="text-sm leading-relaxed">{insight.text}</span>
                  );
                  const className = cn(
                    "block rounded-xl border p-3",
                    insight.tone === "positive" && "border-success/30 bg-success/5",
                    insight.tone === "negative" &&
                      "border-destructive/30 bg-destructive/5",
                    insight.tone === "neutral" && "border-border/70",
                    insight.href && "hover:border-primary/40 transition-colors",
                  );
                  return insight.href ? (
                    <Link key={insight.key} href={insight.href} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <div key={insight.key} className={className}>
                      {content}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <QuickLink
              href="/reports/customers/debt"
              icon={Users}
              label="ذمم العملاء"
              value={formatMoney(kpis.customer_receivables)}
            />
            <QuickLink
              href="/reports/suppliers/debt"
              icon={Banknote}
              label="ذمم الموردين"
              value={formatMoney(kpis.supplier_payables)}
            />
            <QuickLink
              href="/reports/inventory/low-stock"
              icon={Boxes}
              label="مخزون منخفض"
              value={`${formatNumber(kpis.low_stock_count)} موديل`}
            />
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>حركة المبيعات الأسبوعية</CardTitle>
          <CardDescription>
            إجمالي المبيعات لكل يوم خلال الأسبوع الحالي.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyActivityChart />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="border-border/70 hover:border-primary/40 hover:bg-accent/50 flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
    >
      <span className="flex items-center gap-2.5">
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="text-sm">{label}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </Link>
  );
}
