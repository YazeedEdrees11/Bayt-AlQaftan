import type { Metadata } from "next";

import { SupplierReport } from "@/components/reports/supplier-report";

export const metadata: Metadata = { title: "تقرير الموردين" };

export default async function SuppliersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  return (
    <SupplierReport
      debtOnly={false}
      title="تقرير الموردين"
      description="كل مورد له حركة، بمشترياته ومدفوعاته ورصيده. البيانات تراكمية، لا تخص فترة."
      searchParams={searchParams}
    />
  );
}
