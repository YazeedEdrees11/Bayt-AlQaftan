import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات المرتجعات" };

export default async function ReturnsPage() {
  return (
    <SettingsCategoryPage
      category="returns"
      title="إعدادات المرتجعات"
      description="مدة الاسترجاع وطرق الاسترداد المتاحة. المرتجعات المسجّلة سابقاً لا تتأثر بأي تغيير هنا."
      groups={[
        {
          title: "القبول",
          keys: ["allow_returns", "maximum_return_days", "allow_damaged_returns"],
        },
        {
          title: "ما يجب إدخاله",
          keys: ["require_return_reason", "require_return_condition"],
        },
        {
          title: "طرق الاسترداد",
          description: "إغلاق طريقة يمنع استخدامها في مرتجع جديد فقط.",
          keys: ["allow_cash_refund", "allow_bank_refund", "allow_customer_credit_refund"],
        },
      ]}
    />
  );
}
