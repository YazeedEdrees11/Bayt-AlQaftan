import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات المبيعات" };

export default async function SalesPage() {
  return (
    <SettingsCategoryPage
      category="sales"
      title="إعدادات المبيعات"
      description="حدود الخصم وقواعد البيع الآجل والإلغاء. جميعها مفروضة على مستوى قاعدة البيانات، لا الواجهة."
      groups={[
        {
          title: "الخصم",
          description: "الحد الأقصى نسبة من قيمة الفاتورة، ويُرفض تجاوزه أياً كان مصدر الطلب.",
          keys: ["allow_manual_discount", "default_discount_percent", "maximum_discount_percent"],
        },
        {
          title: "العملاء",
          keys: ["allow_walk_in_sales", "require_customer_for_credit"],
        },
        {
          title: "التعديل والإلغاء",
          keys: ["allow_editing_completed_sale", "allow_sale_cancellation", "require_cancellation_reason"],
        },
      ]}
    />
  );
}
