import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

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
import { ACCESS_DENIED_ROUTE, requireAuth } from "@/lib/auth/require-auth";
import { isAdmin } from "@/lib/permissions/check-permission";
import { assessReadiness } from "@/lib/settings/readiness";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "جاهزية الإنتاج" };

const STATUS = {
  PASS: { icon: CheckCircle2, text: "text-success", ring: "border-success/30 bg-success/5", label: "سليم" },
  WARNING: { icon: TriangleAlert, text: "text-warning", ring: "border-warning/40 bg-warning/5", label: "تحذير" },
  FAIL: { icon: OctagonAlert, text: "text-destructive", ring: "border-destructive/40 bg-destructive/5", label: "غير سليم" },
} as const;

export default async function ReadinessPage() {
  const { profile } = await requireAuth();
  if (!isAdmin(profile)) redirect(ACCESS_DENIED_ROUTE);

  const { areas, ready, checkedAt } = await assessReadiness();
  const blocking = areas.filter((a) => a.critical && a.status === "FAIL");

  return (
    <div className="space-y-6">
      <PageHeader
        title="جاهزية الإنتاج"
        description="سبعة مجالات وحكم واحد. مجال حرج واحد غير سليم يكفي لأن يكون النظام غير جاهز — لا يُعوَّض بنجاح البقية."
        actions={
          <Button asChild variant="ghost">
            <Link href="/settings/system">
              <ChevronLeft className="size-4 rotate-180" />
              النظام
            </Link>
          </Button>
        }
      />

      <Card
        className={cn(
          "border-2",
          ready ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
        )}
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
          <span className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-12 items-center justify-center rounded-2xl",
                ready ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              {ready ? (
                <ShieldCheck className="size-6" strokeWidth={1.8} />
              ) : (
                <OctagonAlert className="size-6" strokeWidth={1.8} />
              )}
            </span>
            <span>
              <span className="block text-2xl font-semibold">
                {ready ? "جاهز للإنتاج" : "غير جاهز"}
              </span>
              <span className="text-muted-foreground block text-sm">
                {blocking.length > 0
                  ? `يمنعه: ${blocking.map((a) => a.label).join("، ")}`
                  : "لا توجد مشاكل حرجة"}
              </span>
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            آخر فحص {formatDateTime(checkedAt)}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المجالات</CardTitle>
          <CardDescription>
            المجالات الحرجة تمنع الجاهزية؛ غيرها يُعرض للمراجعة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {areas.map((area) => {
            const style = STATUS[area.status];
            const Icon = style.icon;
            return (
              <div
                key={area.key}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-xl border p-3",
                  area.status === "PASS" ? "border-border/70" : style.ring,
                )}
              >
                <span className="flex min-w-0 items-start gap-2.5">
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", style.text)} />
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {area.label}
                      {area.critical ? (
                        <Badge variant="outline" className="text-[0.65rem]">
                          حرج
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground block text-xs leading-relaxed">
                      {area.detail}
                    </span>
                  </span>
                </span>
                <Badge variant="outline" className={style.text}>
                  {style.label}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ما لا تستطيع هذه الصفحة قوله</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>
            <strong className="text-foreground">النسخ الاحتياطي:</strong> تديره
            بنية الاستضافة، ولا شيء في هذا النظام ينفّذه أو يراقبه. الحقل الظاهر
            هنا يملؤه المسؤول بعد التحقق من نسخة فعلية — ولا يُعتبر دليلاً على
            وجودها.
          </p>
          <p>
            <strong className="text-foreground">المراقبة:</strong> لا توجد خدمة
            تتبّع أخطاء مربوطة. الأخطاء تُسجَّل على الخادم بمعرّف طلب، ونقطة
            <code className="mx-1" dir="ltr">/api/health</code>
            متاحة لمراقبة خارجية.
          </p>
          <p>
            ادّعاء أي منهما هنا كان سيكون أسوأ من غيابه، لأن الاعتماد عليه يبدأ
            من الادّعاء.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
