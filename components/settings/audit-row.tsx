"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { AUDIT_ACTION_LABELS, type AuditLogRow } from "@/types/settings";

/**
 * One audit entry, expandable to show what changed (§50).
 *
 * `old_value` and `new_value` are shown side by side when the entry carries
 * them — a settings change without its before-and-after is a note that
 * something happened, which is not the same as a record.
 */
export function AuditRow({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const metadata = row.metadata ?? {};
  const hasDetail = Object.keys(metadata).length > 0;

  const oldValue = metadata.old_value;
  const newValue = metadata.new_value;
  const hasChange = oldValue !== undefined || newValue !== undefined;

  return (
    <>
      <TableRow
        className={cn(hasDetail && "cursor-pointer")}
        onClick={() => hasDetail && setOpen((value) => !value)}
      >
        <TableCell className="w-10">
          {hasDetail ? (
            <ChevronDown
              aria-hidden
              className={cn(
                "text-muted-foreground size-4 transition-transform",
                open && "rotate-180",
              )}
            />
          ) : null}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDateTime(row.created_at)}
        </TableCell>
        <TableCell className="text-sm font-medium">
          {row.user_name ?? "—"}
        </TableCell>
        <TableCell>
          <Badge variant="outline">
            {AUDIT_ACTION_LABELS[row.action] ?? row.action}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {row.entity_type}
        </TableCell>
        <TableCell className="text-sm">{summarize(row)}</TableCell>
      </TableRow>

      {open && hasDetail ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="space-y-3 p-2">
              {hasChange ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <ValueBlock title="القيمة السابقة" value={oldValue} tone="old" />
                  <ValueBlock title="القيمة الجديدة" value={newValue} tone="new" />
                </div>
              ) : null}

              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer">
                  التفاصيل الكاملة
                </summary>
                <pre
                  dir="ltr"
                  className="bg-card border-border/70 mt-2 overflow-x-auto rounded-lg border p-3 text-start"
                >
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </details>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function ValueBlock({
  title,
  value,
  tone,
}: {
  title: string;
  value: unknown;
  tone: "old" | "new";
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-xl border p-3",
        tone === "old"
          ? "border-destructive/30 bg-destructive/5"
          : "border-success/30 bg-success/5",
      )}
    >
      <p className="text-muted-foreground text-xs">{title}</p>
      <pre dir="auto" className="text-sm break-words whitespace-pre-wrap">
        {format(value)}
      </pre>
    </div>
  );
}

function format(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "boolean") return value ? "مفعّل" : "معطّل";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/** A one-line description of the entry, from whatever the metadata carries. */
function summarize(row: AuditLogRow): string {
  const metadata = row.metadata ?? {};
  if (typeof metadata.key === "string") return metadata.key;
  if (typeof metadata.permission === "string") {
    return `${metadata.role ?? ""} · ${metadata.permission}`;
  }
  if (typeof metadata.report === "string") return String(metadata.report);
  if (typeof metadata.reason === "string") return String(metadata.reason);
  if (row.entity_id) return row.entity_id.slice(0, 8);
  return "—";
}
