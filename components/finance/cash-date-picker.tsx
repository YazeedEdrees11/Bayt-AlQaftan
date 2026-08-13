"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Day picker for the cash drawer view — a single date, not a range. */
export function CashDatePicker({ date }: { date: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <Label htmlFor="cash_date" className="text-xs">
        التاريخ
      </Label>
      <Input
        id="cash_date"
        type="date"
        className="h-10"
        defaultValue={date}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set("date", event.target.value);
          else params.delete("date");
          startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
          });
        }}
      />
    </div>
  );
}
