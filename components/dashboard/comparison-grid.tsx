import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import {
  COMPARISON_LABELS,
  isFavourable,
  trendOf,
  type ComparisonRow,
} from "@/types/reports";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/** Metrics that are counts, not money. */
const COUNT_METRICS = new Set(["orders", "returned_units"]);

/**
 * This period against the one before it (§57).
 *
 * The colour follows whether the movement is good news, not whether the number
 * went up — rising expenses and rising returns are red even though the arrow
 * points up. When the previous period was zero the percentage is omitted
 * entirely rather than shown as an infinite jump (§49, §95).
 */
export function ComparisonGrid({ rows }: { rows: ComparisonRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        لا توجد بيانات للمقارنة.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => {
        const direction = trendOf(row.change_value);
        const good = isFavourable(row.metric, direction);
        const Icon =
          direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
        const format = COUNT_METRICS.has(row.metric) ? formatNumber : formatMoney;

        return (
          <div
            key={row.metric}
            className="border-border/70 space-y-1.5 rounded-xl border p-3"
          >
            <p className="text-muted-foreground text-xs">
              {COMPARISON_LABELS[row.metric]}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {format(row.current_value)}
            </p>
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium",
                  direction === "flat"
                    ? "text-muted-foreground"
                    : good
                      ? "text-success"
                      : "text-destructive",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {row.change_percent === null
                  ? "بلا مقارنة"
                  : formatPercent(Math.abs(Number(row.change_percent)))}
              </span>
              <span className="text-muted-foreground">
                مقابل {format(row.previous_value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
