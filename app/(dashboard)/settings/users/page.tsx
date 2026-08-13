import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { UsersTable, type UserRow } from "@/components/users/users-table";
import { requirePermission } from "@/lib/auth/require-auth";
import { listUsers } from "@/lib/users/get-users";
import { getLastActivityByUser } from "@/lib/settings/queries";
import { formatDate, formatDateTime } from "@/lib/utils/format";

export const metadata: Metadata = { title: "المستخدمون" };

/**
 * User management (§7–§11).
 *
 * The same screen Phase 1 built, now living under settings and carrying the
 * last-activity column. Deactivation is unchanged and still never deletes
 * anything: the account stops working, the history it created stays (§10).
 */
export default async function SettingsUsersPage() {
  const currentUser = await requirePermission("MANAGE_USERS");

  const [profiles, lastActivity] = await Promise.all([
    listUsers(),
    getLastActivityByUser(),
  ]);

  const rows: UserRow[] = profiles.map((profile) => {
    const activity = lastActivity.get(profile.id);
    return {
      ...profile,
      createdAtLabel: formatDate(profile.created_at),
      lastActivityLabel: activity ? formatDateTime(activity) : null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="المستخدمون"
        description="الدعوة والإيقاف وتغيير الأدوار. إيقاف مستخدم يمنعه من الدخول ولا يمسّ أي سجل أنشأه."
        actions={<CreateUserDialog />}
      />

      <UsersTable users={rows} currentUserId={currentUser.id} showActivity />
    </div>
  );
}
