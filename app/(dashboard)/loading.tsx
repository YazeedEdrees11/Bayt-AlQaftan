import { PageSkeleton } from "@/components/shared/skeletons";

/** Fallback loading UI for any dashboard route without its own skeleton. */
export default function Loading() {
  return <PageSkeleton />;
}
