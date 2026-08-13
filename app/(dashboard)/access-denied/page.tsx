import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RoleBadge } from "@/components/shared/role-badge";
import { requireAuth } from "@/lib/auth/require-auth";
import { DEFAULT_ROUTE } from "@/lib/routes";

export const metadata: Metadata = {
  title: "لا توجد صلاحية",
};

/** Where the server-side permission guards land an unauthorised user. */
export default async function AccessDeniedPage() {
  const { profile } = await requireAuth();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="bg-destructive/10 text-destructive flex size-16 items-center justify-center rounded-2xl">
            <ShieldAlert className="size-7" strokeWidth={1.6} />
          </span>

          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              ليس لديك صلاحية للوصول إلى هذه الصفحة
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع مدير النظام لتعديل
              صلاحياتك.
            </p>
          </div>

          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span>دورك الحالي:</span>
            <RoleBadge role={profile.role} />
          </div>

          <Button asChild className="mt-2">
            <Link href={DEFAULT_ROUTE}>العودة إلى الرئيسية</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
