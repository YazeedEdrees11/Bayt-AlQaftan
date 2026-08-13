import type { Metadata } from "next";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/require-auth";
import { getSettingsByCategory } from "@/lib/settings/queries";
import { NUMBERING_LABELS, type NumberingSettings } from "@/types/settings";

export const metadata: Metadata = { title: "ترقيم المستندات" };

export default async function NumberingPage() {
  await requirePermission("MANAGE_SETTINGS");
  const settings = await getSettingsByCategory("numbering");

  // The label for each prefix is the document it belongs to; the hint shows
  // what the next number will look like, which is the only thing anyone
  // actually wants to know before changing it.
  const copy = Object.fromEntries(
    settings.map((setting) => {
      const label = NUMBERING_LABELS[setting.key as keyof NumberingSettings] ?? setting.key;
      const prefix = String(setting.value ?? "");
      return [
        setting.key,
        { label, hint: `المستند التالي: ${prefix}000001 وما بعده` },
      ];
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="ترقيم المستندات"
        description="بادئة أرقام كل نوع من المستندات. حروف لاتينية وأرقام فقط، ولا يجوز تكرار البادئة بين نوعين."
      />

      <p className="border-border/70 bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-sm leading-relaxed">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        تغيير البادئة يسري على المستندات الجديدة فقط. المستندات الصادرة سابقاً
        تحتفظ بأرقامها كما هي — الفاتورة التي سُلّمت للعميل باسم SAL-000123 تبقى
        SAL-000123 — والتسلسل يكمل من حيث وصل ولا يبدأ من جديد.
      </p>

      <Card>
        <CardContent className="pt-6">
          <SettingsForm
            settings={settings}
            copy={copy}
            groups={[
              {
                title: "البيع والشراء",
                keys: ["prefix_sale", "prefix_purchase", "prefix_customer"],
              },
              {
                title: "المرتجعات والمخزون",
                keys: ["prefix_return", "prefix_exchange", "prefix_adjustment"],
              },
              {
                title: "المالية",
                keys: [
                  "prefix_expense",
                  "prefix_account",
                  "prefix_financial",
                  "prefix_transfer",
                  "prefix_closing",
                  "prefix_financial_adjustment",
                ],
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
