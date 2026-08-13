import type { Metadata } from "next";

import { CustomerReport } from "@/components/reports/customer-report";

export const metadata: Metadata = { title: "تقرير العملاء" };

export default async function CustomersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  return (
    <CustomerReport
      mode="all"
      title="تقرير العملاء"
      description="كل عميل له حركة، بمشترياته ومدفوعاته ورصيده. البيانات تراكمية، لا تخص فترة."
      searchParams={searchParams}
    />
  );
}
