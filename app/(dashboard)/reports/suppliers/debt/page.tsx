import type { Metadata } from "next";

import { SupplierReport } from "@/components/reports/supplier-report";

export const metadata: Metadata = { title: "ذمم الموردين" };

export default async function SupplierDebtPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  return (
    <SupplierReport
      debtOnly
      title="ذمم الموردين"
      description="الموردون الذين لهم مبالغ علينا، مرتبين بالأكبر. التسديد يتم من شاشة الذمم في المالية."
      searchParams={searchParams}
    />
  );
}
