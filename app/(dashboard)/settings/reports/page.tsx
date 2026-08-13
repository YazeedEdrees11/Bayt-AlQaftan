import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات التقارير" };

export default async function ReportsPage() {
  return (
    <SettingsCategoryPage
      category="reports"
      title="إعدادات التقارير"
      description="ما تفتح عليه التقارير، وما يظهر في لوحة الإدارة. الصلاحيات تبقى هي الفاصل في من يرى ماذا."
      groups={[
        {
          title: "الافتراضيات",
          keys: ["default_report_range", "default_rows_per_page", "default_export_format"],
        },
        {
          title: "لوحة الإدارة",
          description: "إخفاء رقم هنا يخفيه عمّن يملك صلاحيته أصلاً؛ لا يمنح أحداً حق رؤيته.",
          keys: ["show_profit_on_dashboard", "show_customer_debt", "show_supplier_debt"],
        },
      ]}
    />
  );
}
