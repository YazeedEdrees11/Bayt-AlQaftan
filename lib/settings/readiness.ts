import "server-only";

import { createClient } from "@/lib/supabase/server";
import { inspectEnv } from "@/lib/env";
import { checkSystemHealth } from "./health";
import { getAppConfig } from "./queries";
import type {
  IntegrityCheck,
  ReadinessArea,
  ReconciliationLine,
} from "@/types/settings";

/**
 * Production readiness (§155, §156).
 *
 * Seven areas, each PASS / WARNING / FAIL, and one overall verdict. The rule
 * that makes the verdict worth anything is §156: a single FAIL in a critical
 * area means NOT READY, with no way to average it away with six passes. A
 * readiness page that can be talked into saying READY is a page nobody should
 * believe.
 *
 * Two of the seven cannot be answered from inside the application, and are
 * reported as WARNING rather than invented:
 *
 *   Backups — Supabase runs them on its own schedule; nothing in this codebase
 *   configures or observes that. `app_config.last_backup_at` is a field the
 *   operator fills in after checking, not a measurement.
 *
 *   Monitoring — there is no error-tracking service wired in. Saying otherwise
 *   would be exactly the kind of claim §158 forbids.
 */
export async function assessReadiness(): Promise<{
  areas: ReadinessArea[];
  ready: boolean;
  checkedAt: string;
}> {
  const supabase = await createClient();

  const [health, config, integrityResult, eventsResult] = await Promise.all([
    checkSystemHealth(),
    getAppConfig(),
    supabase.rpc("integrity_checks"),
    supabase.rpc("system_event_summary", { p_hours: 24 }),
  ]);
  const events = (eventsResult.data ?? []) as {
    severity: string; event_count: number;
  }[];
  const recentErrors = events
    .filter((e) => e.severity === "ERROR")
    .reduce((sum, e) => sum + Number(e.event_count), 0);

  const checks = (integrityResult.data ?? []) as IntegrityCheck[];
  const env = inspectEnv();

  const areas: ReadinessArea[] = [];

  /* ------------------------------------------------------------- security */
  const secretsInBundle = env.warnings.length;
  areas.push({
    key: "security",
    label: "الأمان",
    critical: true,
    status: secretsInBundle > 0 ? "FAIL" : env.ok ? "PASS" : "FAIL",
    detail:
      secretsInBundle > 0
        ? `${secretsInBundle} متغير باسم يوحي بسر ومعرّض للمتصفح`
        : env.ok
          ? "لا أسرار معرّضة، ومتغيرات البيئة المطلوبة موجودة"
          : `متغيرات مفقودة: ${env.missing.join("، ")}`,
  });

  /* ------------------------------------------------------------- database */
  const database = health.checks.find((c) => c.key === "database");
  areas.push({
    key: "database",
    label: "قاعدة البيانات",
    critical: true,
    status: database?.state === "healthy" ? "PASS" : "FAIL",
    detail: database?.detail ?? "لم يتم الفحص",
  });

  /* ------------------------------------------------------------ integrity */
  const critical = checks.filter((c) => c.severity === "CRITICAL");
  const warnings = checks.filter((c) => c.severity === "WARNING");
  areas.push({
    key: "integrity",
    label: "سلامة البيانات",
    critical: true,
    status: critical.length > 0 ? "FAIL" : warnings.length > 0 ? "WARNING" : "PASS",
    detail:
      critical.length > 0
        ? `${critical.length} مشكلة حرجة: ${critical.map((c) => c.title).join("، ")}`
        : warnings.length > 0
          ? `${warnings.length} تحذير يستحق المراجعة`
          : `${checks.length} فحصاً بلا مشاكل`,
  });

  /* ---------------------------------------------------------- performance */
  // The one thing measurable from here: whether the diagnostics themselves
  // answered. A real load profile lives in the load test, not on a page.
  areas.push({
    key: "performance",
    label: "الأداء",
    critical: false,
    status: checks.length > 0 ? "PASS" : "WARNING",
    detail:
      checks.length > 0
        ? "الفحوصات والتقارير تستجيب"
        : "تعذر تشغيل الفحوصات — راجع سجل الخادم",
  });

  /* -------------------------------------------------------- configuration */
  const storage = health.checks.find((c) => c.key === "storage");
  const timezone = health.checks.find((c) => c.key === "timezone");
  const configIssues = [
    storage?.state !== "healthy" ? "التخزين لا يستجيب" : null,
    timezone?.state !== "healthy" ? "المنطقة الزمنية المعروضة تخالف الإعدادات" : null,
    !config?.app_version ? "إصدار التطبيق غير مسجّل" : null,
  ].filter(Boolean) as string[];
  areas.push({
    key: "configuration",
    label: "الإعدادات",
    critical: false,
    status: configIssues.length > 0 ? "WARNING" : "PASS",
    detail:
      configIssues.length > 0
        ? configIssues.join("، ")
        : `الإصدار ${config?.app_version}، والتخزين والمنطقة الزمنية سليمان`,
  });

  /* --------------------------------------------------------------- backup */
  const lastBackup = config?.last_backup_at ? new Date(config.last_backup_at) : null;
  const ageHours = lastBackup
    ? (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60)
    : null;
  const restoreTested = Boolean(config?.last_restore_test_at);

  // A backup nobody has restored is a belief, so the area cannot pass on the
  // strength of a recent check alone (§68). Recent check + tested restore is
  // the only combination that earns a PASS.
  areas.push({
    key: "backup",
    label: "النسخ الاحتياطي",
    critical: true,
    status:
      ageHours === null ? "FAIL"
      : ageHours > 48 ? "FAIL"
      : restoreTested ? "PASS"
      : "WARNING",
    detail:
      ageHours === null
        ? "لم يُسجَّل أي تحقق. سجّله من شاشة النظام بعد مراجعة النسخ في Supabase."
        : ageHours > 48
          ? `آخر تحقق قبل ${Math.round(ageHours)} ساعة — أقدم من الحد المقبول`
          : restoreTested
            ? `تحقق قبل ${Math.round(ageHours)} ساعة، والاستعادة مختبرة في ` +
              `${new Date(config!.last_restore_test_at!).toISOString().slice(0, 10)}`
            : `تحقق قبل ${Math.round(ageHours)} ساعة، لكن الاستعادة لم تُختبر بعد — ` +
              `شغّل scripts/verify-restore.mjs على نسخة مستعادة`,
  });

  /* ----------------------------------------------------------- monitoring */
  // The application can now see its own errors, which is what "monitoring"
  // meant in the warning it used to carry. What is still absent is anything
  // that watches from outside — and that stays a warning, because a system
  // that can only observe itself cannot report that it is down.
  areas.push({
    key: "monitoring",
    label: "المراقبة",
    critical: false,
    status: recentErrors > 20 ? "FAIL" : recentErrors > 0 ? "WARNING" : "PASS",
    detail:
      recentErrors > 0
        ? `${recentErrors} خطأ خلال ٢٤ ساعة — راجع الأحداث في شاشة النظام`
        : "لا أخطاء خلال ٢٤ ساعة. المراقبة الخارجية تتم عبر /api/health، " +
          "ولا توجد خدمة تتبّع أخطاء خارجية مربوطة.",
  });

  // §156: one critical failure is enough. No averaging.
  const ready = !areas.some((a) => a.critical && a.status === "FAIL");

  return { areas, ready, checkedAt: new Date().toISOString() };
}

export async function getIntegrityChecks(): Promise<IntegrityCheck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("integrity_checks");
  if (error) {
    console.error("[integrity] checks failed:", error.message);
    throw new Error("تعذر تشغيل فحوصات السلامة.");
  }
  return (data ?? []) as IntegrityCheck[];
}

export async function getReconciliation(): Promise<ReconciliationLine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reconciliation_summary");
  if (error) {
    console.error("[integrity] reconciliation failed:", error.message);
    return [];
  }
  return (data ?? []) as ReconciliationLine[];
}
