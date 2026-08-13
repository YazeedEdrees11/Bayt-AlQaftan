import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { AdjustmentForm } from "@/components/inventory/adjustment-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";

export const metadata: Metadata = { title: "تعديل مخزون جديد" };

export default async function NewAdjustmentPage() {
  await requirePermission("CREATE_INVENTORY_ADJUSTMENTS");

  return (
    <div className="space-y-6">
      <PageHeader
        title="تعديل مخزون جديد"
        description="أدخل الكمية الفعلية بعد الجرد — يُحتسب الفرق تلقائياً."
        actions={
          <Button asChild variant="outline">
            <Link href="/inventory/adjustments">
              <ChevronRight className="size-4" />
              رجوع للتعديلات
            </Link>
          </Button>
        }
      />

      <AdjustmentForm />
    </div>
  );
}
