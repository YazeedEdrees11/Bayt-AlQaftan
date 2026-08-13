import {
  COMPARISON_LABELS,
  isFavourable,
  trendOf,
  type ComparisonRow,
  type ManagementKpis,
} from "@/types/reports";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";

export type Insight = {
  key: string;
  tone: "positive" | "negative" | "neutral";
  text: string;
  href?: string;
};

/**
 * Deterministic observations about the period (§105).
 *
 * These are derived from figures the reports already computed — no model, no
 * guessing, no invented numbers. Each rule states a fact and its consequence,
 * and a rule that has nothing to say produces nothing rather than filler. Two
 * runs over the same data always produce the same list, in the same order.
 */
export function buildInsights(
  kpis: ManagementKpis,
  comparison: ComparisonRow[],
): Insight[] {
  const insights: Insight[] = [];
  const by = new Map(comparison.map((row) => [row.metric, row]));

  // 1. The headline: which way the business moved, and by how much.
  const sales = by.get("net_sales");
  if (sales && sales.change_percent !== null && Math.abs(Number(sales.change_percent)) >= 5) {
    const direction = trendOf(sales.change_value);
    insights.push({
      key: "net_sales_move",
      tone: isFavourable("net_sales", direction) ? "positive" : "negative",
      text: `${COMPARISON_LABELS.net_sales} ${direction === "up" ? "أعلى" : "أقل"} من الفترة السابقة بنسبة ${formatPercent(Math.abs(Number(sales.change_percent)))} (${formatMoney(Math.abs(Number(sales.change_value)))}).`,
      href: "/reports/sales",
    });
  }

  // 2. Profit moving against sales is the case worth naming explicitly.
  const profit = by.get("operating_profit");
  if (sales && profit) {
    const salesUp = Number(sales.change_value) > 0;
    const profitDown = Number(profit.change_value) < 0;
    if (salesUp && profitDown) {
      insights.push({
        key: "profit_diverges",
        tone: "negative",
        text: `المبيعات ارتفعت بينما انخفض الربح التشغيلي بمقدار ${formatMoney(Math.abs(Number(profit.change_value)))} — التكلفة أو المصاريف تنمو أسرع من البيع.`,
        href: "/reports/profit",
      });
    }
  }

  // 3. Expenses eating the margin.
  if (Number(kpis.net_sales) > 0 && Number(kpis.expense_ratio) >= 30) {
    insights.push({
      key: "expense_ratio",
      tone: "negative",
      text: `المصاريف تستهلك ${formatPercent(kpis.expense_ratio)} من صافي المبيعات.`,
      href: "/finance/expenses/report",
    });
  }

  // 4. Returns above one in twenty units is a product or sizing problem.
  if (Number(kpis.units_sold) > 0 && Number(kpis.return_rate) >= 5) {
    insights.push({
      key: "return_rate",
      tone: "negative",
      text: `معدل المرتجعات ${formatPercent(kpis.return_rate)} من القطع المباعة.`,
      href: "/returns",
    });
  }

  // 5. Money sitting with customers rather than in the till.
  if (Number(kpis.customer_receivables) > 0 && Number(kpis.net_sales) > 0) {
    const ratio = (Number(kpis.customer_receivables) / Number(kpis.net_sales)) * 100;
    if (ratio >= 25) {
      insights.push({
        key: "receivables",
        tone: "negative",
        text: `الذمم على العملاء ${formatMoney(kpis.customer_receivables)} — ما يعادل ${formatPercent(ratio)} من مبيعات الفترة.`,
        href: "/reports/customers/debt",
      });
    }
  }

  // 6. Stock turning slowly ties up the shop's capital.
  if (Number(kpis.inventory_cost) > 0 && Number(kpis.inventory_turnover) > 0 &&
      Number(kpis.inventory_turnover) < 0.5) {
    insights.push({
      key: "turnover",
      tone: "neutral",
      text: `معدل دوران المخزون ${formatNumber(Math.round(Number(kpis.inventory_turnover) * 100) / 100)} خلال الفترة — رأس مال بقيمة ${formatMoney(kpis.inventory_cost)} يتحرك ببطء.`,
      href: "/reports/inventory/dead-stock",
    });
  }

  // 7. Good news deserves the same treatment as bad.
  if (Number(kpis.net_sales) > 0 && Number(kpis.gross_margin) >= 40) {
    insights.push({
      key: "healthy_margin",
      tone: "positive",
      text: `الهامش الإجمالي ${formatPercent(kpis.gross_margin)} على مبيعات ${formatMoney(kpis.net_sales)}.`,
      href: "/reports/profit",
    });
  }

  return insights;
}
