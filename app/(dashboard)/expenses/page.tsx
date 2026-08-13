import type { Metadata } from "next";
import { Receipt, TrendingDown, Wallet } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ExpensesBrowser } from "@/components/finance/expenses-browser";
import { FinanceRangePicker } from "@/components/finance/finance-range-picker";
import { StatCard } from "@/components/dashboard/stat-card";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import {
  getExpenseReport,
  listActiveAccounts,
  listExpenseCategories,
  listExpenses,
} from "@/lib/finance/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatNumber } from "@/lib/utils/format";

export const metadata: Metadata = { title: "المصاريف" };

function parseAmount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; range?: string; from?: string; to?: string;
    category?: string; method?: string; account?: string; status?: string;
    minAmount?: string; maxAmount?: string; page?: string; perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_EXPENSES");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const [data, categories, accounts, report] = await Promise.all([
    listExpenses({
      search: params.q,
      categoryId: params.category,
      method: params.method ?? "ALL",
      accountId: params.account,
      status: params.status ?? "ALL",
      from: range.from,
      to: range.to,
      minAmount: parseAmount(params.minAmount),
      maxAmount: parseAmount(params.maxAmount),
      page: normalizePage(params.page),
      perPage: normalizePageSize(params.perPage),
    }),
    listExpenseCategories(),
    listActiveAccounts(),
    getExpenseReport(range.from, range.to),
  ]);

  const periodTotal = report.reduce((sum, row) => sum + Number(row.total), 0);
  const entryCount = report.reduce((sum, row) => sum + Number(row.entry_count), 0);
  const topCategory = report[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="المصاريف"
        description="مصاريف التشغيل وأثرها على الصندوق والبنك."
        actions={<FinanceRangePicker />}
      />

      <section aria-label="ملخص المصاريف" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="إجمالي المصاريف"
          icon={TrendingDown}
          accent
          value={periodTotal > 0 ? formatMoney(periodTotal) : undefined}
          hint="خلال الفترة المختارة"
        />
        <StatCard
          label="عدد الحركات"
          icon={Receipt}
          value={entryCount > 0 ? formatNumber(entryCount) : undefined}
          hint="مصاريف مكتملة"
        />
        <StatCard
          label="أعلى تصنيف"
          icon={Wallet}
          value={topCategory ? formatMoney(topCategory.total) : undefined}
          hint={topCategory ? topCategory.category_name : "لا توجد بيانات"}
        />
      </section>

      <ExpensesBrowser
        data={data}
        categories={categories}
        accounts={accounts}
        canCreate={hasPermission(profile, "CREATE_EXPENSE")}
      />
    </div>
  );
}
