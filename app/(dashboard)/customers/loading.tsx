import {
  PageHeaderSkeleton,
  TableSkeleton,
} from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={8} caption="جاري تحميل العملاء..." />
    </div>
  );
}
