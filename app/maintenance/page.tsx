import type { Metadata } from "next";
import { Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStoreSettings } from "@/lib/settings/queries";

export const metadata: Metadata = { title: "النظام تحت الصيانة" };

/**
 * Where non-administrators land while maintenance mode is on (§69).
 *
 * Outside the dashboard layout on purpose: that layout is what redirects here,
 * and a page inside it would bounce between the two forever.
 */
export default async function MaintenancePage() {
  const store = await getStoreSettings();

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-5 text-center">
        <span className="bg-accent text-accent-foreground mx-auto flex size-14 items-center justify-center rounded-2xl">
          <Wrench className="size-7" strokeWidth={1.6} />
        </span>
        <h1 className="text-2xl font-semibold">النظام تحت الصيانة</h1>
        <p className="text-muted-foreground leading-relaxed">
          {store?.store_name ?? "النظام"} متوقف مؤقتاً لأعمال صيانة. يرجى
          المحاولة بعد قليل، أو التواصل مع مسؤول النظام إذا استمر الأمر.
        </p>
        <Button asChild variant="outline">
          <a href="/dashboard">إعادة المحاولة</a>
        </Button>
      </div>
    </main>
  );
}
