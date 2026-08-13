import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AdjustmentsBrowser } from "@/components/inventory/adjustments-browser";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listAdjustments } from "@/lib/returns/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import type { ReturnStatus } from "@/types/returns";

export const metadata: Metadata = { title: "تعديلات المخزون" };

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    reason?: string;
    status?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_INVENTORY_ADJUSTMENTS");
  const params = await searchParams;

  const status = (
    ["DRAFT", "COMPLETED", "CANCELLED"].includes(params.status ?? "")
      ? params.status
      : "ALL"
  ) as ReturnStatus | "ALL";

  const data = await listAdjustments({
    search: params.q,
    reason: params.reason ?? "ALL",
    status,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="تعديلات المخزون"
        description="الجرد وتصحيح الكميات وسجل الفروقات."
        actions={
          <Button asChild variant="outline">
            <Link href="/inventory">
              <ChevronRight className="size-4" />
              رجوع للمخزون
            </Link>
          </Button>
        }
      />

      <AdjustmentsBrowser
        data={data}
        canCreate={hasPermission(profile, "CREATE_INVENTORY_ADJUSTMENTS")}
      />
    </div>
  );
}
