import type { Metadata } from "next";
import { Banknote, Boxes, PackageX, RotateCcw, TrendingDown, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReturnsBrowser } from "@/components/returns/returns-browser";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getReturnsSummary, listReturns } from "@/lib/returns/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { DATE_PRESETS, isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatNumber } from "@/lib/utils/format";
import type { RefundStatus, ReturnStatus } from "@/types/returns";

export const metadata: Metadata = { title: "المرتجعات" };

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    range?: string;
    from?: string;
    to?: string;
    status?: string;
    refundStatus?: string;
    reason?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_RETURNS");
  const params = await searchParams;

  // Returns are rarer than sales, so the month is a more useful default view
  // than the day.
  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const status = (
    ["DRAFT", "COMPLETED", "CANCELLED"].includes(params.status ?? "")
      ? params.status
      : "ALL"
  ) as ReturnStatus | "ALL";

  const refundStatus = (
    ["NO_REFUND", "REFUNDED", "CUSTOMER_CREDIT", "PARTIAL_REFUND"].includes(
      params.refundStatus ?? "",
    )
      ? params.refundStatus
      : "ALL"
  ) as RefundStatus | "ALL";

  const canSeeValues = hasPermission(profile, "VIEW_RETURN_VALUES");

  const [summary, data] = await Promise.all([
    getReturnsSummary(range.from, range.to),
    listReturns({
      search: params.q,
      status,
      refundStatus,
      reason: params.reason ?? "ALL",
      from: range.from,
      to: range.to,
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
  ]);

  const hasData = summary.returns_count > 0;
  const presetLabel = DATE_PRESETS.find((o) => o.value === preset)?.label ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="المرتجعات"
        description="مرتجعات العملاء وأثرها على المخزون والحسابات."
        actions={
          <Badge
            variant="outline"
            className="bg-accent text-accent-foreground border-accent-foreground/15"
          >
            {presetLabel}
          </Badge>
        }
      />

      <section aria-label="ملخص المرتجعات" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="مرتجعات الفترة"
          icon={RotateCcw}
          accent
          value={hasData ? formatNumber(summary.returns_count) : undefined}
          hint="عمليات إرجاع مسجّلة"
        />
        {canSeeValues ? (
          <StatCard
            label="قيمة المرتجعات"
            icon={Wallet}
            value={hasData ? formatMoney(summary.returns_value) : undefined}
            hint="بعد توزيع خصم الفاتورة"
          />
        ) : null}
        {canSeeValues ? (
          <StatCard
            label="المسترد فعلياً"
            icon={Banknote}
            value={hasData ? formatMoney(summary.refunded_value) : undefined}
            hint={
              hasData
                ? `رصيد للعملاء ${formatMoney(summary.credited_value)}`
                : "نقداً أو تحويلاً"
            }
          />
        ) : null}
        <StatCard
          label="عدد القطع المرتجعة"
          icon={Boxes}
          value={hasData ? formatNumber(summary.units_returned) : undefined}
          hint="إجمالي الكميات"
        />
        <StatCard
          label="القطع التالفة"
          icon={PackageX}
          value={hasData ? formatNumber(summary.damaged_units) : undefined}
          hint="لا تعود للمخزون القابل للبيع"
        />
        {canSeeValues ? (
          <StatCard
            label="عكس الربح"
            icon={TrendingDown}
            value={hasData ? formatMoney(summary.profit_reversal) : undefined}
            hint="الربح المعكوس بسبب المرتجعات"
          />
        ) : null}
      </section>

      <ReturnsBrowser
        data={data}
        canCreate={hasPermission(profile, "CREATE_RETURNS")}
        canSeeValues={canSeeValues}
      />
    </div>
  );
}
