import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Database,
  HardDriveDownload,
  KeyRound,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { getAppConfig, getSettingsByCategory } from "@/lib/settings/queries";
import { checkSystemHealth } from "@/lib/settings/health";
import { getSystemEvents } from "@/lib/settings/queries";
import { BackupVerification } from "@/components/settings/backup-verification";
import { SETTINGS_COPY } from "@/lib/settings/copy";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { HealthState } from "@/types/settings";

export const metadata: Metadata = { title: "النظام" };

const STATE_STYLE: Record<HealthState, { icon: typeof CheckCircle2; className: string; label: string }> = {
  healthy: { icon: CheckCircle2, className: "text-success", label: "سليم" },
  degraded: { icon: TriangleAlert, className: "text-warning", label: "متدهور" },
  down: { icon: ShieldAlert, className: "text-destructive", label: "متوقف" },
};

const CHECK_ICONS: Record<string, typeof Database> = {
  database: Database,
  auth: KeyRound,
  storage: HardDriveDownload,
};

export default async function SystemPage() {
  await requirePermission("MANAGE_SETTINGS");

  const [config, health, settings, events] = await Promise.all([
    getAppConfig(),
    checkSystemHealth(),
    getSettingsByCategory("system"),
    getSystemEvents(24),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="النظام"
        description="حالة النظام وإصداره. لا تُعرض هنا أي مفاتيح أو بيانات اتصال."
      />

      <Card>
        <CardHeader>
          <CardTitle>حالة النظام</CardTitle>
          <CardDescription>
            فحص مباشر لكل خدمة يعتمد عليها النظام، وقت فتح الصفحة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {health.checks.map((check) => {
            const style = STATE_STYLE[check.state];
            const Icon = CHECK_ICONS[check.key] ?? CheckCircle2;
            const StateIcon = style.icon;
            return (
              <div
                key={check.key}
                className="border-border/70 flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{check.label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {check.detail}
                    </span>
                  </span>
                </span>
                <span className={cn("flex shrink-0 items-center gap-1.5 text-sm", style.className)}>
                  <StateIcon className="size-4" />
                  {style.label}
                </span>
              </div>
            );
          })}
          <p className="text-muted-foreground pt-1 text-xs">
            آخر فحص: {formatDateTime(health.checkedAt)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">الإصدار والبيئة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="إصدار التطبيق" value={config?.app_version ?? "—"} />
            <Row label="إصدار قاعدة البيانات" value={config?.schema_version ?? "—"} />
            <Row
              label="البيئة"
              value={
                <Badge variant="outline">{config?.environment ?? "—"}</Badge>
              }
            />
            <p className="text-muted-foreground pt-1 text-xs leading-relaxed">
              الإصدار يُحدَّث مع النشر، لا من هذه الشاشة.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">النسخ الاحتياطي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="آخر نسخة معروفة"
              value={config?.last_backup_at ? formatDateTime(config.last_backup_at) : "غير مسجّلة"}
            />
            <Row label="الحالة" value={config?.backup_status ?? "—"} />
            <p className="text-muted-foreground pt-1 text-xs leading-relaxed">
              النسخ الاحتياطي تديره بنية الاستضافة؛ لا ينفّذه هذا النظام ولا
              يستطيع رؤيته. ما يسجَّل هنا هو تحقق بشري.
            </p>
            <div className="border-border/70 mt-3 border-t pt-3">
              <BackupVerification />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الأحداث الأخيرة</CardTitle>
          <CardDescription>
            أخطاء وأحداث النظام خلال آخر ٢٤ ساعة، بمعرّف الطلب الذي يربط شكوى
            المستخدم بالسطر الذي فشل. لا تُسجَّل أي بيانات أو أسرار.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              لا أحداث مسجّلة خلال آخر ٢٤ ساعة.
            </p>
          ) : (
            events.map((event) => (
              <div
                key={`${event.severity}-${event.category}`}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border p-3",
                  event.severity === "ERROR"
                    ? "border-destructive/40 bg-destructive/5"
                    : event.severity === "WARN"
                      ? "border-warning/40 bg-warning/5"
                      : "border-border/70",
                )}
              >
                <span className="flex items-center gap-2.5 text-sm">
                  <Badge variant="outline">{event.severity}</Badge>
                  {event.category}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {event.event_count} · {formatDateTime(event.latest_at)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سلامة البيانات</CardTitle>
            <CardDescription>
              فحوصات تشخيصية للقراءة فقط ومطابقة مالية.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/settings/system/integrity">تشغيل الفحوصات</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">جاهزية الإنتاج</CardTitle>
            <CardDescription>
              حكم واحد على سبعة مجالات قبل فتح النظام للعمل الحقيقي.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/settings/system/readiness">عرض الجاهزية</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>وضع الصيانة</CardTitle>
          <CardDescription>
            عند التفعيل، يرى غير المسؤولين رسالة «النظام تحت الصيانة» ولا يستطيعون
            استخدام النظام. المسؤولون يواصلون العمل.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            settings={settings}
            copy={SETTINGS_COPY}
            groups={[{ title: "", keys: ["maintenance_mode", "locale"] }]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
