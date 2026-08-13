import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { AlertThresholdsForm } from "@/components/settings/alert-thresholds-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { getSettingsByCategory } from "@/lib/settings/queries";
import { getReportSettings } from "@/lib/reports/queries";
import { SETTINGS_COPY } from "@/lib/settings/copy";

export const metadata: Metadata = { title: "إعدادات التنبيهات" };

export default async function NotificationSettingsPage() {
  await requirePermission("MANAGE_SETTINGS");

  const [settings, thresholds] = await Promise.all([
    getSettingsByCategory("notifications"),
    getReportSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إعدادات التنبيهات"
        description="أي التنبيهات تعمل، وعند أي حد ترتفع. التنبيهات تُولَّد على الخادم من نفس القواعد التي تقرأها التقارير."
        actions={
          <Button asChild variant="outline">
            <Link href="/notifications">
              <Bell className="size-4" />
              مركز التنبيهات
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>التنبيهات المفعّلة</CardTitle>
          <CardDescription>
            إيقاف تنبيه يمنع رفعه من جديد؛ التنبيهات المرفوعة سابقاً تبقى في
            المركز حتى تُقرأ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            settings={settings}
            copy={SETTINGS_COPY}
            groups={[
              {
                title: "المخزون",
                keys: ["notify_low_stock", "notify_out_of_stock"],
              },
              {
                title: "الذمم",
                keys: ["notify_customer_debt", "notify_supplier_debt"],
              },
              {
                title: "المالية",
                keys: [
                  "notify_high_expenses",
                  "notify_cash_difference",
                  "cash_difference_threshold",
                ],
              },
              {
                title: "المرتجعات",
                keys: ["notify_high_return_rate"],
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حدود التنبيه</CardTitle>
          <CardDescription>
            هذه الأرقام هي نفسها التي تقارن بها لوحة الإدارة وتقاريرها — تُخزَّن
            في مكان واحد حتى لا تختلف شاشتان على متى يبدأ المبلغ بأن يكون مقلقاً.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {thresholds ? (
            <AlertThresholdsForm settings={thresholds} />
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              تعذر قراءة حدود التنبيه.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
