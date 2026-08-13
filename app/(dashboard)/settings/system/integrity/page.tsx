import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, OctagonAlert, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuth, ACCESS_DENIED_ROUTE } from "@/lib/auth/require-auth";
import { isAdmin } from "@/lib/permissions/check-permission";
import { getIntegrityChecks, getReconciliation } from "@/lib/settings/readiness";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { redirect } from "next/navigation";
import type { IntegrityCheck } from "@/types/settings";

export const metadata: Metadata = { title: "سلامة البيانات" };

const STYLE = {
  CRITICAL: { icon: OctagonAlert, cls: "border-destructive/40 bg-destructive/5", text: "text-destructive", label: "حرج" },
  WARNING: { icon: TriangleAlert, cls: "border-warning/40 bg-warning/5", text: "text-warning", label: "تحذير" },
  OK: { icon: CheckCircle2, cls: "border-border/70", text: "text-success", label: "سليم" },
} as const;

export default async function IntegrityPage() {
  const { profile } = await requireAuth();
  // §72: administrator only, and checked here rather than by hiding the link.
  if (!isAdmin(profile)) redirect(ACCESS_DENIED_ROUTE);

  const [checks, reconciliation] = await Promise.all([
    getIntegrityChecks(),
    getReconciliation(),
  ]);

  const critical = checks.filter((c) => c.severity === "CRITICAL");
  const warnings = checks.filter((c) => c.severity === "WARNING");
  const healthy = checks.filter((c) => c.severity === "OK");

  return (
    <div className="space-y-6">
      <PageHeader
        title="سلامة البيانات"
        description="فحوصات تشخيصية للقراءة فقط. لا تعدّل أي سجل — أي تصحيح يبقى قراراً صريحاً يُسجَّل في سجل النشاط."
        actions={
          <Button asChild variant="ghost">
            <Link href="/settings/system">
              <ChevronLeft className="size-4 rotate-180" />
              النظام
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="حرج" count={critical.length} tone="CRITICAL" />
        <Summary label="تحذير" count={warnings.length} tone="WARNING" />
        <Summary label="سليم" count={healthy.length} tone="OK" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الفحوصات</CardTitle>
          <CardDescription>
            معظم هذه الفحوصات حراسة على البنية: القيود والمفاتيح الأجنبية تمنع
            أصلاً ما تبحث عنه، وقيمتها أن تنبّه إن تغيّر تعريف يوماً ما.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {[...critical, ...warnings, ...healthy].map((check) => (
            <CheckRow key={check.check_key} check={check} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المطابقة المالية</CardTitle>
          <CardDescription>
            الأرقام التي يراجعها المالك بنفسه. تُقرأ من نفس المصادر التي تقرأها
            التقارير، لا من حساب ثانٍ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {reconciliation.map((line) => (
            <div
              key={line.label}
              className="border-border/70 flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <span className="text-sm">{line.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(line.amount)}
                </span>
                {line.reference ? (
                  <Button asChild variant="ghost" size="icon" aria-label="عرض">
                    <Link href={line.reference}>
                      <ChevronLeft className="size-4" />
                    </Link>
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        آخر تشغيل: {formatDateTime(new Date().toISOString())}
      </p>
    </div>
  );
}

function Summary({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: keyof typeof STYLE;
}) {
  const style = STYLE[tone];
  const Icon = style.icon;
  return (
    <Card className={cn(count > 0 && tone !== "OK" ? style.cls : "")}>
      <CardContent className="flex items-center justify-between gap-3 py-5">
        <span className="flex items-center gap-2.5">
          <Icon className={cn("size-5", style.text)} strokeWidth={1.8} />
          <span className="text-sm font-medium">{label}</span>
        </span>
        <span className={cn("text-2xl font-semibold tabular-nums", style.text)}>
          {count}
        </span>
      </CardContent>
    </Card>
  );
}

function CheckRow({ check }: { check: IntegrityCheck }) {
  const style = STYLE[check.severity] ?? STYLE.OK;
  const Icon = style.icon;
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-xl border p-3", style.cls)}>
      <span className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.text)} />
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">{check.title}</span>
          <span className="text-muted-foreground block text-xs leading-relaxed">
            {check.detail}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {check.issue_count > 0 ? (
          <Badge variant="outline" className={cn("tabular-nums", style.text)}>
            {check.issue_count}
          </Badge>
        ) : (
          <Badge variant="outline">{style.label}</Badge>
        )}
        {check.reference && check.issue_count > 0 ? (
          <Button asChild variant="ghost" size="icon" aria-label="عرض السجلات">
            <Link href={check.reference}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
        ) : null}
      </span>
    </div>
  );
}
