import { History } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  isIncomingTransaction,
  TRANSACTION_TYPE_LABELS,
  type InventoryTransactionWithActor,
} from "@/types/catalog";

/**
 * The variant's stock ledger.
 *
 * Purchases, sales and returns will appear here too once those modules land —
 * they are already valid transaction types, just not yet written by any UI.
 */
export function InventoryHistory({
  transactions,
}: {
  transactions: InventoryTransactionWithActor[];
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>حركة المخزون</CardTitle>
        <CardDescription>
          سجل كامل وغير قابل للتعديل لكل حركة على هذا الموديل.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <EmptyState
            icon={History}
            title="لا توجد حركات"
            description="لم تُسجَّل أي حركة مخزون على هذا الموديل حتى الآن."
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">التاريخ</TableHead>
                  <TableHead className="text-start">نوع الحركة</TableHead>
                  <TableHead className="text-start">الكمية</TableHead>
                  <TableHead className="text-start">المرجع</TableHead>
                  <TableHead className="text-start">السبب</TableHead>
                  <TableHead className="text-start">المستخدم</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {transactions.map((transaction) => {
                  const incoming = isIncomingTransaction(
                    transaction.transaction_type,
                  );

                  return (
                    <TableRow key={transaction.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDateTime(transaction.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            incoming
                              ? "bg-success/10 text-success border-success/25"
                              : "bg-destructive/10 text-destructive border-destructive/25",
                          )}
                        >
                          {TRANSACTION_TYPE_LABELS[transaction.transaction_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          data-numeric
                          className={cn(
                            "font-semibold tabular-nums",
                            incoming ? "text-success" : "text-destructive",
                          )}
                        >
                          {incoming ? "+" : "−"}
                          {formatNumber(transaction.quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {transaction.reference_type ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-xs text-sm">
                        <span className="line-clamp-2 leading-relaxed">
                          {transaction.notes ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {transaction.actor_name ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
