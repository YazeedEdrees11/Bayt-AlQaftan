import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type SeriesPoint = {
  label: string;
  gross: number;
  returns: number;
  net: number;
};

/**
 * The time series on the sales and profit reports.
 *
 * Deliberately plain markup rather than a charting library: this has to survive
 * `window.print()` intact, and a server-rendered bar made of two divs prints the
 * same as it renders. It also carries no client JavaScript, so a report with 90
 * buckets costs nothing on the wire.
 */
export function SeriesBars({
  points,
  emptyLabel = "لا توجد بيانات ضمن الفترة المحددة.",
}: {
  points: SeriesPoint[];
  emptyLabel?: string;
}) {
  if (points.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{emptyLabel}</p>
    );
  }

  // Scale against the largest gross so the tallest bar is always full height;
  // a zero-everywhere period must not divide by zero.
  const peak = Math.max(...points.map((p) => Math.abs(p.gross)), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 overflow-x-auto pb-2" dir="rtl">
        {points.map((point) => {
          const grossHeight = (Math.abs(point.gross) / peak) * 100;
          const netHeight = (Math.max(0, point.net) / peak) * 100;
          return (
            <div
              key={point.label}
              className="group flex min-w-10 flex-1 flex-col items-center gap-1.5"
              title={`${point.label} — صافي ${formatMoney(point.net)}`}
            >
              <div className="flex h-40 w-full items-end justify-center">
                <div
                  className="bg-primary/15 relative flex w-full max-w-12 items-end justify-center rounded-t-md"
                  style={{ height: `${Math.max(grossHeight, 1.5)}%` }}
                >
                  <div
                    className="bg-primary w-full rounded-t-md"
                    style={{ height: `${grossHeight > 0 ? (netHeight / grossHeight) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className="text-muted-foreground max-w-full truncate text-[10px]">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <Legend className="bg-primary" label="الصافي" />
        <Legend className="bg-primary/15" label="الفرق: الخصم والمرتجعات" />
        <span>أعلى فترة: {formatMoney(peak)}</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
