import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ExpenseForm } from "@/components/finance/expense-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { listActiveAccounts, listExpenseCategories } from "@/lib/finance/queries";

export const metadata: Metadata = { title: "إضافة مصروف" };

export default async function NewExpensePage() {
  await requirePermission("CREATE_EXPENSE");

  const [categories, accounts] = await Promise.all([
    listExpenseCategories(),
    listActiveAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة مصروف"
        description="سيتم خصم المبلغ من الحساب المختار وتسجيل حركة مالية صادرة."
        actions={
          <Button asChild variant="outline">
            <Link href="/expenses">
              <ChevronRight className="size-4" />
              رجوع للمصاريف
            </Link>
          </Button>
        }
      />

      <ExpenseForm categories={categories} accounts={accounts} />
    </div>
  );
}
