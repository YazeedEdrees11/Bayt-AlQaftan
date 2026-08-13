import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Coins,
  CreditCard,
  Landmark,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { FinanceRangePicker } from "@/components/finance/finance-range-picker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import {
  getExpenseReport,
  getFinanceSummary,
  getPaymentMethodBreakdown,
  listAccountBalances,
} from "@/lib/finance/queries";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatMoney, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { EXPENSE_METHOD_LABELS } from "@/types/finance";

export const metadata: Metadata = { title: "المالية" };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_FINANCE");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const [summary, accounts, methods, expenses] = await Promise.all([
    getFinanceSummary(range.from, range.to),
    listAccountBalances(),
    getPaymentMethodBreakdown(range.from, range.to),
    getExpenseReport(range.from, range.to),
  ]);

  const canSeeProfit = hasPermission(profile, "VIEW_PROFIT");
  const cashAccounts = accounts.filter((a) => a.account_type === "CASH" && a.is_active);
  const bankAccounts = accounts.filter((a) => a.account_type === "BANK" && a.is_active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المالية"
        description="نظرة شاملة على الوضع المالي لبيت القفطان."
        actions={
          <>
            <FinanceRangePicker />
            <Button asChild variant="outline">
              <Link href="/finance/transactions">
                <ArrowLeftRight className="size-4" />
                الحركات المالية
              </Link>
            </Button>
          </>
        }
      />

      {/* --------------------------------------------------- period figures */}
      <section aria-label="أداء الفترة" className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium">
          أداء الفترة المختارة
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="صافي المبيعات"
            icon={ShoppingBag}
            accent
            value={formatMoney(summary.net_sales)}
            hint={`بعد الخصم والمرتجعات (${formatMoney(summary.sales_returns)} مرتجعات)`}
          />
          <StatCard
            label="إجمالي المشتريات"
            icon={ShoppingCart}
            value={formatMoney(summary.total_purchases)}
            hint={`المدفوع منها ${formatMoney(summary.purchase_payments)}`}
          />
          <StatCard
            label="إجمالي المصاريف"
            icon={Receipt}
            value={formatMoney(summary.operating_expenses)}
            hint="مصاريف تشغيلية"
          />
          {canSeeProfit ? (
            <StatCard
              label="الربح الإجمالي"
              icon={TrendingUp}
              value={formatMoney(summary.gross_profit)}
              hint={`هامش ${formatPercent(Number(summary.gross_margin))}`}
            />
          ) : null}
        </div>
      </section>

      {/* ------------------------------------------------------ the P&L slab */}
      {canSeeProfit ? (
        <Card>
          <CardHeader>
            <CardTitle>الملخص المالي</CardTitle>
            <CardDescription>
              من المبيعات إلى الربح التشغيلي. تكلفة البضاعة منفصلة عن المصاريف
              التشغيلية — الإيجار ليس جزءاً من تكلفة الثوب.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mx-auto w-full max-w-lg space-y-2.5 text-sm">
              <Row label="إجمالي المبيعات" value={formatMoney(summary.gross_sales)} />
              <Row label="الخصومات" value={`− ${formatMoney(summary.sales_discounts)}`} />
              <Row label="المرتجعات" value={`− ${formatMoney(summary.sales_returns)}`} />
              <Separator />
              <Row label="صافي المبيعات" value={formatMoney(summary.net_sales)} bold />
              <Row label="تكلفة البضاعة المباعة" value={`− ${formatMoney(summary.cogs)}`} />
              <Separator />
              <Row
                label="الربح الإجمالي"
                value={formatMoney(summary.gross_profit)}
                bold
                tone={summary.gross_profit >= 0 ? "positive" : "negative"}
              />
              <Row
                label="المصاريف التشغيلية"
                value={`− ${formatMoney(summary.operating_expenses)}`}
              />
              <Separator />
              <div className="flex items-center justify-between pt-1">
                <span className="text-base font-semibold">الربح التشغيلي</span>
                <span
                  className={cn(
                    "text-xl font-bold",
                    summary.operating_profit >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatMoney(summary.operating_profit)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- cash vs P&L */}
      <section aria-label="النقد والأرصدة" className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium">
          الأرصدة الحالية
          <span className="text-muted-foreground/70 ms-2 text-xs font-normal">
            (لحظية — لا تتأثر بالفترة المختارة)
          </span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="الرصيد النقدي"
            icon={Wallet}
            value={formatMoney(summary.cash_balance)}
            hint={`${cashAccounts.length} حساب نقدي`}
          />
          <StatCard
            label="الرصيد البنكي"
            icon={Landmark}
            value={formatMoney(summary.bank_balance)}
            hint={`${bankAccounts.length} حساب بنكي`}
          />
          <StatCard
            label="مستحق على العملاء"
            icon={Users}
            value={formatMoney(summary.customer_receivables)}
            hint="ذمم مدينة"
          />
          <StatCard
            label="مستحق للموردين"
            icon={Coins}
            value={formatMoney(summary.supplier_payables)}
            hint="ذمم دائنة"
          />
        </div>

        {/* §64: the single most misread pair of numbers on any finance screen. */}
        <p className="text-muted-foreground border-border/70 bg-muted/20 rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
          الربح ليس النقد. بيع بمئة دينار يُسجَّل كإيراد كاملاً حتى لو حُصِّل منه
          ستون فقط — والباقي يظهر كذمة على العميل. رصيد الصندوق يتأثر أيضاً
          بالمشتريات والمصاريف والأرصدة الافتتاحية.
        </p>
      </section>

      {/* -------------------------------------------------------- cash flow */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">التدفق النقدي للفترة</CardTitle>
            <CardDescription>
              التحويلات الداخلية والأرصدة الافتتاحية مستثناة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="مقبوضات" value={formatMoney(summary.cash_in)} tone="positive" />
            <Row label="مدفوعات" value={`− ${formatMoney(summary.cash_out)}`} tone="negative" />
            <Separator />
            <Row
              label="صافي التدفق النقدي"
              value={formatMoney(summary.net_cash_flow)}
              bold
              tone={summary.net_cash_flow >= 0 ? "positive" : "negative"}
            />
            <Separator />
            <Row label="مقبوضات من العملاء" value={formatMoney(summary.payments_received)} />
            <Row label="مدفوعات للموردين" value={formatMoney(summary.payments_made)} />
            <Row label="مبالغ مستردة" value={formatMoney(summary.refunds_paid)} />
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link href="/finance/cash-flow">تقرير التدفق النقدي</Link>
            </Button>
          </CardContent>
        </Card>

        {/* ------------------------------------------- payment method split */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">حسب طريقة الدفع</CardTitle>
            <CardDescription>توزيع المقبوضات بين النقد والبنك.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {methods.every((m) => Number(m.money_in) === 0 && Number(m.money_out) === 0) ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                لا توجد حركات في هذه الفترة.
              </p>
            ) : (
              methods.map((method) => (
                <div key={method.method} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      {method.method === "CASH" ? (
                        <Wallet className="size-4" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      {EXPENSE_METHOD_LABELS[method.method]}
                    </span>
                    <span className="text-success font-medium">
                      {formatMoney(method.money_in)}
                    </span>
                  </div>
                  <div
                    className="bg-muted h-2 overflow-hidden rounded-full"
                    role="presentation"
                  >
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${Math.min(100, Number(method.in_percentage))}%` }}
                    />
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>{formatPercent(Number(method.in_percentage))} من المقبوضات</span>
                    <span>صادر {formatMoney(method.money_out)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ---------------------------------------------- expenses by category */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="text-base">المصاريف حسب التصنيف</CardTitle>
              <CardDescription>أعلى بنود الإنفاق في الفترة.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/expenses">الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {expenses.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                لا توجد مصاريف في هذه الفترة.
              </p>
            ) : (
              expenses.slice(0, 6).map((row) => (
                <div key={row.category_id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{row.category_name}</span>
                    <span>{formatMoney(row.total)}</span>
                  </div>
                  <div className="bg-muted h-2 overflow-hidden rounded-full" role="presentation">
                    <div
                      className="bg-gold h-full rounded-full"
                      style={{ width: `${Math.min(100, Number(row.percentage))}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatPercent(Number(row.percentage))} · {row.entry_count} حركة
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------- accounts */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-start justify-between gap-4 border-b py-5">
          <div className="space-y-1.5">
            <CardTitle>الحسابات المالية</CardTitle>
            <CardDescription>
              الأرصدة محسوبة من سجل الحركات المالية، لا من رقم مخزَّن.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link href="/finance/accounts">
              <Banknote className="size-4" />
              إدارة الحسابات
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="لا توجد حسابات مالية"
              description="أضف حساب صندوق وحساباً بنكياً للبدء."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">الحساب</TableHead>
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الوارد</TableHead>
                    <TableHead className="text-start">الصادر</TableHead>
                    <TableHead className="text-start">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.account_id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/finance/accounts/${account.account_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {account.name}
                        </Link>
                        {account.is_default ? (
                          <span className="text-muted-foreground ms-2 text-xs">
                            (افتراضي)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.account_type === "CASH" ? "صندوق" : "بنك"}
                      </TableCell>
                      <TableCell className="text-success text-sm">
                        {formatMoney(account.total_in)}
                      </TableCell>
                      <TableCell className="text-destructive text-sm">
                        {formatMoney(account.total_out)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-medium",
                          Number(account.balance) < 0 && "text-destructive",
                        )}
                      >
                        {formatMoney(account.balance)}
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
  );
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-medium")}>
        {label}
      </span>
      <span
        className={cn(
          "font-medium tabular-nums",
          bold && "text-base font-semibold",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
