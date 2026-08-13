import { cn } from "@/lib/utils/cn";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants";

/**
 * The بيت القفطان mark: a pointed arch — the doorway of the "house" — holding
 * a stylised kaftan silhouette. Drawn inline so it inherits the palette.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary text-primary-foreground ring-primary/15 inline-flex items-center justify-center rounded-xl shadow-sm ring-4",
        "size-10",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-[66%]"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* the house: an outer pointed arch */}
        <path
          d="M4 21.2V13c0-4 3.2-7.6 8-10.2 4.8 2.6 8 6.2 8 10.2v8.2"
          stroke="currentColor"
          strokeWidth="1.8"
          opacity="0.6"
        />
        {/* the doorway: a smaller pointed arch, filled */}
        <path
          d="M8.6 21.2v-5.9c0-2 1.4-3.9 3.4-5.2 2 1.3 3.4 3.2 3.4 5.2v5.9Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

/** Full lockup: mark + Arabic name + subtitle. */
export function Logo({
  className,
  showSubtitle = true,
  size = "md",
}: {
  className?: string;
  showSubtitle?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const markSize =
    size === "lg" ? "size-12" : size === "sm" ? "size-9" : "size-10";
  const titleSize =
    size === "lg" ? "text-xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <span className={cn("flex items-center gap-3", className)}>
      <LogoMark className={markSize} />
      <span className="flex flex-col leading-tight">
        <span className={cn("font-semibold tracking-tight", titleSize)}>
          {APP_NAME}
        </span>
        {showSubtitle ? (
          <span className="text-muted-foreground text-[0.7rem] font-medium">
            {APP_SUBTITLE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
