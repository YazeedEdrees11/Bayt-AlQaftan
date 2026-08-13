import type { Metadata } from "next";

import { StockAlertReport } from "@/components/reports/stock-alert-report";

export const metadata: Metadata = { title: "المخزون الراكد" };

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; perPage?: string }>;
}) {
  return (
    <StockAlertReport
      mode="DEAD"
      title="المخزون الراكد"
      description="بضاعة موجودة ولم تُبع منذ المدة المحددة في إعدادات التقارير. رأس مال واقف، لا خسارة — بعد."
      emptyTitle="لا يوجد مخزون راكد"
      emptyDescription="كل الموديلات المتوفرة تحرّكت خلال المدة المحددة."
      searchParams={searchParams}
    />
  );
}
