import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات الإيصالات" };

export default async function ReceiptsPage() {
  return (
    <SettingsCategoryPage
      category="receipts"
      title="إعدادات الإيصالات"
      description="ما يُطبع على إيصال البيع، ونصوص التذييل وسياسة الاسترجاع."
      groups={[
        {
          title: "بيانات المحل",
          keys: ["receipt_show_logo", "receipt_show_phone", "receipt_show_address"],
        },
        {
          title: "بيانات الفاتورة",
          keys: ["receipt_show_customer_name", "receipt_show_customer_phone", "receipt_show_payment_method", "receipt_show_salesperson"],
        },
        {
          title: "النصوص",
          keys: ["receipt_show_return_policy", "receipt_footer_ar", "return_policy_ar", "return_policy_en"],
        },
      ]}
    />
  );
}
