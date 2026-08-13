import type { Metadata } from "next";

import { StockAlertReport } from "@/components/reports/stock-alert-report";

export const metadata: Metadata = { title: "نفاد المخزون" };

export default async function OutOfStockPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; perPage?: string }>;
}) {
  return (
    <StockAlertReport
      mode="OUT"
      title="نفاد المخزون"
      description="موديلات مفعّلة لا يوجد منها أي قطعة صالحة للبيع. الموديلات الموقوفة غير مدرجة."
      emptyTitle="لا يوجد نفاد مخزون"
      emptyDescription="كل الموديلات المفعّلة متوفرة حالياً."
      searchParams={searchParams}
    />
  );
}
