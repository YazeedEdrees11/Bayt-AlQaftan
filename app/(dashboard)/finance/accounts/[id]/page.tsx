import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ChevronRight } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/require-auth";
import { getAccountById, getAccountLedger } from "@/lib/finance/queries";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { ACCOUNT_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/types/finance";

export const metadata: Metadata = { title: "كشف الحساب" };

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("VIEW_ACCOUNTS");
  const { id } = await params;

  const account = await getAccountById(id);
  if (!account) notFound();

  const ledger = await getAccountLedger(id, 200);

  return (
    <div className="space-y-6">
      <PageHeader
        title={account.name}
        description={`${ACCOUNT_TYPE_LABELS[account.account_type]} · ${account.account_number}`}
        actions={
          <Button asChild variant="ghost">
            <Link href="/finance/accounts">
              <ChevronRight className="size-4" />
              الحسابات
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-normal">
          {ACCOUNT_TYPE_LABELS[account.account_type]}
        </Badge>
        {account.is_default ? (
          <Badge variant="outline" className="font-normal">
            افتراضي
          </Badge>
        ) : null}
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
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الرصيد الافتتاحي</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(account.opening_balance)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الوارد</CardDescription>
            <CardTitle className="text-success text-2xl tabular-nums">
              {formatMoney(account.total_in)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الصادر</CardDescription>
            <CardTitle className="text-destructive text-2xl tabular-nums">
              {formatMoney(account.total_out)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>الرصيد الحالي</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl tabular-nums",
                Number(account.balance) < 0 && "text-destructive",
              )}
            >
              {formatMoney(account.balance)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>حركة الحساب</CardTitle>
          <CardDescription>
            مرتّبة من الأقدم للأحدث ليقرأ عمود الرصيد كما يقرأ كشف البنك.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="لا توجد حركات"
              description="لم تُسجَّل أي حركة مالية على هذا الحساب بعد."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">التاريخ</TableHead>
                    <TableHead className="text-start">الرقم</TableHead>
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الوصف</TableHead>
                    <TableHead className="text-start">وارد</TableHead>
                    <TableHead className="text-start">صادر</TableHead>
                    <TableHead className="text-start">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(row.transaction_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <bdi className="block text-right">{row.transaction_number}</bdi>
                      </TableCell>
                      <TableCell className="text-sm">
                        {TRANSACTION_TYPE_LABELS[row.transaction_type]}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[18rem] truncate text-sm">
                        {row.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-success text-sm">
                        {Number(row.money_in) > 0 ? formatMoney(row.money_in) : "—"}
                      </TableCell>
                      <TableCell className="text-destructive text-sm">
                        {Number(row.money_out) > 0 ? formatMoney(row.money_out) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-medium tabular-nums",
                          Number(row.running_balance) < 0 && "text-destructive",
                        )}
                      >
                        {formatMoney(row.running_balance)}
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
