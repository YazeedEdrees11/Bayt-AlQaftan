import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ChevronRight, Landmark, Wallet } from "lucide-react";

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
import { getSalesReport } from "@/lib/reports/queries";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata: Metadata = { title: "طرق الدفع" };

export default async function PaymentMethodsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requirePermission("VIEW_CASH_FLOW");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });
  const report = await getSalesReport(range);

  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";
  const cash = Number(report.cash_sales);
  const bank = Number(report.bank_sales);
  const collected = cash + bank;
  const cashShare = collected > 0 ? (cash / collected) * 100 : 0;
  const bankShare = collected > 0 ? (bank / collected) * 100 : 0;

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="طرق الدفع"
        description={`توزيع ما حُصّل من فواتير المبيعات خلال ${presetLabel} بين النقد والتحويل البنكي.`}
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
          بيت القفطان — طرق الدفع · الفترة: {range.from ?? "البداية"} إلى{" "}
          {range.to ?? "اليوم"}
        </p>
      </div>

      <section aria-label="ملخص المقبوضات" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="إجمالي المحصّل"
          icon={Wallet}
          accent
          value={collected > 0 ? formatMoney(report.total_collected) : undefined}
          hint="من فواتير هذه الفترة"
        />
        <StatCard
          label="نقدي"
          icon={Banknote}
          value={collected > 0 ? formatMoney(cash) : undefined}
          hint={collected > 0 ? `${formatPercent(cashShare)} من المحصّل` : undefined}
        />
        <StatCard
          label="تحويل بنكي"
          icon={Landmark}
          value={collected > 0 ? formatMoney(bank) : undefined}
          hint={collected > 0 ? `${formatPercent(bankShare)} من المحصّل` : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-print="block">
          <CardHeader>
            <CardTitle>التوزيع</CardTitle>
            <CardDescription>
              النقد والتحويل البنكي هما طريقتا الدفع الوحيدتان في النظام.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {collected === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                لم تُحصَّل أي مبالغ ضمن الفترة المحددة.
              </p>
            ) : (
              <>
                <div
                  className="bg-muted flex h-4 overflow-hidden rounded-full"
                  role="presentation"
                >
                  <div className="bg-primary h-full" style={{ width: `${cashShare}%` }} />
                  <div className="bg-success h-full" style={{ width: `${bankShare}%` }} />
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="bg-primary size-2.5 rounded-sm" />
                      نقدي
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(cash)} · {formatPercent(cashShare)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="bg-success size-2.5 rounded-sm" />
                      تحويل بنكي
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(bank)} · {formatPercent(bankShare)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-print="block">
          <CardHeader>
            <CardTitle>المحصّل مقابل المبيع</CardTitle>
            <CardDescription>
              ما بيع ليس ما قُبض. الفرق دين على العملاء، لا خسارة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">صافي المبيعات</span>
              <span className="font-medium tabular-nums">
                {formatMoney(report.net_sales)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">المحصّل</span>
              <span className="text-success font-medium tabular-nums">
                {formatMoney(report.total_collected)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">المتبقي على العملاء</span>
              <span className="text-destructive text-base font-semibold tabular-nums">
                {formatMoney(report.total_outstanding)}
              </span>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2 pt-1" data-print="hide">
              <Button asChild variant="outline" size="sm">
                <Link href="/finance/cash-flow">التدفق النقدي</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/finance/receivables">ذمم العملاء</Link>
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              هذه الشاشة تخص مقبوضات المبيعات فقط؛ الحركة الكاملة للصندوق والبنك
              في شاشة التدفق النقدي.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
