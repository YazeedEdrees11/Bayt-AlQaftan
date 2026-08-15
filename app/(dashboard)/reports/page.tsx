import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  CalendarCheck,
  ChartNoAxesColumn,
  Coins,
  PackageX,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { cn } from "@/lib/utils/cn";
import type { Permission } from "@/types/auth";

export const metadata: Metadata = { title: "التقارير" };

type ReportLink = {
  href: string;
  label: string;
  description: string;
  permission: Permission;
};

type ReportGroup = {
  title: string;
  icon: typeof ShoppingBag;
  reports: ReportLink[];
};

/**
 * The report centre.
 *
 * Every entry is filtered by the permission the report itself enforces, so the
 * page never advertises something the user would be refused on arrival — and
 * hiding the link is presentation only, never the control (§97).
 */
const GROUPS: ReportGroup[] = [
  {
    title: "المبيعات",
    icon: ShoppingBag,
    reports: [
      {
        href: "/reports/sales",
        label: "تقرير المبيعات",
        description: "الإجمالي والصافي والمرتجعات وطرق الدفع خلال الفترة.",
        permission: "VIEW_SALES_REPORT",
      },
      {
        href: "/reports/products/top",
        label: "أكثر المنتجات مبيعاً",
        description: "الكميات والإيرادات والربح لكل موديل.",
        permission: "VIEW_SALES_REPORT",
      },
      {
        href: "/reports/customers/top",
        label: "أفضل العملاء",
        description: "العملاء الأعلى شراءً ومتوسط الفاتورة.",
        permission: "VIEW_CUSTOMER_REPORT",
      },
    ],
  },
  {
    title: "الأرباح",
    icon: TrendingUp,
    reports: [
      {
        href: "/reports/profit",
        label: "تقرير الأرباح",
        description: "من المبيعات إلى الربح التشغيلي بتعريف واحد للأرقام.",
        permission: "VIEW_PROFIT_REPORT",
      },
      {
        href: "/reports/products/profit",
        label: "الأرباح حسب المنتج",
        description: "أي المنتجات يصنع الربح فعلاً، لا الأكثر مبيعاً فقط.",
        permission: "VIEW_PROFIT_REPORT",
      },
    ],
  },
  {
    title: "المخزون",
    icon: Boxes,
    reports: [
      {
        href: "/reports/inventory/value",
        label: "قيمة المخزون",
        description: "التكلفة والقيمة البيعية والربح الكامن.",
        permission: "VIEW_INVENTORY_REPORT",
      },
      {
        href: "/reports/inventory/low-stock",
        label: "المخزون المنخفض",
        description: "ما وصل الحد الأدنى لكل موديل.",
        permission: "VIEW_INVENTORY_REPORT",
      },
      {
        href: "/reports/inventory/out-of-stock",
        label: "نفاد المخزون",
        description: "موديلات مفعّلة ولا يوجد منها شيء.",
        permission: "VIEW_INVENTORY_REPORT",
      },
      {
        href: "/reports/inventory/dead-stock",
        label: "المخزون الراكد",
        description: "بضاعة لم تتحرك منذ فترة طويلة.",
        permission: "VIEW_INVENTORY_REPORT",
      },
      {
        href: "/reports/inventory/movement",
        label: "حركة المخزون",
        description: "كل حركة دخول وخروج مع مرجعها.",
        permission: "VIEW_INVENTORY_REPORT",
      },
    ],
  },
  {
    title: "المشتريات والموردون",
    icon: ShoppingCart,
    reports: [
      {
        href: "/reports/purchases",
        label: "تقرير المشتريات",
        description: "المشتريات مقابل المدفوع وما تبقّى على الحساب.",
        permission: "VIEW_PURCHASE_REPORT",
      },
      {
        href: "/reports/suppliers",
        label: "تقرير الموردين",
        description: "أداء كل مورد وأرصدته.",
        permission: "VIEW_SUPPLIER_REPORT",
      },
      {
        href: "/reports/suppliers/debt",
        label: "ذمم الموردين",
        description: "من له مال علينا ومنذ متى.",
        permission: "VIEW_SUPPLIER_REPORT",
      },
    ],
  },
  {
    title: "العملاء",
    icon: Users,
    reports: [
      {
        href: "/reports/customers",
        label: "تقرير العملاء",
        description: "عدد الفواتير والمشتريات والمدفوع لكل عميل.",
        permission: "VIEW_CUSTOMER_REPORT",
      },
      {
        href: "/reports/customers/debt",
        label: "ذمم العملاء",
        description: "من علينا متابعته ومنذ متى لم يدفع.",
        permission: "VIEW_CUSTOMER_REPORT",
      },
    ],
  },
  {
    title: "المالية",
    icon: Banknote,
    reports: [
      // These two were built in Phase 6 and already read the finance ledger
      // directly. Linking to them beats building a second screen over the same
      // numbers — two screens is how two answers happen.
      {
        href: "/finance/expenses/report",
        label: "تقرير المصاريف",
        description: "المصاريف حسب التصنيف ونسبتها من الإجمالي.",
        permission: "VIEW_EXPENSE_REPORT",
      },
      {
        href: "/finance/cash-flow",
        label: "التدفق النقدي",
        description: "الداخل والخارج دون خلط التحويلات الداخلية.",
        permission: "VIEW_CASH_FLOW",
      },
      {
        href: "/reports/payments",
        label: "طرق الدفع",
        description: "توزيع المقبوضات بين النقد والبنك.",
        permission: "VIEW_CASH_FLOW",
      },
      {
        href: "/reports/daily-closing",
        label: "الإغلاق اليومي",
        description: "ملخص اليوم وجرد الصندوق مقابل ما يقوله السجل.",
        permission: "VIEW_DAILY_CLOSING",
      },
    ],
  },
  {
    title: "الأداء",
    icon: ChartNoAxesColumn,
    reports: [
      {
        href: "/reports/monthly",
        label: "الأداء الشهري",
        description: "كل شهر من السنة في صف واحد.",
        permission: "VIEW_FINANCIAL_ANALYTICS",
      },
      {
        href: "/reports/yearly",
        label: "الأداء السنوي",
        description: "مقارنة السنوات الأخيرة.",
        permission: "VIEW_FINANCIAL_ANALYTICS",
      },
    ],
  },
];

