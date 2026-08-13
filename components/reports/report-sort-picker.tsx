"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_SORTS, PRODUCT_SORT_LABELS, type ProductSort } from "@/types/reports";

/** Sort choice for the product reports, kept in the URL like every filter. */
export function ReportSortPicker({ sort }: { sort: ProductSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <Select
      value={sort}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("sort", value);
        params.delete("page");
        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
      }}
    >
      <SelectTrigger className="h-10 w-44" aria-label="ترتيب حسب">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRODUCT_SORTS.map((value) => (
          <SelectItem key={value} value={value}>
            {PRODUCT_SORT_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
