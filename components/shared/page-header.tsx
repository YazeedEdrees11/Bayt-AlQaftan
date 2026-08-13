import { cn } from "@/lib/utils/cn";

/** Title / description block that opens every page, with optional actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        /*
         * `flex-wrap` is load-bearing at 320px. Without it a screen with two
         * actions — /inventory's «المخزون التالف» button beside its threshold
         * badge — pushes the second one 126px off the start edge and gives the
         * whole document a horizontal scrollbar. `shrink-0` keeps the actions
         * from being squeezed on wide screens; wrapping is what lets them stop
         * competing for a row that is not wide enough for both.
         */
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
