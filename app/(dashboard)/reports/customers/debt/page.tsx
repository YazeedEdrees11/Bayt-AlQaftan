import type { Metadata } from "next";

import { CustomerReport } from "@/components/reports/customer-report";

export const metadata: Metadata = { title: "ذمم العملاء" };

export default async function CustomerDebtPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  return (
    <CustomerReport
      mode="debt"
      title="ذمم العملاء"
      description="العملاء الذين عليهم مبالغ مستحقة، مرتبين بالأكبر. تاريخ آخر دفعة يُبرَز إذا تجاوز شهراً."
      searchParams={searchParams}
    />
  );
}
