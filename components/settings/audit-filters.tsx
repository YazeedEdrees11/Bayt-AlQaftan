"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIT_ACTION_LABELS } from "@/types/settings";

/** Audit filters, kept in the URL so a filtered view can be sent to someone. */
export function AuditFilters({ actions }: { actions: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "ALL") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          className="h-10 w-48 pe-9"
          placeholder="ابحث…"
          aria-label="ابحث في السجل"
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(event) => setParam("q", event.target.value || null)}
        />
      </div>

      <Select
        value={searchParams.get("action") ?? "ALL"}
        onValueChange={(value) => setParam("action", value)}
      >
        <SelectTrigger className="h-10 w-44" aria-label="نوع العملية">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">كل العمليات</SelectItem>
          {actions.map((action) => (
            <SelectItem key={action} value={action}>
              {AUDIT_ACTION_LABELS[action] ?? action}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="h-10 w-40"
        aria-label="من تاريخ"
        defaultValue={searchParams.get("from") ?? ""}
        onChange={(event) => setParam("from", event.target.value || null)}
      />
      <Input
        type="date"
        className="h-10 w-40"
        aria-label="إلى تاريخ"
        defaultValue={searchParams.get("to") ?? ""}
        onChange={(event) => setParam("to", event.target.value || null)}
      />
    </div>
  );
}