const GROUP_ICONS: Record<string, typeof ShoppingBag> = {
  المبيعات: ShoppingBag,
  الأرباح: TrendingUp,
  المخزون: Boxes,
  "المشتريات والموردون": Truck,
  العملاء: Users,
  المالية: Coins,
  الأداء: ChartNoAxesColumn,
};

const REPORT_ICONS: Record<string, typeof ShoppingBag> = {
  "/reports/inventory/out-of-stock": PackageX,
  "/reports/inventory/movement": ArrowLeftRight,
  "/reports/expenses": Receipt,
  "/reports/daily-closing": CalendarCheck,
};

import { RevenueChart } from "@/components/reports/revenue-chart";
import { CategoryPieChart } from "@/components/reports/category-pie-chart";
import { getMonthlyPerformance, getProfitByDimension } from "@/lib/reports/queries";

export default async function ReportsPage() {
  const { profile } = await requirePermission("VIEW_REPORTS");

  // Fetch real data for the charts
  const [monthlyPerf, categoryProfit] = await Promise.all([
    getMonthlyPerformance(new Date().getFullYear()),
    getProfitByDimension({}, "category", 5),
  ]);

  const revenueData = monthlyPerf.map((m) => ({
    month: m.label,
    revenue: m.net_sales,
  }));

  const categoryData = categoryProfit.map((c, index) => ({
    name: c.dimension_name || "أخرى",
    value: c.net_sales,
    color: `var(--chart-${(index % 5) + 1})`
  }));

  const groups = GROUPS.map((group) => ({
    ...group,
    reports: group.reports.filter((report) => hasPermission(profile, report.permission)),
  })).filter((group) => group.reports.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        description="كل تقرير يقرأ السجلات نفسها التي تعمل عليها الشاشات اليومية — لا نسخة ثانية من البيانات."
      />

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              لا توجد تقارير متاحة لصلاحياتك.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Main Charts Overview */}
          <div className="grid gap-4 lg:grid-cols-2 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>الأرباح السنوية</CardTitle>
                <CardDescription>نظرة عامة على الإيرادات والأرباح خلال الأشهر الماضية.</CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart data={revenueData.length > 0 ? revenueData : undefined} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>المبيعات حسب التصنيف</CardTitle>
                <CardDescription>توزيع المبيعات على الأقسام الرئيسية خلال الفترة الحالية.</CardDescription>
              </CardHeader>
              <CardContent>
                <CategoryPieChart data={categoryData.length > 0 ? categoryData : undefined} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const Icon = GROUP_ICONS[group.title] ?? group.icon;
            return (
              <Card key={group.title} data-print="block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-lg">
                      <Icon className="size-4" strokeWidth={1.8} />
                    </span>
                    {group.title}
                  </CardTitle>
                  <CardDescription>
                    {group.reports.length} تقرير متاح
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2">
                  {group.reports.map((report) => {
                    const ReportIcon = REPORT_ICONS[report.href];
                    return (
                      <Link
                        key={report.href}
                        href={report.href}
                        className={cn(
                          "border-border/70 hover:border-primary/40 hover:bg-accent/50",
                          "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                        )}
                      >
                        {ReportIcon ? (
                          <ReportIcon
                            aria-hidden
                            className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          />
                        ) : null}
                        <span className="min-w-0 space-y-0.5">
                          <span className="block font-medium">{report.label}</span>
                          <span className="text-muted-foreground block text-xs leading-relaxed">
                            {report.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
