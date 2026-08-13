"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Reusable failure block with an optional retry handler. */
export function ErrorState({
  title = "حدث خطأ غير متوقع.",
  description = "تعذر تحميل البيانات. يرجى المحاولة مرة أخرى.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 text-center",
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl">
        <TriangleAlert className="size-6" strokeWidth={1.6} />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium">{title}</p>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          {description}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          <RefreshCw className="size-4" />
          المحاولة مرة أخرى
        </Button>
      ) : null}
    </div>
  );
}
