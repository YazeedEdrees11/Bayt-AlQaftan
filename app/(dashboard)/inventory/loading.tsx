import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={6} />
      <TableSkeleton rows={8} columns={8} caption="جاري تحميل المخزون..." />
    </div>
  );
}
