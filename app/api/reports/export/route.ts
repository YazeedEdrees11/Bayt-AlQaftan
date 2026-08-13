import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { hasPermission } from "@/lib/permissions/check-permission";
import { logAction } from "@/lib/audit/log-action";
import {
  EXPORT_CONTENT_TYPES,
  buildCsv,
  buildXlsx,
  contentDisposition,
} from "@/lib/reports/export";
import { buildReportExport, REPORT_EXPORTS } from "@/lib/reports/definitions";
import { buildExportFilename, type ExportFormat } from "@/types/reports";

export const dynamic = "force-dynamic";

/**
 * Report downloads.
 *
 * The route never accepts rows from the caller — it accepts a report name and
 * filters, re-runs the query server-side under the caller's own session, and
 * writes the result. That is what makes §64 hold: an export cannot contain
 * anything the user could not already see on screen, because RLS runs again on
 * the way out. Both the report's own permission and EXPORT_REPORTS are required.
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
  }

  const url = new URL(request.url);
  const report = url.searchParams.get("report") ?? "";
  const format = (url.searchParams.get("format") ?? "csv") as ExportFormat;

  const definition = REPORT_EXPORTS[report];
  if (!definition) {
    return NextResponse.json({ error: "تقرير غير معروف." }, { status: 404 });
  }
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "صيغة تصدير غير مدعومة." }, { status: 400 });
  }

  if (!hasPermission(profile, "EXPORT_REPORTS")) {
    return NextResponse.json(
      { error: "ليس لديك صلاحية لتصدير التقارير." },
      { status: 403 },
    );
  }
  if (!hasPermission(profile, definition.permission)) {
    return NextResponse.json(
      { error: "ليس لديك صلاحية لعرض هذا التقرير." },
      { status: 403 },
    );
  }

  const filters = Object.fromEntries(url.searchParams.entries());

  let payload;
  try {
    payload = await buildReportExport(report, filters);
  } catch (error) {
    console.error("[reports] export failed:", error);
    return NextResponse.json({ error: "تعذر تصدير البيانات." }, { status: 500 });
  }

  if (payload.rows.length === 0) {
    return NextResponse.json({ error: "لا توجد بيانات للتصدير." }, { status: 404 });
  }

  const filename = buildExportFilename(payload.title, format);

  // The audit records what was asked for, never the file itself (§82).
  await logAction({
    userId: profile.id,
    action: "REPORT_EXPORTED",
    entityType: "report",
    entityId: null,
    metadata: {
      report,
      format,
      title: payload.title,
      rows: payload.rows.length,
      from: payload.from ?? null,
      to: payload.to ?? null,
      filters: Object.fromEntries(
        Object.entries(filters).filter(([key]) => key !== "report" && key !== "format"),
      ),
    },
  });

  if (format === "csv") {
    return new NextResponse(buildCsv({ ...payload, report, format }), {
      headers: {
        "Content-Type": EXPORT_CONTENT_TYPES.csv,
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildXlsx({ ...payload, report, format });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": EXPORT_CONTENT_TYPES.xlsx,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}
