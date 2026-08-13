import "server-only";

import ExcelJS from "exceljs";

import { formatDateTime } from "@/lib/utils/format";
import type { ExportColumn, ExportRequest } from "@/types/reports";

/**
 * Report exports.
 *
 * Two formats are produced here — CSV and Excel. PDF is deliberately not
 * generated server-side: Node PDF libraries do not perform Arabic letter
 * joining, so an Arabic PDF built that way comes out as disconnected
 * letterforms. The print view renders the same report in the browser, which
 * shapes Arabic correctly, and the browser's "save as PDF" produces a proper
 * document with page numbers via `@page`. Correct text beats a native writer.
 */

/** Excel and most Windows tools need a BOM before they believe a CSV is UTF-8. */
const UTF8_BOM = "﻿";

function formatCell(value: unknown, kind: ExportColumn["kind"]): string {
  if (value === null || value === undefined || value === "") return "";
  switch (kind) {
    case "money":
    case "number":
      return String(Number(value));
    case "percent":
      return `${Number(value)}`;
    case "date":
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

/** RFC 4180 quoting: double the quotes, wrap anything with a separator. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(request: ExportRequest): string {
  const { columns, rows, title, from, to } = request;

  const meta: string[] = [
    csvEscape(`بيت القفطان — ${title}`),
    csvEscape(
      from || to
        ? `الفترة: ${from ?? "البداية"} إلى ${to ?? "اليوم"}`
        : "الفترة: كل الفترات",
    ),
    // Was `toISOString()`, which is UTC by definition — so the CSV and the
    // Excel file for the same report were stamped hours apart. Both go through
    // the store's timezone now.
    csvEscape(`تم الإنشاء: ${formatDateTime(new Date())}`),
    "",
  ];

  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => csvEscape(formatCell(row[c.key], c.kind))).join(","),
  );

  return UTF8_BOM + [...meta, header, ...body].join("\r\n");
}

export async function buildXlsx(request: ExportRequest): Promise<Buffer> {
  const { columns, rows, title, from, to, filters } = request;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "بيت القفطان";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.slice(0, 30) || "تقرير", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }],
  });

  sheet.mergeCells(1, 1, 1, Math.max(columns.length, 1));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `بيت القفطان — ${title}`;
  titleCell.font = { size: 14, bold: true };
  titleCell.alignment = { horizontal: "right" };

  sheet.getCell(2, 1).value =
    from || to ? `الفترة: ${from ?? "البداية"} إلى ${to ?? "اليوم"}` : "الفترة: كل الفترات";
  // Through the shared formatter, which pins the store's timezone. Bare
  // `toLocaleString` reads the *server's* clock: on a UTC host a report pulled
  // at 1am in Riyadh would be stamped the previous day, and the header would
  // contradict the rows underneath it.
  sheet.getCell(3, 1).value = `تم الإنشاء: ${formatDateTime(new Date())}`;

  const activeFilters = Object.entries(filters ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  sheet.getCell(4, 1).value = activeFilters ? `المرشّحات: ${activeFilters}` : "";

  const headerRow = sheet.getRow(5);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    };
    sheet.getColumn(index + 1).width = column.width ?? 18;
  });
  headerRow.commit();

  for (const row of rows) {
    const values = columns.map((column) => {
      const raw = row[column.key];
      if (raw === null || raw === undefined || raw === "") return "";
      if (column.kind === "money" || column.kind === "number" || column.kind === "percent") {
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? numeric : String(raw);
      }
      return String(raw);
    });
    const added = sheet.addRow(values);
    columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      if (column.kind === "money") cell.numFmt = "#,##0.00";
      if (column.kind === "number") cell.numFmt = "#,##0";
      if (column.kind === "percent") cell.numFmt = '0.00"%"';
      cell.alignment = {
        horizontal:
          column.kind && column.kind !== "text" && column.kind !== "date" ? "left" : "right",
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const EXPORT_CONTENT_TYPES: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * A Content-Disposition value that survives an Arabic filename.
 *
 * A raw Arabic name in the plain `filename` parameter is not a valid HTTP
 * header token, so an ASCII fallback carries the plain field and RFC 5987
 * `filename*` carries the real one for browsers that support it — which all
 * current ones do.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
