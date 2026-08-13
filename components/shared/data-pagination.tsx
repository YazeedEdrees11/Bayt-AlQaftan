"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/lib/catalog/config";
import { formatNumber } from "@/lib/utils/format";

/**
 * Pagination bar shared by every list screen.
 *
 * In RTL "previous" points right and "next" points left, so the chevrons are
 * mirrored relative to an LTR layout.
 */
export function DataPagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  disabled?: boolean;
}) {
  if (total === 0) return null;

  return (
    <div className="border-border/70 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground flex items-center gap-3 text-sm">
        <span>
          صفحة {formatNumber(page)} من {formatNumber(totalPages)}
        </span>
        <span aria-hidden>·</span>
        <span>{formatNumber(total)} سجل</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">لكل صفحة</span>
          <Select
            value={String(perPage)}
            onValueChange={(value) => onPerPageChange(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronRight className="size-4" />
            السابق
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
