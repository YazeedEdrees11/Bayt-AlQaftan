import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SaleForm } from "@/components/sales/sale-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listActiveCustomers } from "@/lib/sales/queries";

export const metadata: Metadata = { title: "إضافة بيع" };

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { profile } = await requirePermission("CREATE_SALES");

  const [customers, params] = await Promise.all([
    listActiveCustomers(undefined, 200),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة بيع"
        description="سجّل القطع المباعة. سيتم خصم الكميات من المخزون تلقائياً."
        actions={
          <Button asChild variant="outline">
            <Link href="/sales">
              <ChevronRight className="size-4" />
              رجوع للمبيعات
            </Link>
          </Button>
        }
      />

      <SaleForm
        customers={customers}
        defaultCustomerId={params.customer}
        canSeeProfit={hasPermission(profile, "VIEW_PROFIT")}
        canCreateCustomer={hasPermission(profile, "CREATE_CUSTOMERS")}
      />
    </div>
  );
}
