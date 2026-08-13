import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "الإعدادات العامة" };

export default async function BusinessPage() {
  return (
    <SettingsCategoryPage
      category="business"
      title="الإعدادات العامة"
      description="ما يقترحه النظام في الشاشات الجديدة. كلها قابلة للتغيير قبل الحفظ في كل مرة."
      groups={[
        {
          title: "طرق الدفع",
          description: "الطريقة المختارة تظهر مقترحة، ولا تمنع اختيار غيرها.",
          keys: ["default_payment_method"],
        },
        {
          title: "الحسابات الافتراضية",
          description: "تُستخدم عند تسجيل الحركات المالية. التحقق من الحساب يجري في كل الأحوال.",
          keys: ["default_cash_account_id", "default_bank_account_id", "default_expense_category_id"],
        },
      ]}
    />
  );
}
