import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinanceRangePicker } from "@/components/finance/finance-range-picker";
import { Badge } from "@/components/ui/badge";
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
import { listFinancialTransactions } from "@/lib/finance/queries";
import { normalizePage, normalizePageSize } from "@/lib/catalog/config";
import { isDatePreset, resolveDateRange } from "@/lib/sales/date-range";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { DIRECTION_LABELS, TRANSACTION_TYPE_LABELS } from "@/types/finance";

export const metadata: Metadata = { title: "الحركات المالية" };

/** Where a movement came from, so the row can link back to its source (§75). */
const SOURCE_LINKS: Record<string, (id: string) => string> = {
  SALE_PAYMENT: (id) => `/sales?q=${id}`,
  PURCHASE_PAYMENT: (id) => `/purchases?q=${id}`,
  RETURN_REFUND: (id) => `/returns?q=${id}`,
  EXCHANGE: (id) => `/exchanges/${id}`,
  EXPENSE: (id) => `/expenses/${id}`,
};

export default async function FinancialTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; range?: string; from?: string; to?: string;
    account?: string; type?: string; direction?: string;
    page?: string; perPage?: string;
  }>;
}) {
  await requirePermission("VIEW_FINANCIAL_TRANSACTIONS");
  const params = await searchParams;

  const preset = isDatePreset(params.range) ? params.range : "month";
  const range = resolveDateRange(preset, { from: params.from, to: params.to });

  const data = await listFinancialTransactions({
    search: params.q,
    accountId: params.account,
    type: params.type ?? "ALL",
    direction: params.direction ?? "ALL",
    from: range.from,
    to: range.to,
    page: normalizePage(params.page),
    perPage: normalizePageSize(params.perPage),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحركات المالية"
        description="سجل حركة النقد والبنك. كل حركة تشير إلى العملية التي سبّبتها."
        actions={<FinanceRangePicker />}
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>الحركات</CardTitle>
          <CardDescription>
            هذا السجل غير قابل للتعديل أو الحذف — التصحيح يتم بحركة عكسية.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {data.rows.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="لا توجد حركات مالية"
              description="لم تُسجَّل أي حركة ضمن هذه الفترة."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-start">الرقم</TableHead>
                    <TableHead className="text-start">التاريخ</TableHead>
                    <TableHead className="text-start">النوع</TableHead>
                    <TableHead className="text-start">الحساب</TableHead>
                    <TableHead className="text-start">الاتجاه</TableHead>
                    <TableHead className="text-start">المبلغ</TableHead>
                    <TableHead className="text-start">الوصف</TableHead>
                    <TableHead className="text-start">المستخدم</TableHead>
                    <TableHead className="text-start">المصدر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => {
                    const link =
                      row.reference_type && row.reference_id
                        ? SOURCE_LINKS[row.reference_type]?.(row.reference_id)
                        : undefined;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm font-medium">
                          <bdi className="block text-right">{row.transaction_number}</bdi>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {formatDate(row.transaction_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {TRANSACTION_TYPE_LABELS[row.transaction_type]}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Link
                            href={`/finance/accounts/${row.account_id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.account_name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-medium",
                              row.direction === "IN"
                                ? "bg-success/10 text-success border-success/25"
                                : "bg-destructive/10 text-destructive border-destructive/25",
                            )}
                          >
                            {DIRECTION_LABELS[row.direction]}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-medium tabular-nums",
                            row.direction === "IN" ? "text-success" : "text-destructive",
                          )}
                        >
                          {row.direction === "IN" ? "+" : "−"} {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[18rem] truncate text-sm">
                          {row.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.created_by_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {link ? (
                            <Link href={link} className="text-primary hover:underline">
                              عرض
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data.total > 0 ? (
            <div className="border-border/70 text-muted-foreground border-t p-4 text-sm">
              {data.total} حركة · صفحة {data.page} من {data.totalPages}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
