"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/shared/error-state";
import { Card, CardContent } from "@/components/ui/card";

/** Error boundary for the authenticated area — keeps the shell visible. */
export default function DashboardError({
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
    <Card className="border-dashed">
      <CardContent className="py-6">
        <ErrorState
          title="تعذر تحميل البيانات."
          description="حدث خطأ أثناء تحميل هذه الصفحة. يرجى المحاولة مرة أخرى."
          onRetry={reset}
        />
      </CardContent>
    </Card>
  );
}
