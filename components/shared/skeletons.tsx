import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

/** Title + description placeholder used at the top of every page skeleton. */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** Grid of KPI tiles. */
export function StatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-9 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Table placeholder with a caption row and `rows` body rows. */
export function TableSkeleton({
  rows = 5,
  columns = 6,
  caption,
}: {
  rows?: number;
  columns?: number;
  caption?: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-40" />
        {caption ? (
          <p className="text-muted-foreground text-sm">{caption}</p>
        ) : (
          <Skeleton className="h-4 w-64 max-w-full" />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border-border/70 flex gap-4 border-b pb-3">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 py-2">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton key={columnIndex} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Generic page skeleton: header plus a large content block. */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <Skeleton className="size-16 rounded-2xl" />
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
