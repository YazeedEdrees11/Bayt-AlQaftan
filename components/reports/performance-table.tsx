import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { PerformancePeriod } from "@/types/reports";

/**
 * The monthly and yearly performance grids.
 *
 * Both periods carry the same columns because both come from the same finance
 * summary — the only difference is how the rows are cut. Periods with no
 * activity are still rendered, because a blank month is information.
 */
export function PerformanceTable({ rows }: { rows: PerformancePeriod[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        لا توجد بيانات لهذه الفترة.
      </p>
    );
  }

  const totals = rows.reduce(
    (acc, row) => ({
      net_sales: acc.net_sales + Number(row.net_sales),
      gross_profit: acc.gross_profit + Number(row.gross_profit),
      expenses: acc.expenses + Number(row.expenses),
      operating_profit: acc.operating_profit + Number(row.operating_profit),
      net_cash_flow: acc.net_cash_flow + Number(row.net_cash_flow),
    }),
    {
      net_sales: 0, gross_profit: 0, expenses: 0,
      operating_profit: 0, net_cash_flow: 0,
    },
  );

  const peak = Math.max(...rows.map((r) => Math.abs(Number(r.net_sales))), 1);

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader className="bg-card sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-start">الفترة</TableHead>
            <TableHead className="text-start">صافي المبيعات</TableHead>
            <TableHead className="text-start">الربح الإجمالي</TableHead>
            <TableHead className="text-start">المصاريف</TableHead>
            <TableHead className="text-start">الربح التشغيلي</TableHead>
            <TableHead className="text-start">الهامش</TableHead>
            <TableHead className="text-start">صافي النقد</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const netSales = Number(row.net_sales);
            const operating = Number(row.operating_profit);
            const margin = netSales > 0 ? (operating / netSales) * 100 : 0;
            const cash = Number(row.net_cash_flow);
            return (
              <TableRow key={row.period_start}>
                <TableCell className="font-medium">
                  {row.label}
                  {/* A bar in the cell makes the shape of the year readable
                      without a second chart to keep in sync. */}
                  <span
                    aria-hidden
                    className="bg-primary/25 mt-1.5 block h-1 rounded-full"
                    style={{
                      width: `${Math.max(2, (Math.abs(netSales) / peak) * 100)}%`,
                    }}
                  />
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {formatMoney(netSales)}
                </TableCell>
                <TableCell className="text-sm">{formatMoney(row.gross_profit)}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatMoney(row.expenses)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-sm font-medium",
                    operating >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatMoney(operating)}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {netSales > 0 ? formatPercent(margin) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-sm",
                    cash >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {formatMoney(cash)}
                </TableCell>
              </TableRow>
            );
          })}

          <TableRow className="bg-muted/40 hover:bg-muted/40 font-medium">
            <TableCell>الإجمالي</TableCell>
            <TableCell>{formatMoney(totals.net_sales)}</TableCell>
            <TableCell>{formatMoney(totals.gross_profit)}</TableCell>
            <TableCell>{formatMoney(totals.expenses)}</TableCell>
            <TableCell
              className={
                totals.operating_profit >= 0 ? "text-success" : "text-destructive"
              }
            >
              {formatMoney(totals.operating_profit)}
            </TableCell>
            <TableCell className="tabular-nums">
              {totals.net_sales > 0
                ? formatPercent((totals.operating_profit / totals.net_sales) * 100)
                : "—"}
            </TableCell>
            <TableCell
              className={totals.net_cash_flow >= 0 ? "text-success" : "text-destructive"}
            >
              {formatMoney(totals.net_cash_flow)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
