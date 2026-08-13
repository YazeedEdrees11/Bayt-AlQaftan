import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ReturnForm } from "@/components/returns/return-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import {
  getReturnableItems,
  getSaleHeaderForReturn,
} from "@/lib/returns/queries";

export const metadata: Metadata = { title: "إضافة مرتجع" };

export default async function NewReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>;
}) {
  const { profile } = await requirePermission("CREATE_RETURNS");
  const params = await searchParams;

  // Arriving from a sale's "record a return" button: resolve it here so the
  // form renders complete instead of filling itself in after mount.
  const [initialSale, initialItems] = params.sale
    ? await Promise.all([
        getSaleHeaderForReturn(params.sale),
        getReturnableItems(params.sale),
      ])
    : [null, []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة مرتجع"
        description="سجّل القطع المرتجعة. سيتم إعادتها إلى المخزون تلقائياً."
        actions={
          <Button asChild variant="outline">
            <Link href="/returns">
              <ChevronRight className="size-4" />
              رجوع للمرتجعات
            </Link>
          </Button>
        }
      />

      <ReturnForm
        canRefund={hasPermission(profile, "CREATE_REFUNDS")}
        initialSale={initialSale}
        initialItems={initialItems}
      />
    </div>
  );
}
