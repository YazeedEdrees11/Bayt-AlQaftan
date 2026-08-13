import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات المخزون" };

export default async function InventoryPage() {
  return (
    <SettingsCategoryPage
      category="inventory"
      title="إعدادات المخزون"
      description="قواعد الجرد والتعديلات. المخزون السالب على وجه الخصوص يغيّر ما يقبله النظام عند البيع."
      groups={[
        {
          title: "الأرصدة",
          keys: ["default_minimum_stock", "allow_negative_stock", "track_damaged_stock"],
        },
        {
          title: "تعديلات المخزون",
          description: "ما يجب إدخاله عند تصحيح رصيد يدوياً.",
          keys: ["require_adjustment_reason", "require_adjustment_notes", "require_adjustment_approval"],
        },
      ]}
    />
  );
}
