import {
  PageHeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatGridSkeleton count={3} />
      <TableSkeleton rows={8} columns={10} caption="جاري تحميل المصاريف..." />
    </div>
  );
}
