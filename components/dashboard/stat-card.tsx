import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/**
 * KPI tile.
 *
 * `value` is intentionally optional: until the business modules land there is
 * nothing real to show, and inventing a number would be worse than showing
 * none. When `value` is missing the tile says so plainly.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
  emptyLabel = "لا توجد بيانات بعد",
  className,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  icon: LucideIcon;
  accent?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow hover:shadow-[0_2px_4px_-2px_oklch(0_0_0/0.05),0_12px_28px_-16px_oklch(0_0_0/0.14)]",
        accent &&
          "from-primary to-primary/90 text-primary-foreground border-transparent bg-gradient-to-bl",
        className,
      )}
    >
      {accent ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -start-10 -bottom-16 size-40 rounded-full bg-white/10"
        />
      ) : null}

      <CardContent className="relative space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-sm font-medium",
              accent ? "text-primary-foreground/90" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              accent
                ? "bg-white/15 text-primary-foreground"
                : "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-[1.05rem]" strokeWidth={1.8} />
          </span>
        </div>

        <div className="space-y-1">
          {hasValue ? (
            <p
              data-numeric
              className="text-3xl font-semibold tracking-tight tabular-nums"
            >
              {value}
            </p>
          ) : (
            <p
              className={cn(
                "text-3xl font-semibold tracking-tight",
                accent ? "text-primary-foreground/45" : "text-muted-foreground/35",
              )}
              aria-hidden
            >
              —
            </p>
          )}
          <p
            className={cn(
              "text-xs leading-relaxed",
              accent ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {hasValue ? hint : emptyLabel}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
