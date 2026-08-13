import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CustomersBrowser } from "@/components/customers/customers-browser";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listCustomers } from "@/lib/sales/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";

export const metadata: Metadata = { title: "العملاء" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_CUSTOMERS");
  const params = await searchParams;

  const status =
    params.status === "ACTIVE" || params.status === "INACTIVE"
      ? params.status
      : "ALL";

  const data = await listCustomers({
    search: params.q,
    status,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="العملاء"
        description="إدارة بيانات العملاء ومتابعة مشترياتهم."
      />

      <CustomersBrowser
        data={data}
        canCreate={hasPermission(profile, "CREATE_CUSTOMERS")}
        canUpdate={hasPermission(profile, "UPDATE_CUSTOMERS")}
        canManage={hasPermission(profile, "MANAGE_CUSTOMERS")}
      />
    </div>
  );
}
