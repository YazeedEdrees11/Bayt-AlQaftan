import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listSuppliers } from "@/lib/catalog/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";

export const metadata: Metadata = { title: "الموردين" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    perPage?: string;
  }>;
}) {
  const { profile } = await requirePermission("VIEW_SUPPLIERS");
  const params = await searchParams;

  const status =
    params.status === "ACTIVE" || params.status === "INACTIVE"
      ? params.status
      : "ALL";

  const data = await listSuppliers({
    search: params.q,
    status,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الموردين"
        description="إدارة الموردين ومصادر البضاعة."
      />

      <SuppliersTable
        data={data}
        canCreate={hasPermission(profile, "CREATE_SUPPLIERS")}
        canUpdate={hasPermission(profile, "UPDATE_SUPPLIERS")}
        canManage={hasPermission(profile, "MANAGE_SUPPLIERS")}
      />
    </div>
  );
}
