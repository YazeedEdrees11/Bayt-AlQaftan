import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReportToolbar } from "@/components/reports/report-toolbar";
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
import { getYearlyPerformance } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "الأداء السنوي" };

export default async function YearlyPerformancePage() {
  await requirePermission("VIEW_FINANCIAL_ANALYTICS");
  const rows = await getYearlyPerformance(5);

  return (
    <div className="space-y-6" data-print="page">
      <PageHeader
        title="الأداء السنوي"
        description="آخر خمس سنوات. السنة الحالية جزئية بطبيعتها، فمقارنتها بسنة كاملة تحتاج انتباهاً."
        actions={
          <>
            <Button asChild variant="ghost" data-print="hide">
              <Link href="/reports">
                <ChevronRight className="size-4" />
                التقارير
              </Link>
            </Button>
            <ReportToolbar showRange={false} />
          </>
        }
      />

      <div className="hidden print:block">
        <p className="text-sm">بيت القفطان — الأداء السنوي</p>
      </div>

      <Card className="gap-0 py-0" data-print="block">
        <CardHeader className="border-b py-5">
          <CardTitle>السنوات</CardTitle>
          <CardDescription>
            سنة بلا حركة تظهر بأصفار بدل أن تُحذف، حتى لا تبدو السلسلة أقصر مما هي.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <PerformanceTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
