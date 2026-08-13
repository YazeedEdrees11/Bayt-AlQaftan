import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Landmark } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requirePermission } from "@/lib/auth/require-auth";
import { listAccountBalances } from "@/lib/finance/queries";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "الحسابات البنكية" };

export default async function BanksPage() {
  await requirePermission("VIEW_ACCOUNTS");

  const accounts = await listAccountBalances();
  const banks = accounts.filter((account) => account.account_type === "BANK");
  const total = banks
    .filter((account) => account.is_active)
    .reduce((sum, account) => sum + Number(account.balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحسابات البنكية"
        description="كل حساب بنكي برصيده المستقل."
        actions={
          <Button asChild variant="outline">
            <Link href="/finance/accounts">
              <ChevronRight className="size-4" />
              كل الحسابات
            </Link>
          </Button>
        }
      />

      {banks.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Landmark}
              title="لا توجد حسابات بنكية"
              description="أضف حساباً بنكياً لمتابعة التحويلات."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription>إجمالي الأرصدة البنكية</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {formatMoney(total)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {banks.filter((b) => b.is_active).length} حساب مفعّل
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {banks.map((account) => (
              <Card key={account.account_id} className={cn(!account.is_active && "opacity-60")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{account.name}</CardTitle>
                      <CardDescription>
                        <bdi>{account.account_number}</bdi>
                      </CardDescription>
                    </div>
                    {account.is_default ? (
                      <Badge variant="outline" className="font-normal">
                        افتراضي
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5 text-sm">
                  <Row label="الرصيد الافتتاحي" value={formatMoney(account.opening_balance)} />
                  <Row label="الوارد" value={formatMoney(account.total_in)} tone="positive" />
                  <Row label="الصادر" value={formatMoney(account.total_out)} tone="negative" />
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="font-medium">الرصيد الحالي</span>
                    <span
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        Number(account.balance) < 0 && "text-destructive",
                      )}
                    >
                      {formatMoney(account.balance)}
                    </span>
                  </div>
                  <Button asChild variant="outline" className="mt-2 w-full">
                    <Link href={`/finance/accounts/${account.account_id}`}>كشف الحساب</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
