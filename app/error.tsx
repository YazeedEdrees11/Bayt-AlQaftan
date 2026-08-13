"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shared/error-state";

/** Top-level error boundary. */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <ErrorState
        title="حدث خطأ غير متوقع."
        description="تعذر عرض هذه الصفحة. يرجى المحاولة مرة أخرى."
        onRetry={reset}
      />
    </div>
  );
}
