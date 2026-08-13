import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات المشتريات" };

export default async function PurchasesPage() {
  return (
    <SettingsCategoryPage
      category="purchases"
      title="إعدادات المشتريات"
      description="قواعد فواتير الشراء والاستلام."
      groups={[
        {
          title: "الفاتورة",
          keys: ["require_supplier", "default_purchase_payment_method", "allow_purchase_editing"],
        },
        {
          title: "الاستلام والإلغاء",
          keys: ["allow_partial_receiving", "require_purchase_cancellation_reason"],
        },
      ]}
    />
  );
}
