import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Reusable "nothing here yet" block. Used by the dashboard cards today and by
 * every future list screen.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = "لا توجد بيانات",
  description = "لم تتم إضافة أي بيانات حتى الآن.",
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-8" : "gap-3 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center rounded-2xl",
          compact ? "size-10" : "size-14",
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} strokeWidth={1.6} />
      </span>
      <div className="space-y-1">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
          {title}
        </p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
