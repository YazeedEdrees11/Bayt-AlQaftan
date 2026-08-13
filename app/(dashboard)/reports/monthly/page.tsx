import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { UrlSelect } from "@/components/reports/url-select";
import { PerformanceTable } from "@/components/reports/performance-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { getMonthlyPerformance } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "الأداء الشهري" };

/** Years offered in the picker: this year and the four before it. */
function yearOptions(current: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const year = current - index;
    return { value: String(year), label: String(year) };
  });
}

export default async function MonthlyPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePermission("VIEW_FINANCIAL_ANALYTICS");
  const params = await searchParams;

  const thisYear = new Date().getFullYear();
  // Parsed, bounded and never passed through as text (§103).
  const parsed = Number.parseInt(params.year ?? "", 10);
  const year =
    Number.isInteger(parsed) && parsed >= thisYear - 20 && parsed <= thisYear
      ? parsed
      : thisYear;

  const rows = await getMonthlyPerformance(year);

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="الأداء الشهري"
        description={`كل شهر من سنة ${year} في صف واحد. الأرقام مأخوذة من ملخص المالية نفسه الذي تقرأه شاشة الأرباح.`}
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar showRange={false}>
              <UrlSelect
                param="year"
                value={String(year)}
                label="السنة"
                options={yearOptions(thisYear)}
                className="h-10 w-28"
              />
            </ReportToolbar>
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">بيت القفطان — الأداء الشهري · سنة {year}</p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>شهور {year}</CardTitle>
          <CardDescription>
            صافي النقد مستقل عن الربح: شهر رابح قد يكون سالب النقد إذا لم
            تُحصَّل الفواتير.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <PerformanceTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
