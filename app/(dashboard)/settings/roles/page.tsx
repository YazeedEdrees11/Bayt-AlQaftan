import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PermissionMatrix } from "@/components/settings/permission-matrix";
import { requirePermission } from "@/lib/auth/require-auth";
import { getRoleMatrix } from "@/lib/permissions/role-permissions";
import { ungroupedPermissions } from "@/lib/permissions/permission-groups";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import type { Permission } from "@/types/auth";

export const metadata: Metadata = { title: "الأدوار والصلاحيات" };

export default async function RolesPage() {
  await requirePermission("MANAGE_SETTINGS");
  const matrix = await getRoleMatrix();

  // A permission the application defines but the groups forgot would be
  // invisible here and therefore uneditable. Say so rather than hide it.
  const missing = ungroupedPermissions(Object.values(PERMISSIONS) as Permission[]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأدوار والصلاحيات"
        description="ما يستطيع كل دور فعله. التبديل هنا يغيّر ما تقبله قاعدة البيانات نفسها، لا ما تعرضه الشاشة فقط."
      />

      {missing.length > 0 ? (
        <p className="border-warning/40 bg-warning/5 text-warning flex items-start gap-2 rounded-xl border p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          صلاحيات غير مصنّفة ولا تظهر أدناه: {missing.join("، ")}
        </p>
      ) : null}

      <PermissionMatrix matrix={matrix} />
    </div>
  );
}
