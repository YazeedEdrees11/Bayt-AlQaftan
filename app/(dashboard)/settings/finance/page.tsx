import type { Metadata } from "next";

import { SettingsCategoryPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "إعدادات المالية" };

export default async function FinancePage() {
  return (
    <SettingsCategoryPage
      category="finance"
      title="إعدادات المالية"
      description="ما يقبله دفتر المال. التسويات اليدوية معطّلة افتراضياً لأنها تكتب في الدفتر مباشرة."
      groups={[
        {
          title: "الحسابات",
          keys: ["allow_negative_account_balance"],
        },
        {
          title: "المصاريف",
          keys: ["require_expense_category", "require_expense_receipt"],
        },
        {
          title: "التحويلات والتسويات",
          keys: ["require_transfer_notes", "allow_financial_adjustments", "require_financial_adjustment_reason"],
        },
      ]}
    />
  );
}
