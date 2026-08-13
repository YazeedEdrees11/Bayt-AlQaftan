"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, LoaderCircle, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_PRESETS } from "@/lib/sales/date-range";

/**
 * The filter and export bar every report shares.
 *
 * Filters live in the URL (§66, §67) rather than in component state, so a
 * report can be bookmarked, refreshed or sent to someone else and come back
 * showing the same thing. The export links carry the same parameters, so a
 * download is always of what is on screen.
 */
export function ReportToolbar({
  exportReport,
  canExport = false,
  showRange = true,
  defaultPreset = "month",
  children,
}: {
  /** Registry key in `REPORT_EXPORTS`; omit for reports that cannot be exported. */
  exportReport?: string;
  canExport?: boolean;
  showRange?: boolean;
  defaultPreset?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);

  const preset = searchParams.get("range") ?? defaultPreset;

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  async function download(format: "csv" | "xlsx") {
    if (!exportReport) return;
    setDownloading(format);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set("report", exportReport);
      params.set("format", format);

      const response = await fetch(`/api/reports/export?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        toast.error(body.error ?? "تعذر تصدير البيانات.");
        return;
      }

      // The server names the file; honouring it keeps the Arabic name.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const filename = encoded
        ? decodeURIComponent(encoded)
        : `report.${format}`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير التقرير");
    } catch (error) {
      console.error("[reports] export failed:", error);
      toast.error("تعذر تصدير البيانات.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div data-print="hide" className="flex flex-wrap items-end gap-2">
      {showRange ? (
        <>
          <Select value={preset} onValueChange={(value) => setParams({ range: value })}>
            <SelectTrigger className="h-10 w-40" aria-label="الفترة">
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
                <Label htmlFor="report_from" className="text-xs">
                  من
                </Label>
                <Input
                  id="report_from"
                  type="date"
                  className="h-10"
                  defaultValue={searchParams.get("from") ?? ""}
                  onChange={(event) => setParams({ from: event.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="report_to" className="text-xs">
                  إلى
                </Label>
                <Input
                  id="report_to"
                  type="date"
                  className="h-10"
                  defaultValue={searchParams.get("to") ?? ""}
                  onChange={(event) => setParams({ to: event.target.value || null })}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {children}

      {exportReport && canExport ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => download("csv")}
            disabled={downloading !== null}
          >
            {downloading === "csv" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => download("xlsx")}
            disabled={downloading !== null}
          >
            {downloading === "xlsx" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            Excel
          </Button>
        </>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-10"
        onClick={() => window.print()}
      >
        <Printer className="size-4" />
        طباعة
      </Button>
    </div>
  );
}
