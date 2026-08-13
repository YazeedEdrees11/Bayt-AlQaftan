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
import { DATE_PRESETS } from "@/lib/sales/date-range";

/**
 * Period selector for the management section of the dashboard.
 *
 * Custom ranges belong on the reports, where there is room for two date fields;
 * here the presets are enough and keep the header from growing a form.
 */
export function DashboardRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const options = DATE_PRESETS.filter((option) => option.value !== "custom");
  const value = searchParams.get("range") ?? "month";

  return (
    <Select
      value={options.some((option) => option.value === value) ? value : "month"}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("range", next);
        params.delete("from");
        params.delete("to");
        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
      }}
    >
      <SelectTrigger className="h-10 w-40" aria-label="فترة المؤشرات">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
