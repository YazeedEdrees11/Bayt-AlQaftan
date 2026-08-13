import type { Metadata } from "next";
import Link from "next/link";
import { BellOff, Settings2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { NotificationList } from "@/components/settings/notification-list";
import { NotificationActions } from "@/components/settings/notification-actions";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listNotifications } from "@/lib/settings/queries";
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/types/settings";

export const metadata: Metadata = { title: "التنبيهات" };

const ORDER: NotificationType[] = [
  "INVENTORY",
  "FINANCE",
  "CUSTOMER",
  "SUPPLIER",
  "SYSTEM",
];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; unread?: string }>;
}) {
  const { profile } = await requirePermission("VIEW_NOTIFICATIONS");
  const params = await searchParams;

  const type = ORDER.includes(params.type as NotificationType)
    ? (params.type as NotificationType)
    : undefined;

  const notifications = await listNotifications({
    type,
    unreadOnly: params.unread === "1",
  });

  const grouped = ORDER.map((group) => ({
    type: group,
    label: NOTIFICATION_TYPE_LABELS[group],
    items: notifications.filter((item) => item.type === group),
  })).filter((group) => group.items.length > 0);

  const unread = notifications.filter((item) => !item.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="التنبيهات"
        description="تنبيهات تُولَّد على الخادم من نفس القواعد التي تقرأها التقارير. لا شيء منها يُنشأ في المتصفح."
        actions={
          <>
            {hasPermission(profile, "MANAGE_SETTINGS") ? (
              <Button asChild variant="ghost">
                <Link href="/settings/notifications">
                  <Settings2 className="size-4" />
                  الإعدادات
                </Link>
              </Button>
            ) : null}
            <NotificationActions unread={unread} />
          </>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="لا توجد تنبيهات"
          description={
            params.unread === "1"
              ? "لا توجد تنبيهات غير مقروءة."
              : "كل المؤشرات ضمن الحدود المحددة في الإعدادات."
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <NotificationList
              key={group.type}
              title={group.label}
              notifications={group.items}
            />
          ))}
        </div>
      )}
    </div>
  );
}
