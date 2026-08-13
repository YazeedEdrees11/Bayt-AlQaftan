"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  generateNotificationsAction,
  markAllNotificationsReadAction,
} from "@/app/actions/settings";

/**
 * Refresh, filter and mark-all for the notification centre (§46).
 *
 * "Refresh" runs the generator on the server — the browser never invents a
 * notification, it only asks the server to look again.
 */
export function NotificationActions({ unread }: { unread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const unreadOnly = searchParams.get("unread") === "1";

  function toggleUnread() {
    const params = new URLSearchParams(searchParams.toString());
    if (unreadOnly) params.delete("unread");
    else params.set("unread", "1");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={unreadOnly ? "default" : "outline"} onClick={toggleUnread}>
        غير المقروءة
        {unread > 0 ? (
          <span className="bg-primary/15 text-primary ms-1 rounded-full px-1.5 text-xs tabular-nums">
            {unread}
          </span>
        ) : null}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await generateNotificationsAction();
            if (result.ok) {
              toast.success(
                result.data && result.data.created > 0
                  ? `${result.data.created} تنبيه جديد`
                  : "لا توجد تنبيهات جديدة",
              );
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        تحديث
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={pending || unread === 0}
        onClick={() =>
          startTransition(async () => {
            const result = await markAllNotificationsReadAction();
            if (result.ok) {
              toast.success("تم تعليم الكل كمقروء");
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        <CheckCheck className="size-4" />
        تعليم الكل
      </Button>
    </div>
  );
}
