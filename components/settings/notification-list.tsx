"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { markNotificationReadAction } from "@/app/actions/settings";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { ALERT_LINKS } from "@/types/reports";
import type { AppNotification, NotificationSeverity } from "@/types/settings";

const SEVERITY = {
  CRITICAL: { icon: OctagonAlert, ring: "border-destructive/35 bg-destructive/5", text: "text-destructive" },
  WARNING: { icon: TriangleAlert, ring: "border-warning/35 bg-warning/5", text: "text-warning" },
  INFO: { icon: Info, ring: "border-border/70", text: "text-muted-foreground" },
} satisfies Record<NotificationSeverity, { icon: typeof Info; ring: string; text: string }>;

/** Where a notification sends you — the report that lists the rows behind it. */
function linkFor(notification: AppNotification): string | undefined {
  if (notification.reference_type === "cash_closing") return "/reports/daily-closing";
  return ALERT_LINKS[notification.notification_key];
}

export function NotificationList({
  title,
  notifications,
}: {
  title: string;
  notifications: AppNotification[];
}) {
  const [pending, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {title}
          <span className="text-muted-foreground ms-2 text-sm font-normal">
            ({notifications.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {notifications.map((notification) => {
          const style = SEVERITY[notification.severity] ?? SEVERITY.INFO;
          const Icon = style.icon;
          const href = linkFor(notification);

          return (
            <div
              key={notification.id}
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border p-3 transition-opacity",
                style.ring,
                notification.is_read && "opacity-60",
              )}
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.text)} />
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{notification.title}</span>
                    {notification.is_read ? null : (
                      <span className="bg-primary size-1.5 rounded-full" aria-label="غير مقروء" />
                    )}
                  </span>
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    {notification.message}
                  </span>
                  <span className="text-muted-foreground block text-[0.7rem]">
                    {formatDateTime(notification.created_at)}
                    {notification.threshold !== null
                      ? ` · الحد ${formatNumber(Number(notification.threshold))}`
                      : ""}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1">
                {notification.metric !== null ? (
                  <span className={cn("text-sm font-semibold tabular-nums", style.text)}>
                    {formatNumber(Number(notification.metric))}
                  </span>
                ) : null}

                {notification.is_read ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => markRead(notification.id)}
                    aria-label="تعليم كمقروء"
                  >
                    <Check className="size-4" />
                  </Button>
                )}

                {href ? (
                  <Button asChild variant="ghost" size="icon" aria-label="عرض التفاصيل">
                    <Link href={href}>
                      <ChevronLeft className="size-4" />
                    </Link>
                  </Button>
                ) : null}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
