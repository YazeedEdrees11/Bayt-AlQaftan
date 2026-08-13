"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DATE_PRESETS } from "@/lib/sales/date-range";

/**
 * The period control shared by every finance screen.
 *
 * Only period figures move with it. Account balances, receivables and payables
 * are what is true right now, so they deliberately ignore whatever is selected
 * here — see the note on the overview page.
 */
export function FinanceRangePicker({ defaultPreset = "month" }: { defaultPreset?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const preset = searchParams.get("range") ?? defaultPreset;

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select value={preset} onValueChange={(value) => setParams({ range: value })}>
        <SelectTrigger className="h-10 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="finance_from" className="text-xs">
              من
            </Label>
            <Input
              id="finance_from"
              type="date"
              className="h-10"
              defaultValue={searchParams.get("from") ?? ""}
              onChange={(event) => setParams({ from: event.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finance_to" className="text-xs">
              إلى
            </Label>
            <Input
              id="finance_to"
              type="date"
              className="h-10"
              defaultValue={searchParams.get("to") ?? ""}
              onChange={(event) => setParams({ to: event.target.value || null })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
