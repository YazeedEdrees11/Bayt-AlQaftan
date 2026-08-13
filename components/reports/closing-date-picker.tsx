"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";

/**
 * Day picker for the daily closing report.
 *
 * Capped at today: there is no closing to read for a day that has not happened,
 * and offering one would only produce an empty screen that looks like a bug.
 */
export function ClosingDatePicker({ date, max }: { date: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <Input
      type="date"
      aria-label="تاريخ الإغلاق"
      className="h-10 w-44"
      defaultValue={date}
      max={max}
      onChange={(event) => {
        const value = event.target.value;
        if (!value) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("date", value);
        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        });
      }}
    />
  );
}
