import type { Metadata } from "next";

import { CustomerReport } from "@/components/reports/customer-report";

export const metadata: Metadata = { title: "أفضل العملاء" };

export default async function TopCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  return (
    <CustomerReport
      mode="top"
      title="أفضل العملاء"
      description="أعلى ٢٥ عميلاً من حيث إجمالي المشتريات. الترتيب بالشراء لا بالربح، لأن الربح لا يُنسب لعميل."
      searchParams={searchParams}
    />
  );
}
