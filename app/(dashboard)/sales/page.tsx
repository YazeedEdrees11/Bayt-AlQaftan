import type { Metadata } from "next";
import {
  Banknote,
  Boxes,
  Coins,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SalesBrowser } from "@/components/sales/sales-browser";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getSalesSummary, listSales } from "@/lib/sales/queries";
import { listCategories } from "@/lib/catalog/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import {
  DATE_PRESETS,
  isDatePreset,
  resolveDateRange,
} from "@/lib/sales/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import type { SalePaymentMethod, SalePaymentStatus, SaleStatus } from "@/types/sales";

export const metadata: Metadata = { title: "المبيعات" };

function parseAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    range?: string;
    from?: string;
    to?: string;
    paymentStatus?: string;
    status?: string;
    method?: string;
    category?: string;
    minAmount?: string;
    maxAmount?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_SALES");
  const params = await searchParams;

  // Default view is today's trading — what the shop cares about at closing.
  const preset = isDatePreset(params.range) ? params.range : "today";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const paymentStatus = (
    ["UNPAID", "PARTIALLY_PAID", "PAID"].includes(params.paymentStatus ?? "")
      ? params.paymentStatus
      : "ALL"
  ) as SalePaymentStatus | "ALL";

  const status = (
    ["DRAFT", "COMPLETED", "CANCELLED"].includes(params.status ?? "")
      ? params.status
      : "ALL"
  ) as SaleStatus | "ALL";

  const method = (
    ["CASH", "BANK_TRANSFER"].includes(params.method ?? "") ? params.method : "ALL"
  ) as SalePaymentMethod | "ALL";

  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");

  const [summary, data, categories] = await Promise.all([
    getSalesSummary(range.from, range.to),
    listSales({
      search: params.q,
      paymentStatus,
      status,
      dateFrom: range.from,
      dateTo: range.to,
      minAmount: parseAmount(params.minAmount),
      maxAmount: parseAmount(params.maxAmount),
      paymentMethod: method,
      categoryId: params.category,
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
    listCategories(),
  ]);

  // Every figure comes from completed sales in the selected range.
  const hasData = summary.sales_count > 0;
  const presetLabel =
    DATE_PRESETS.find((option) => option.value === preset)?.label ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="المبيعات"
        description="إدارة ومتابعة مبيعات بيت القفطان."
        actions={
          <Badge
            variant="outline"
            className="bg-accent text-accent-foreground border-accent-foreground/15"
          >
            {presetLabel}
          </Badge>
        }
      />

      <section
        aria-label="ملخص المبيعات"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="مبيعات الفترة"
          icon={ShoppingBag}
          accent
          value={hasData ? formatMoney(summary.net_sales) : undefined}
          // Same qualification as the profit card below: this counts the
          // invoices in the list, and the sales report counts the exchange
          // differences too. Two cards labelled «المبيعات» that disagree by an
          // unexplained amount is how a correct system gets reported as broken.
          hint="صافي الفواتير بعد الخصم — لا يشمل الاستبدالات"
        />
        <StatCard
          label="عدد المبيعات"
          icon={Receipt}
          value={hasData ? formatNumber(summary.sales_count) : undefined}
          hint="عمليات مكتملة"
        />
        <StatCard
          label="المدفوع"
          icon={Banknote}
          value={hasData ? formatMoney(summary.total_paid) : undefined}
          hint={
            hasData
              ? `نقدي ${formatMoney(summary.cash_collected)} · بنكي ${formatMoney(summary.bank_collected)}`
              : "المبالغ المحصّلة"
          }
        />
        <StatCard
          label="المتبقي"
          icon={Coins}
          value={hasData ? formatMoney(summary.total_outstanding) : undefined}
          hint="مستحق على العملاء"
        />
        {canSeeProfit ? (
          <StatCard
            /*
             * Qualified on purpose. This card summarises the invoices listed
             * below it, so it excludes the exchange differences that the profit
             * report counts (0027, 0028) — and the two will differ whenever a
             * customer swaps up or down. Naming it «للفواتير» is what stops
             * that being read as a discrepancy rather than a narrower question.
             */
            label="الربح الإجمالي للفواتير"
            icon={TrendingUp}
            value={hasData ? formatMoney(summary.gross_profit) : undefined}
            hint={
              hasData
                ? `هامش ${formatPercent(Number(summary.gross_margin))} — لا يشمل الاستبدالات`
                : "بعد خصم التكلفة"
            }
          />
        ) : null}
        <StatCard
          label="عدد القطع المباعة"
          icon={Boxes}
          value={hasData ? formatNumber(summary.units_sold) : undefined}
          hint="إجمالي الكميات"
        />
      </section>

      <SalesBrowser
        data={data}
        categories={categories}
        canCreate={hasPermission(profile, "CREATE_SALES")}
        canSeeProfit={canSeeProfit}
      />
    </div>
  );
}
