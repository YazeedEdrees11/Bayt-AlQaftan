import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { SETTINGS_NAV } from "@/lib/settings/navigation";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "الإعدادات" };

/**
 * The settings home.
 *
 * Every section the user may open, with the sentence that says what it changes.
 * Sections are filtered by permission here and each page guards itself again on
 * arrival — hiding a card is presentation, not access control (§78, §92).
 */
export default async function SettingsPage() {
  const { profile } = await requireAuth();

  const sections = SETTINGS_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasPermission(profile, item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعدادات"
        description="ما يمكن تغييره في سلوك النظام دون تعديل الشيفرة. كل إعداد يؤثر على قواعد العمل مفروض على الخادم، لا على الشاشة فقط."
      />

      {sections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">
              لا توجد إعدادات متاحة لصلاحياتك.
            </p>
          </CardContent>
        </Card>
      ) : (
        sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "border-border/70 hover:border-primary/40 hover:bg-accent/50",
                      "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                    )}
                  >
                    <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-medium">{item.label}</span>
                      <span className="text-muted-foreground block text-xs leading-relaxed">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
