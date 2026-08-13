import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { listActiveSuppliers } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "إضافة مشتريات" };

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string }>;
}) {
  await requirePermission("CREATE_PURCHASES");

  const [suppliers, params] = await Promise.all([
    listActiveSuppliers(),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة مشتريات"
        description="سجّل البضاعة الواردة من المورد. سيتم إضافة الكميات إلى المخزون تلقائياً."
        actions={
          <Button asChild variant="outline">
            <Link href="/purchases">
              <ChevronRight className="size-4" />
              رجوع للمشتريات
            </Link>
          </Button>
        }
      />

      <PurchaseForm
        suppliers={suppliers}
        defaultSupplierId={params.supplier}
      />
    </div>
  );
}
