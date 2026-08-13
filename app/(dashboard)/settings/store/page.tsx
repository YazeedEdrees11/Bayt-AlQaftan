import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { StoreForm } from "@/components/settings/store-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { getStoreSettings } from "@/lib/settings/queries";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_TIMEZONE } from "@/lib/utils/format";

export const metadata: Metadata = { title: "بيانات المحل" };

export default async function StoreSettingsPage() {
  const { profile } = await requirePermission("MANAGE_SETTINGS");
  const store = await getStoreSettings();

  if (!store) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground text-sm">تعذر قراءة بيانات المحل.</p>
        </CardContent>
      </Card>
    );
  }

  // The bucket is public for reads so the logo can be printed on receipts, so
  // a plain URL is enough — no signing, nothing to expire.
  let logoUrl: string | null = null;
  if (store.logo_path) {
    const supabase = await createClient();
    logoUrl = supabase.storage.from("store-assets").getPublicUrl(store.logo_path).data.publicUrl;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="بيانات المحل"
        description="اسم المحل وبيانات التواصل والعملة. تظهر هذه البيانات على الإيصالات والتقارير المطبوعة."
      />
      <Card>
        <CardContent className="pt-6">
          <StoreForm
            store={store}
            logoUrl={logoUrl}
            canEdit={hasPermission(profile, "MANAGE_SETTINGS")}
            displayTimezone={DISPLAY_TIMEZONE}
          />
        </CardContent>
      </Card>
    </div>
  );
}
