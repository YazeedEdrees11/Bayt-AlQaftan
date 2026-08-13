import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات الاستبدال" };

export default async function ExchangesPage() {
  return (
    <SettingsCategoryPage
      category="exchanges"
      title="إعدادات الاستبدال"
      description="مدة الاستبدال وكيفية التعامل مع فرق السعر."
      groups={[
        {
          title: "القبول",
          keys: ["allow_exchanges", "maximum_exchange_days", "require_exchange_reason"],
        },
        {
          title: "فرق السعر",
          keys: ["allow_customer_pays_difference", "allow_customer_receives_difference"],
        },
      ]}
    />
  );
}
