import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Product thumbnail with a graceful fallback.
 *
 * Sources are short-lived signed URLs from the private bucket, so plain <img>
 * is used rather than next/image — the optimizer would cache a URL that
 * expires within the hour.
 */
export function ProductThumb({
  url,
  alt,
  className,
  rounded = "rounded-lg",
}: {
  url: string | null;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  if (!url) {
    return (
      <span
        className={cn(
          "bg-muted text-muted-foreground/60 flex shrink-0 items-center justify-center",
          rounded,
          className ?? "size-11",
        )}
        aria-hidden
      >
        <ImageIcon className="size-1/2" strokeWidth={1.5} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn(
        "bg-muted shrink-0 object-cover",
        rounded,
        className ?? "size-11",
      )}
    />
  );
}
