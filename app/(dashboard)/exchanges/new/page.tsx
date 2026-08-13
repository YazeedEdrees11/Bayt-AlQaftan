import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ExchangeForm } from "@/components/exchanges/exchange-form";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/require-auth";
import { getReturnableItems, getSaleHeaderForReturn } from "@/lib/returns/queries";
import { getSettingBool } from "@/lib/settings/queries";

export const metadata: Metadata = { title: "إضافة استبدال" };

export default async function NewExchangePage({
  searchParams,
}: {
  searchParams: Promise<{ sale?: string }>;
}) {
  await requirePermission("CREATE_EXCHANGES");
  const params = await searchParams;

  const reasonRequired = await getSettingBool("require_exchange_reason", true);

  const [initialSale, initialItems] = params.sale
    ? await Promise.all([
        getSaleHeaderForReturn(params.sale),
        getReturnableItems(params.sale),
      ])
    : [null, []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="إضافة استبدال"
        description="أعد قطعة واستبدلها بأخرى — يُحتسب الفرق تلقائياً."
        actions={
          <Button asChild variant="outline">
            <Link href="/exchanges">
              <ChevronRight className="size-4" />
              رجوع للاستبدالات
            </Link>
          </Button>
        }
      />

      <ExchangeForm
        initialSale={initialSale}
        initialItems={initialItems}
        reasonRequired={reasonRequired}
      />
    </div>
  );
}
