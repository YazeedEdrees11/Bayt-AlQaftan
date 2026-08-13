import type { Metadata } from "next";

import { StockAlertReport } from "@/components/reports/stock-alert-report";

export const metadata: Metadata = { title: "المخزون المنخفض" };

export default async function LowStockPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; perPage?: string }>;
}) {
  return (
    <StockAlertReport
      mode="LOW"
      title="المخزون المنخفض"
      description="موديلات وصلت أو نزلت عن الحد الأدنى المحدد لها. الموديلات بلا حد أدنى لا تظهر هنا."
      emptyTitle="لا يوجد مخزون منخفض"
      emptyDescription="كل الموديلات التي لها حد أدنى فوقه حالياً."
      searchParams={searchParams}
    />
  );
}
