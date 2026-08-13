import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, Info, OctagonAlert } from "lucide-react";

import { ALERT_LINKS, ALERT_TITLES, type ManagementAlert } from "@/types/reports";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const SEVERITY_STYLE = {
  CRITICAL: {
    icon: OctagonAlert,
    ring: "border-destructive/35 bg-destructive/5",
    text: "text-destructive",
  },
  WARNING: {
    icon: AlertTriangle,
    ring: "border-warning/35 bg-warning/5",
    text: "text-warning",
  },
  INFO: {
    icon: Info,
    ring: "border-border/70",
    text: "text-muted-foreground",
  },
} as const;

/**
 * Business alerts (§58, §112).
 *
 * Every alert comes from a threshold stored in report settings and a figure
 * counted from the records — none is hard-coded here, and none is raised on a
 * guess. Each row links to the report that lists the rows behind the number, so
 * an alert is never a dead end.
 */
export function ManagementAlerts({ alerts }: { alerts: ManagementAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="text-success size-6" strokeWidth={1.7} />
        <p className="text-sm">لا توجد تنبيهات. كل المؤشرات ضمن الحدود المحددة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.INFO;
        const Icon = style.icon;
        const href = ALERT_LINKS[alert.alert_key];
        const title = ALERT_TITLES[alert.alert_key] ?? alert.alert_key;

        const body = (
          <>
            <span className="flex min-w-0 items-start gap-2.5">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.text)} />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{title}</span>
                <span className="text-muted-foreground block text-xs leading-relaxed">
                  {alert.detail}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className={cn("text-sm font-semibold tabular-nums", style.text)}>
                {formatNumber(alert.metric)}
              </span>
              {href ? (
                <ChevronLeft aria-hidden className="text-muted-foreground size-4" />
              ) : null}
            </span>
          </>
        );

        const className = cn(
          "flex items-center justify-between gap-3 rounded-xl border p-3",
          style.ring,
          href && "hover:border-primary/40 transition-colors",
        );

        return href ? (
          <Link key={alert.alert_key} href={href} className={className}>
            {body}
          </Link>
        ) : (
          <div key={alert.alert_key} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
