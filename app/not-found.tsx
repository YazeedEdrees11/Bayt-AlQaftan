import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_ROUTE } from "@/lib/routes";

export default function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-2xl">
            <FileQuestion className="size-7" strokeWidth={1.6} />
          </span>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              الصفحة غير موجودة
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              الرابط الذي فتحته غير صحيح أو تم نقل الصفحة.
            </p>
          </div>
          <Button asChild className="mt-2">
            <Link href={DEFAULT_ROUTE}>العودة إلى الرئيسية</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
