import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Landmark, Wallet } from "lucide-react";

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
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountDialog } from "@/components/finance/account-dialog";
import { AdjustmentDialog } from "@/components/finance/adjustment-dialog";
import { TransferDialog } from "@/components/finance/transfer-dialog";
import { requirePermission } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/permissions/check-permission";
import { listAccountBalances } from "@/lib/finance/queries";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { ACCOUNT_TYPE_LABELS } from "@/types/finance";

export const metadata: Metadata = { title: "الحسابات المالية" };

export default async function AccountsPage() {
  const { profile } = await requirePermission("VIEW_ACCOUNTS");

  const accounts = await listAccountBalances();
  const canCreate = hasPermission(profile, "CREATE_ACCOUNT");
  const canEdit = hasPermission(profile, "UPDATE_ACCOUNT");
  const canTransfer = hasPermission(profile, "CREATE_TRANSFER");
  const canAdjust = hasPermission(profile, "CREATE_FINANCIAL_ADJUSTMENT");
  const cash = accounts
    .filter((a) => a.account_type === "CASH" && a.is_active)
    .reduce((sum, a) => sum + Number(a.balance), 0);
  const bank = accounts
    .filter((a) => a.account_type === "BANK" && a.is_active)
    .reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحسابات المالية"
        description="أين يوجد مال المحل — صندوق نقدي وحسابات بنكية."
        actions={
          <>
            {canTransfer ? <TransferDialog accounts={accounts} /> : null}
            {canAdjust ? <AdjustmentDialog accounts={accounts} /> : null}
            {canCreate ? <AccountDialog /> : null}
          </>
        }
      />

      <section aria-label="الأرصدة" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="الرصيد النقدي" icon={Wallet} accent value={formatMoney(cash)} hint="مجموع حسابات الصندوق" />
        <StatCard label="الرصيد البنكي" icon={Landmark} value={formatMoney(bank)} hint="مجموع الحسابات البنكية" />
        <StatCard label="الإجمالي" icon={Banknote} value={formatMoney(cash + bank)} hint="نقد + بنك" />
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الحسابات</CardTitle>
          <CardDescription>
            كل رصيد محسوب من سجل الحركات المالية. الرصيد الافتتاحي نفسه حركة
            مسجّلة، فلا يمكن للرصيد أن يخالف تاريخه.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="لا توجد حسابات"
              description="أضف حساب صندوق وحساباً بنكياً للبدء."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">الرقم</TableHead>
                    <TableHead className="text-start">الحساب</TableHead>
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الرصيد الافتتاحي</TableHead>
                    <TableHead className="text-start">الوارد</TableHead>
                    <TableHead className="text-start">الصادر</TableHead>
                    <TableHead className="text-start">الرصيد الحالي</TableHead>
                    <TableHead className="text-start">الحالة</TableHead>
                    <TableHead className="text-start">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.account_id}>
                      <TableCell className="text-sm">
                        <bdi className="block text-right">{account.account_number}</bdi>
                      </TableCell>
                      <TableCell className="font-medium">
                        {account.name}
                        {account.is_default ? (
                          <Badge variant="outline" className="ms-2 font-normal">
                            افتراضي
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ACCOUNT_TYPE_LABELS[account.account_type]}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatMoney(account.opening_balance)}
                      </TableCell>
                      <TableCell className="text-success text-sm">
                        {formatMoney(account.total_in)}
                      </TableCell>
                      <TableCell className="text-destructive text-sm">
                        {formatMoney(account.total_out)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-medium",
                          Number(account.balance) < 0 && "text-destructive",
                        )}
                      >
                        {formatMoney(account.balance)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            account.is_active
                              ? "bg-success/10 text-success border-success/25"
                              : "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {account.is_active ? "مفعّل" : "معطّل"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/finance/accounts/${account.account_id}`}>
                              كشف الحساب
                            </Link>
                          </Button>
                          {canEdit ? <AccountDialog account={account} /> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
