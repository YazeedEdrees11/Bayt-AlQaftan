import type { Metadata } from "next";
import { Mail, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { RoleBadge, StatusBadge } from "@/components/shared/role-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/require-auth";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "الملف الشخصي" };

export default async function ProfilePage() {
  const { profile } = await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="الملف الشخصي"
        description="تعديل بياناتك الشخصية. الدور وحالة الحساب يديرهما مدير النظام فقط."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>البيانات الشخصية</CardTitle>
            <CardDescription>
              يمكنك تعديل اسمك وصورتك الشخصية.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profile} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>معلومات الحساب</CardTitle>
            <CardDescription>بيانات لا يمكن تعديلها من هنا.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <Mail className="size-3.5" />
                البريد الإلكتروني
              </p>
              {/* See users-table: <bdi> is dir="auto", so alignment is explicit. */}
              <bdi className="block text-right text-sm font-medium">
                {profile.email}
              </bdi>
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                <ShieldCheck className="size-3.5" />
                الدور
              </p>
              <RoleBadge role={profile.role} />
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">
                حالة الحساب
              </p>
              <StatusBadge isActive={profile.is_active} />
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">
                تاريخ الإنشاء
              </p>
              <p className="text-sm">{formatDate(profile.created_at)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
